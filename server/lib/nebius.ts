import { z } from 'zod';
import { getConfig, type AppConfig } from '../config';
import { AppError } from './errors';
import { logEvent } from './logger';
import type { RuntimeReceipt } from '../../src/shared/schemas';

interface CompletionRequest {
  operation: 'intake' | 'plan' | 'verification';
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
  maxAttempts?: 1 | 2;
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class NebiusClient {
  constructor(
    private config: AppConfig = getConfig(),
    private fetchImpl: typeof fetch = fetch,
  ) {}

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

  async complete<T>(
    request: CompletionRequest,
    outputSchema: z.ZodType<T>,
  ): Promise<CompletionResult<T>> {
    this.ensureConfigured();
    let lastError: AppError | null = null;
    const maxAttempts = request.maxAttempts ?? 2;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) await wait(350 + Math.floor(Math.random() * 250));
      const startedAt = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
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
          }),
        });

        if (!response.ok) {
          const error = this.providerError(response.status);
          if (attempt < maxAttempts - 1 && error.retryable) {
            lastError = error;
            continue;
          }
          throw error;
        }

        const raw = (await response.json().catch(() => null)) as unknown;
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

        let json: unknown;
        try {
          json = JSON.parse(message.content);
        } catch {
          throw new AppError(
            502,
            'INVALID_MODEL_JSON',
            'The model did not return valid JSON. No claims were accepted.',
            true,
          );
        }
        const output = outputSchema.safeParse(json);
        if (!output.success) {
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
        });
        return { output: output.data, receipt };
      } catch (error) {
        if (error instanceof AppError) {
          if (
            attempt < maxAttempts - 1 &&
            error.retryable &&
            !error.code.startsWith('INVALID_MODEL')
          ) {
            lastError = error;
            continue;
          }
          throw error;
        }
        const timedOut = error instanceof Error && error.name === 'AbortError';
        const providerError = new AppError(
          timedOut ? 504 : 502,
          timedOut ? 'NEBIUS_TIMEOUT' : 'NEBIUS_NETWORK_ERROR',
          timedOut
            ? 'Nebius did not respond before the timeout. Please try again.'
            : 'The Nebius request could not be completed. Please try again.',
          true,
        );
        if (attempt < maxAttempts - 1) {
          lastError = providerError;
          continue;
        }
        throw providerError;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new AppError(502, 'NEBIUS_NETWORK_ERROR', 'Nebius inference failed.', true);
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
