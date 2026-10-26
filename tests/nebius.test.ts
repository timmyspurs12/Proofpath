import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AppConfig } from '../server/config';
import { DEFAULT_NEBIUS_MODEL, normalizeNebiusBaseUrl } from '../server/config';
import { NebiusClient, backoffDelayMs } from '../server/lib/nebius';

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nebiusApiKey: 'fixture-only-key',
    nebiusBaseUrl: 'https://api.tokenfactory.nebius.com/v1',
    nebiusModel: DEFAULT_NEBIUS_MODEL,
    tavilyApiKey: null,
    apiPort: 3000,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 20,
    ...overrides,
  };
}

const request = {
  operation: 'verification' as const,
  systemPrompt: 'Return fixture JSON.',
  userPrompt: '{"fixture":true}',
  schemaName: 'fixture',
  jsonSchema: { type: 'object' },
  maxTokens: 100,
  timeoutMs: 1000,
  maxAttempts: 1 as const,
};
const outputSchema = z.object({ ok: z.boolean() }).strict();

function completion(content: string, status = 200) {
  return new Response(
    JSON.stringify({
      id: 'fixture-response',
      model: DEFAULT_NEBIUS_MODEL,
      choices: [{ message: { content, refusal: null } }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('Nebius configuration and transport', () => {
  it('fails closed without a server credential and never calls fetch', async () => {
    const fetchMock = vi.fn();
    const client = new NebiusClient(config({ nebiusApiKey: null }), fetchMock);
    await expect(client.complete(request, outputSchema)).rejects.toMatchObject({
      code: 'LIVE_INFERENCE_UNAVAILABLE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the official endpoint, exact model, bearer credential and JSON schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion('{"ok":true}'));
    const client = new NebiusClient(config(), fetchMock);
    const result = await client.complete(request, outputSchema);
    expect(result.output).toEqual({ ok: true });
    expect(result.receipt).toMatchObject({
      mode: 'live',
      provider: 'nebius',
      responseId: 'fixture-response',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.tokenfactory.nebius.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer fixture-only-key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(DEFAULT_NEBIUS_MODEL);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.store).toBe(false);
  });

  it('retries a transient provider failure once when allowed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('temporary', { status: 500 }))
      .mockResolvedValueOnce(completion('{"ok":true}'));
    const client = new NebiusClient(config(), fetchMock);
    const result = await client.complete({ ...request, maxAttempts: 2 }, outputSchema);
    expect(result.output.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry authentication or malformed model JSON', async () => {
    const authFetch = vi.fn().mockResolvedValue(new Response('no', { status: 401 }));
    await expect(
      new NebiusClient(config(), authFetch).complete({ ...request, maxAttempts: 2 }, outputSchema),
    ).rejects.toMatchObject({ code: 'NEBIUS_AUTH_FAILED' });
    expect(authFetch).toHaveBeenCalledTimes(1);

    const jsonFetch = vi.fn().mockResolvedValue(completion('not-json'));
    await expect(
      new NebiusClient(config(), jsonFetch).complete({ ...request, maxAttempts: 2 }, outputSchema),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_JSON' });
    expect(jsonFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects schema-invalid output instead of accepting partial claims', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion('{"ok":"yes","extra":true}'));
    await expect(
      new NebiusClient(config(), fetchMock).complete(request, outputSchema),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_SCHEMA' });
  });

  it('disables Nemotron reasoning via chat_template_kwargs in every request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion('{"ok":true}'));
    await new NebiusClient(config(), fetchMock).complete(request, outputSchema);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it('accepts a valid payload wrapped in a Nemotron think block (live regression)', async () => {
    const wrapped =
      '<think>Draft the intake JSON. The braces {"draft":true} here are not the answer.</think>' +
      '\n{"ok":true}';
    const fetchMock = vi.fn().mockResolvedValue(completion(wrapped));
    const result = await new NebiusClient(config(), fetchMock).complete(request, outputSchema);
    expect(result.output).toEqual({ ok: true });
    expect(result.receipt).toMatchObject({
      mode: 'live',
      provider: 'nebius',
      responseId: 'fixture-response',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts fenced and prose-wrapped JSON while keeping the same receipt', async () => {
    const fenced = vi.fn().mockResolvedValue(completion('Here you go:\n```json\n{"ok":true}\n```'));
    const fencedResult = await new NebiusClient(config(), fenced).complete(request, outputSchema);
    expect(fencedResult.output).toEqual({ ok: true });
    expect(fencedResult.receipt.responseId).toBe('fixture-response');

    const prose = vi.fn().mockResolvedValue(completion('Plan: {"ok":true} — validated above.'));
    const proseResult = await new NebiusClient(config(), prose).complete(request, outputSchema);
    expect(proseResult.output).toEqual({ ok: true });
  });

  it('still fails closed when wrapper recovery yields schema-invalid JSON', async () => {
    const wrapped = vi
      .fn()
      .mockResolvedValue(
        completion('<think>reasoning</think>\n```json\n{"ok":"yes","extra":true}\n```'),
      );
    await expect(
      new NebiusClient(config(), wrapped).complete(request, outputSchema),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_SCHEMA' });
  });

  it('reports INVALID_MODEL_JSON without retrying when no JSON payload exists at all', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completion('<think>some reasoning</think> I cannot help with that.'));
    await expect(
      new NebiusClient(config(), fetchMock).complete({ ...request, maxAttempts: 2 }, outputSchema),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_JSON' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('contains aborts with a specific timeout error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(
      new NebiusClient(config(), fetchMock).complete(request, outputSchema),
    ).rejects.toMatchObject({ code: 'NEBIUS_TIMEOUT' });
  });

  it('allows only official HTTPS Token Factory base URLs', () => {
    expect(normalizeNebiusBaseUrl()).toBe('https://api.tokenfactory.nebius.com/v1');
    expect(() =>
      normalizeNebiusBaseUrl('https://api.tokenfactory.nebius.com.evil.test/v1'),
    ).toThrow();
    expect(() => normalizeNebiusBaseUrl('http://api.tokenfactory.nebius.com/v1')).toThrow();
    expect(() => normalizeNebiusBaseUrl('https://evil.test/v1')).toThrow();
  });
});

describe('Nebius bounded retries, backoff and timeout classification', () => {
  const retryRequest = {
    ...request,
    maxAttempts: 3,
    timeoutMs: 30_000,
    connectTimeoutMs: 10_000,
    totalTimeoutMs: 45_000,
  };
  // Deterministic no-wait backoff with the jitter factor pinned at 1.0, so
  // delays are exactly the capped exponential schedule 500, 1000, 2000, ...
  const noWait = () => ({ sleep: vi.fn().mockResolvedValue(undefined), random: () => 0.5 });
  const abortError = () => new DOMException('Aborted', 'AbortError');

  it('recovers after one timeout by retrying the identical request body', async () => {
    const adapters = noWait();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(abortError())
      .mockResolvedValueOnce(completion('{"ok":true}'));
    const client = new NebiusClient(config(), fetchMock, adapters);
    const result = await client.complete(retryRequest, outputSchema);

    expect(result.output).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retry re-sends the exact same payload: no second, divergent plan.
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
    expect(adapters.sleep).toHaveBeenCalledTimes(1);
  });

  it('exhausts the bounded attempts on repeated timeouts with an actionable error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(abortError());
    const client = new NebiusClient(config(), fetchMock, noWait());
    const error = await client.complete(retryRequest, outputSchema).catch((e) => e);
    expect(error).toMatchObject({
      code: 'NEBIUS_TIMEOUT',
      retryable: true,
      details: { attempts: 3, lastErrorCode: 'NEBIUS_TIMEOUT' },
    });
    expect(error.message).toMatch(/after 3 attempts/);
    expect(error.message).toMatch(/Retry/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('classifies a stalled connection separately from a slow response', async () => {
    // Mirrors real fetch: a never-established connection rejects when the
    // abort signal fires. Headers never arrive, so the connect timer wins.
    const fetchMock = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(abortError()));
        }),
    );
    const client = new NebiusClient(config(), fetchMock, noWait());
    const started = Date.now();
    await expect(
      client.complete(
        {
          ...request,
          maxAttempts: 1,
          connectTimeoutMs: 25,
          timeoutMs: 5_000,
          totalTimeoutMs: 30_000,
        },
        outputSchema,
      ),
    ).rejects.toMatchObject({ code: 'NEBIUS_CONNECT_TIMEOUT' });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries transient network errors with exponential jittered backoff and then fails closed', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new NebiusClient(config(), fetchMock, { sleep, random: () => 0.5 });
    await expect(
      client.complete({ ...retryRequest, maxAttempts: 4 }, outputSchema),
    ).rejects.toMatchObject({
      code: 'NEBIUS_NETWORK_ERROR',
      retryable: true,
      details: { attempts: 4, lastErrorCode: 'NEBIUS_NETWORK_ERROR' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // Three backoff waits between four attempts: base 500 doubled each time.
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([500, 1000, 2000]);
  });

  it('never starts an attempt the total deadline cannot contain', async () => {
    // Headers arrive, but the body read stalls until the response timer
    // aborts; the total deadline then forbids a second attempt.
    const fetchMock = vi.fn((_url: URL | RequestInfo, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(abortError()));
          }),
      } as Response),
    );
    const client = new NebiusClient(config(), fetchMock, noWait());
    const started = Date.now();
    await expect(
      client.complete(
        {
          ...request,
          maxAttempts: 4,
          timeoutMs: 5_000,
          connectTimeoutMs: 60_000,
          totalTimeoutMs: 1_600,
        },
        outputSchema,
      ),
    ).rejects.toMatchObject({
      code: 'NEBIUS_TIMEOUT',
      details: { attempts: 1 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(2_200);
  });

  it('clamps excessive configured attempts to the bounded maximum', async () => {
    const fetchMock = vi.fn().mockRejectedValue(abortError());
    const client = new NebiusClient(config(), fetchMock, noWait());
    await expect(
      client.complete({ ...retryRequest, maxAttempts: 99 }, outputSchema),
    ).rejects.toMatchObject({ details: { attempts: 4 } });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('backoffDelayMs grows exponentially, stays jitter-bounded and caps at the maximum', async () => {
    expect(backoffDelayMs(0, 500, 4000, () => 0)).toBe(375);
    expect(backoffDelayMs(0, 500, 4000, () => 1)).toBe(625);
    expect(backoffDelayMs(2, 500, 4000, () => 0.5)).toBe(2000);
    expect(backoffDelayMs(9, 500, 4000, () => 0.5)).toBe(4000);
  });
});
