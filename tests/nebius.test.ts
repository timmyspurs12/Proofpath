import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AppConfig } from '../server/config';
import { DEFAULT_NEBIUS_MODEL, normalizeNebiusBaseUrl } from '../server/config';
import { NebiusClient } from '../server/lib/nebius';

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
