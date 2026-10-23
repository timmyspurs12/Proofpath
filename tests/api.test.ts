import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import vercelHandler from '../server/vercel-entry';
import { createApp } from '../server/app';
import { NebiusClient } from '../server/lib/nebius';
import { TavilyClient } from '../server/lib/tavily';
import type { AppConfig } from '../server/config';
import { DEFAULT_NEBIUS_MODEL } from '../server/config';
import { PlanResponseSchema } from '../src/shared/schemas';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  vi.unstubAllEnvs();
});

async function listen(server: Server) {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function serve(app: ReturnType<typeof createApp>) {
  return listen(createServer(app));
}

async function serveVercelEntry() {
  return listen(
    createServer((request, response) => {
      void vercelHandler(request, response);
    }),
  );
}

function fixtureConfig(overrides: Partial<AppConfig> = {}): AppConfig {
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

function modelResponse(output: unknown) {
  return new Response(
    JSON.stringify({
      id: 'fixture-api-response',
      model: DEFAULT_NEBIUS_MODEL,
      choices: [{ message: { content: JSON.stringify(output), refusal: null } }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

const validTask = {
  task: 'I need to complete the fixture application.',
  jurisdiction: 'Fixtureland',
  category: 'Documents & applications',
  details: '',
  sourceUrls: [],
  document: {
    name: 'fixture.txt',
    text: 'Official fixture instructions. The application fee is £42. Keep your receipt after applying.',
  },
};

describe('HTTP API', () => {
  it('reports configuration honestly without claiming a verified live call', async () => {
    vi.stubEnv('NEBIUS_API_KEY', '');
    vi.stubEnv('TAVILY_API_KEY', '');
    const base = await serve(createApp());
    const response = await fetch(`${base}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      liveInferenceConfigured: false,
      tavilyConfigured: false,
      liveInferenceVerified: false,
    });
  });

  it('serves health through the Vercel catch-all entry point', async () => {
    vi.stubEnv('NEBIUS_API_KEY', '');
    vi.stubEnv('TAVILY_API_KEY', '');
    const base = await serveVercelEntry();
    const response = await fetch(`${base}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      liveInferenceConfigured: false,
      liveInferenceVerified: false,
    });
  });

  it('returns an explicit compliance blocker when live inference is not configured', async () => {
    vi.stubEnv('NEBIUS_API_KEY', '');
    const base = await serve(createApp());
    const response = await fetch(`${base}/api/intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validTask),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: 'LIVE_INFERENCE_UNAVAILABLE', retryable: false },
    });
  });

  it('validates request bodies and returns structured 404 errors', async () => {
    const base = await serve(createApp());
    const invalid = await fetch(`${base}/api/intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'x' }),
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe('INVALID_REQUEST');
    const missing = await fetch(`${base}/api/not-a-route`);
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('NOT_FOUND');
  });

  it('runs an uploaded-source plan through a mocked Nebius boundary and the real evidence gate', async () => {
    const output = {
      title: 'Complete the fixture application',
      steps: [
        {
          id: 'raw-step',
          title: 'Review the application fee',
          instruction: 'Review the £42 application fee before applying.',
          completionCriteria: 'The application fee has been reviewed.',
          claimedStatus: 'supported',
          evidence: [{ sourceId: 'S1', quote: 'The application fee is £42.' }],
          dueDate: null,
          dependsOn: [],
        },
      ],
      conflicts: [],
      unresolvedQuestions: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(modelResponse(output));
    const config = fixtureConfig();
    const base = await serve(
      createApp({
        nebius: new NebiusClient(config, fetchMock),
        tavily: new TavilyClient(config, fetchMock),
      }),
    );
    const response = await fetch(`${base}/api/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validTask,
        goal: 'Complete the fixture application',
        searchQueries: [],
        answers: [],
      }),
    });
    expect(response.status).toBe(200);
    const body = PlanResponseSchema.parse(await response.json());
    expect(body.plan.steps[0].status).toBe('supported');
    expect(body.plan.sources[0].retrieval).toBe('upload');
    expect(body.plan.runtime.responseId).toBe('fixture-api-response');
    expect(body.plan.runtime.mode).toBe('live');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rechecks uploaded sources as not-checkable without network access', async () => {
    const base = await serve(createApp());
    const response = await fetch(`${base}/api/sources/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources: [{ id: 'S1', url: null, contentHash: 'a'.repeat(64) }] }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).checks[0].status).toBe('not-checkable');
  });

  it('applies a bounded request limit', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '1');
    const base = await serve(createApp());
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources: [] }),
    };
    expect((await fetch(`${base}/api/sources/verify`, init)).status).toBe(200);
    const limited = await fetch(`${base}/api/sources/verify`, init);
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe('REQUEST_LIMIT');
  });
});
