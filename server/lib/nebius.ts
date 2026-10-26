import { z } from 'zod';
import { getConfig, type AppConfig } from '../config';
import { AppError } from './errors';
import { logEvent } from './logger';
import { extractModelJson } from './model-json';
import type { RuntimeReceipt } from '../../src/shared/schemas';

interface CompletionRequest {
  operation: 'intake' | 'plan' | 'verification';
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  // Per-attempt bound for receiving the complete response (headers + body).
  timeoutMs: number;
  // Separate bound for establishing the connection and receiving response
  // headers, so a dead endpoint is reported distinctly from a slow body.
  connectTimeoutMs?: number;
  // Hard wall-clock budget across every attempt including backoff waits. The
  // loop never starts an attempt it cannot finish inside this deadline, which
  // keeps the caller inside its serverless function budget.
  totalTimeoutMs?: number;
  // Bounded number of attempts; clamped to [1, MAX_ATTEMPTS].
  maxAttempts?: number;
}

interface CompletionResult<T> {
  output: T;
  receipt: RuntimeReceipt;
}

const ChatResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable().optional(),
        refusal: z.string().nullable().optional(),
      }),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Retry policy. Only transient transport/provider conditions (timeouts,
// network failures, 429 and 5xx responses — see AppError.retryable) are
// retried; deterministic failures such as auth, quota, malformed model JSON
// or schema mismatches fail on the first attempt and are never re-sent.
const DEFAULT_MAX_ATTEMPTS = 2;
const MAX_ATTEMPTS = 4;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 4_000;
// Do not start another attempt when less than this much of the total deadline
// remains, so a truncated request cannot overrun the serverless budget.
const MIN_REMAINING_ATTEMPT_MS = 1_500;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Exponential backoff with jitter: base * 2^retryIndex, capped, then varied
// by +/-25%. Pure and deterministic given an injected random source, which
// keeps the schedule testable without fake timers.
export function backoffDelayMs(
  retryIndex: number,
  baseMs: number = BACKOFF_BASE_MS,
  capMs: number = BACKOFF_CAP_MS,
  random: () => number = Math.random,
) {
  const exponential = Math.min(capMs, baseMs * 2 ** retryIndex);
  const jitterFactor = 0.75 + random() * 0.5;
  return Math.round(exponential * jitterFactor);
}

export interface NebiusClientAdapters {
  // Injection seams for deterministic tests; production uses real timers.
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export class NebiusClient {
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(
    private config: AppConfig = getConfig(),
    private fetchImpl: typeof fetch = fetch,
    adapters: NebiusClientAdapters = {},
  ) {
    this.sleep = adapters.sleep ?? wait;
    this.random = adapters.random ?? Math.random;
  }

  ensureConfigured() {
    if (!this.config.nebiusApiKey) {
      throw new AppError(
        503,
        'LIVE_INFERENCE_UNAVAILABLE',
        'Live Nebius inference is not configured on this server. Add a server-side NEBIUS_API_KEY; the labelled sample remains available without one.',
        false,
      );
    }
  }

  // Builds the final error after retries are exhausted. The original code and
  // retryable flag are preserved so the UI can still offer "Retry plan", while
  // the message states what happened and that no partial plan was accepted.
  private exhaustedError(
    lastError: AppError | null,
    request: CompletionRequest,
    attempts: number,
    elapsedMs: number,
  ): AppError {
    const base =
      lastError ?? new AppError(502, 'NEBIUS_NETWORK_ERROR', 'Nebius inference failed.', true);
    const reason =
      base.code === 'NEBIUS_CONNECT_TIMEOUT'
        ? 'the connection to Nebius could not be established in time'
        : base.code === 'NEBIUS_TIMEOUT'
          ? 'Nebius did not return a complete response in time'
          : base.code === 'NEBIUS_RATE_LIMIT'
            ? 'Nebius is rate limiting this server'
            : base.code === 'NEBIUS_NETWORK_ERROR'
              ? 'the network connection to Nebius kept failing'
              : 'Nebius stayed temporarily unavailable';
    return new AppError(
      base.status,
      base.code,
      `Nebius did not complete the ${request.operation} request after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${reason}. Retry to send the same request again — submitted intake answers and retrieved sources are retained, and no plan was generated from incomplete data.`,
      base.retryable,
      {
        attempts,
        lastErrorCode: base.code,
        elapsedMs: Math.round(elapsedMs),
      },
    );
  }

  // Maps a thrown transport error to a classified, retryable AppError. Aborts
  // fired by our own timers are distinguished by abortKind; an AbortError from
  // elsewhere keeps the historical NEBIUS_TIMEOUT classification.
  private transportError(abortKind: 'connect' | 'response' | null, error: unknown): AppError {
    const aborted = error instanceof Error && error.name === 'AbortError';
    if (aborted && abortKind === 'connect') {
      return new AppError(
        504,
        'NEBIUS_CONNECT_TIMEOUT',
        'Nebius could not be reached before the connection timeout.',
        true,
      );
    }
    if (aborted) {
      return new AppError(
        504,
        'NEBIUS_TIMEOUT',
        'Nebius did not respond before the timeout.',
        true,
      );
    }
    return new AppError(
      502,
      'NEBIUS_NETWORK_ERROR',
      'The Nebius request could not be completed because the network connection failed.',
      true,
    );
  }

  async complete<T>(
    request: CompletionRequest,
    outputSchema: z.ZodType<T>,
  ): Promise<CompletionResult<T>> {
    this.ensureConfigured();
    const maxAttempts = clamp(request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, 1, MAX_ATTEMPTS);
    const connectTimeoutMs = request.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    // Default total budget only applies when a caller does not pin one; the
    // plan/intake call sites always pass an explicit serverless-aware budget.
    const totalTimeoutMs =
      request.totalTimeoutMs ?? request.timeoutMs * maxAttempts + BACKOFF_CAP_MS;
    const runStartedAt = performance.now();
    let lastError: AppError | null = null;
    let attempt = 0;

    while (attempt < maxAttempts) {
      if (attempt > 0) {
        const delayMs = backoffDelayMs(attempt - 1, BACKOFF_BASE_MS, BACKOFF_CAP_MS, this.random);
        const remainingBeforeSleep = totalTimeoutMs - (performance.now() - runStartedAt);
        if (remainingBeforeSleep - delayMs < MIN_REMAINING_ATTEMPT_MS) break;
        await this.sleep(delayMs);
        if (totalTimeoutMs - (performance.now() - runStartedAt) < MIN_REMAINING_ATTEMPT_MS) break;
      }

      const remainingMs = totalTimeoutMs - (performance.now() - runStartedAt);
      // Only skip when the shared deadline itself is nearly spent; a short
      // caller-chosen per-attempt timeout is still a valid attempt.
      if (remainingMs < MIN_REMAINING_ATTEMPT_MS) break;
      // Each attempt is bounded by both its per-attempt response timeout and
      // the shared total deadline, so retries can never overrun the function.
      const responseTimeoutMs = Math.min(request.timeoutMs, remainingMs);

      const startedAt = performance.now();
      const controller = new AbortController();
      let abortKind: 'connect' | 'response' | null = null;
      const connectTimer = setTimeout(
        () => {
          abortKind = 'connect';
          controller.abort();
        },
        Math.min(connectTimeoutMs, responseTimeoutMs),
      );
      const responseTimer = setTimeout(() => {
        abortKind = 'response';
        controller.abort();
      }, responseTimeoutMs);
      try {
        const response = await this.fetchImpl(`${this.config.nebiusBaseUrl}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.config.nebiusApiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            model: this.config.nebiusModel,
            messages: [
              { role: 'system', content: request.systemPrompt },
              { role: 'user', content: request.userPrompt },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: request.schemaName,
                strict: true,
                schema: request.jsonSchema,
              },
            },
            temperature: 0.1,
            max_tokens: request.maxTokens,
            store: false,
            stream: false,
            // Nemotron-3-Nano defaults to enabled reasoning; the Token Factory
            // chat template emits <think> traces into message.content when it is
            // on, which breaks JSON parsing. Disable it for structured requests
            // (official Token Factory cookbook chat_template_kwargs contract).
            chat_template_kwargs: { enable_thinking: false },
          }),
        });
        // Response headers arrived: the connection phase succeeded; from
        // here only the full-response deadline can abort the body read.
        clearTimeout(connectTimer);

        if (!response.ok) {
          throw this.providerError(response.status);
        }

        const raw = (await response.json().catch(() => null)) as unknown;
        // A body read cut short by our own response timeout must be reported
        // as a timeout (retryable), not as an unreadable provider response.
        if (raw === null && controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const parsedResponse = ChatResponseSchema.safeParse(raw);
        if (!parsedResponse.success) {
          throw new AppError(
            502,
            'INVALID_PROVIDER_RESPONSE',
            'Nebius returned an unreadable response.',
            true,
          );
        }
        const message = parsedResponse.data.choices[0]?.message;
        if (message?.refusal) {
          throw new AppError(
            422,
            'MODEL_REFUSED',
            'The model declined this task. Rephrase it or add clearer sources.',
            false,
          );
        }
        if (!message?.content) {
          throw new AppError(
            502,
            'EMPTY_MODEL_RESPONSE',
            'The model returned no plan content.',
            true,
          );
        }

        // Structured-output enforcement is model-dependent on Token Factory:
        // tolerate reasoning traces, code fences and prose wrappers, but never
        // accept a value that fails the full schema below.
        const extracted = extractModelJson(message.content);
        if (!extracted.ok) {
          // Sanitized diagnostics only: lengths, wrapper counts and strategy
          // names. Never log model text, prompts, or credentials.
          logEvent('nebius_model_json_failed', {
            operation: request.operation,
            content_length: extracted.diagnostics.contentLength,
            truncated: extracted.diagnostics.truncated,
            think_blocks_removed: extracted.diagnostics.thinkBlocksRemoved,
            code_fence_found: extracted.diagnostics.codeFenceFound,
          });
          throw new AppError(
            502,
            'INVALID_MODEL_JSON',
            'The model did not return valid JSON. No claims were accepted.',
            true,
          );
        }
        const output = outputSchema.safeParse(extracted.value);
        if (!output.success) {
          const firstIssue = output.error.issues[0];
          logEvent('nebius_model_schema_failed', {
            operation: request.operation,
            issue_count: output.error.issues.length,
            first_path: firstIssue?.path.join('.') ?? null,
            first_code: firstIssue?.code ?? null,
            parse_strategy: extracted.diagnostics.parseStrategy,
          });
          throw new AppError(
            502,
            'INVALID_MODEL_SCHEMA',
            'The model response did not match the required structure. No claims were accepted.',
            true,
          );
        }

        const usage = parsedResponse.data.usage;
        const inputTokens = usage?.prompt_tokens ?? 0;
        const outputTokens = usage?.completion_tokens ?? 0;
        const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
        const latencyMs = Math.round(performance.now() - startedAt);
        const receipt: RuntimeReceipt = {
          mode: 'live',
          provider: 'nebius',
          model: parsedResponse.data.model ?? this.config.nebiusModel,
          responseId: parsedResponse.data.id ?? null,
          latencyMs,
          usage: usage ? { inputTokens, outputTokens, totalTokens } : null,
          retrieval: { tavilyCalls: 0, directFetches: 0, tavilyRequestIds: [] },
        };
        logEvent('nebius_completion', {
          operation: request.operation,
          model: receipt.model,
          response_id: receipt.responseId,
          latency_ms: latencyMs,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          parse_strategy: extracted.diagnostics.parseStrategy,
          think_blocks_removed: extracted.diagnostics.thinkBlocksRemoved,
        });
        return { output: output.data, receipt };
      } catch (error) {
        const providerError =
          error instanceof AppError ? error : this.transportError(abortKind, error);
        lastError = providerError;
        // Retries stay narrow: transport timeouts/network errors and the
        // explicitly retryable provider responses (429/5xx). Deterministic
        // failures, refusals and invalid model output never re-send.
        const canRetry =
          attempt < maxAttempts - 1 &&
          providerError.retryable &&
          !providerError.code.startsWith('INVALID_MODEL');
        logEvent('nebius_completion_retry', {
          operation: request.operation,
          attempt: attempt + 1,
          code: providerError.code,
          will_retry: canRetry,
        });
        if (!canRetry) {
          throw this.exhaustedError(
            providerError,
            request,
            attempt + 1,
            performance.now() - runStartedAt,
          );
        }
        // Otherwise the next loop iteration applies the backoff, re-checks
        // the total deadline and re-sends the identical request body.
      } finally {
        clearTimeout(connectTimer);
        clearTimeout(responseTimer);
      }
      attempt += 1;
    }
    // The loop ended without a successful response: either every bounded
    // attempt was used, or the total deadline left no room for another one.
    throw this.exhaustedError(lastError, request, attempt, performance.now() - runStartedAt);
  }

  private providerError(status: number) {
    if (status === 401 || status === 403) {
      return new AppError(
        503,
        'NEBIUS_AUTH_FAILED',
        'Nebius rejected the server credential. Check the API key and project access.',
        false,
      );
    }
    if (status === 402) {
      return new AppError(
        503,
        'NEBIUS_QUOTA_EXCEEDED',
        'The Nebius account has insufficient inference credit or quota.',
        false,
      );
    }
    if (status === 404 || status === 400 || status === 422) {
      return new AppError(
        502,
        'NEBIUS_MODEL_OR_REQUEST_UNAVAILABLE',
        'Nebius could not run this model/request. Verify the exact model ID and structured-output support in the account catalog.',
        false,
      );
    }
    if (status === 429) {
      return new AppError(
        429,
        'NEBIUS_RATE_LIMIT',
        'Nebius is rate limiting requests. Please wait and try again.',
        true,
      );
    }
    return new AppError(
      502,
      'NEBIUS_PROVIDER_ERROR',
      'Nebius inference is temporarily unavailable.',
      status >= 500,
    );
  }
}
