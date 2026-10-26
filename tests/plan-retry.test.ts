// Integration coverage for the plan-generation retry contract. Retrieval is
// mocked so the test proves the side effect happens exactly once even when
// inference is retried, and that every retry carries the identical intake
// state (goal, clarification answers and sources). No network calls occur.
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_NEBIUS_MODEL, type AppConfig } from '../server/config';
import { NebiusClient } from '../server/lib/nebius';
import { runPlan } from '../server/lib/plan';
import { retrieveSources } from '../server/lib/retrieval';
import { TavilyClient } from '../server/lib/tavily';
import type { PlanRequest } from '../src/shared/schemas';
import { makeInput, makeModelPlan, makeSource } from './fixtures';

vi.mock('../server/lib/retrieval', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/lib/retrieval')>()),
  retrieveSources: vi.fn(),
}));

const retrieveSourcesMock = vi.mocked(retrieveSources);

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

function planCompletion() {
  return new Response(
    JSON.stringify({
      id: 'fixture-response',
      model: DEFAULT_NEBIUS_MODEL,
      choices: [{ message: { content: JSON.stringify(makeModelPlan()), refusal: null } }],
      usage: { prompt_tokens: 20, completion_tokens: 40, total_tokens: 60 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

const abortError = () => new DOMException('Aborted', 'AbortError');
const noWaitAdapters = { sleep: vi.fn().mockResolvedValue(undefined), random: () => 0.5 };

function planInput(): PlanRequest {
  return {
    ...makeInput(),
    task: 'Renew an expired domestic passport with an evidence-backed checklist.',
    goal: 'Complete the domestic adult passport renewal online with biometric attendance.',
    jurisdiction: 'Fixtureland',
    sourceUrls: ['https://example.gov/guide'],
    searchQueries: ['domestic passport renewal official requirements'],
    answers: [
      {
        question: 'Which application route will you use?',
        answer: 'The domestic online route followed by an in-person biometric appointment.',
      },
    ],
  };
}

function mockRetrievalOnce() {
  retrieveSourcesMock.mockResolvedValueOnce({
    sources: [makeSource('S1', 'The fee is £102.', 'https://example.gov/guide')],
    warnings: [],
    tavilyCalls: 0,
    directFetches: 1,
    tavilyRequestIds: [],
    ledger: { discovered: 1, fetched: 1, parsed: 1, selected: ['example.gov'], excluded: [] },
    // Tests only exercise the fields runPlan reads; extra runtime shape is
    // irrelevant under this module mock.
  } as Awaited<ReturnType<typeof retrieveSources>>);
}

describe('runPlan retry contract', () => {
  it('retrieves sources once, retries a timed-out inference call, and preserves intake state', async () => {
    mockRetrievalOnce();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(abortError())
      .mockResolvedValueOnce(planCompletion());
    const client = new NebiusClient(config(), fetchMock, noWaitAdapters);

    const result = await runPlan(client, new TavilyClient(config()), planInput());

    // Retrieval (the only non-idempotent side effect besides inference)
    // happens exactly once despite the inference retry.
    expect(retrieveSourcesMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    // The retry re-POSTs the byte-identical request: no divergent second plan.
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
    const prompt = JSON.parse(secondBody.messages[1].content);
    expect(prompt.clarificationAnswers).toEqual(planInput().answers);
    expect(prompt.goal).toBe(planInput().goal);
    expect(prompt.sources).toHaveLength(1);
    expect(prompt.sources[0].url).toBe('https://example.gov/guide');

    expect(result.plan.runtime.mode).toBe('live');
    expect(result.modelPlan.steps).toHaveLength(2);
    expect(result.sources).toHaveLength(1);
  });

  it('fails closed after exhausting retries without duplicating retrieval or fabricating a plan', async () => {
    mockRetrievalOnce();
    const fetchMock = vi.fn().mockRejectedValue(abortError());
    const client = new NebiusClient(config(), fetchMock, noWaitAdapters);

    await expect(runPlan(client, new TavilyClient(config()), planInput())).rejects.toMatchObject({
      code: 'NEBIUS_TIMEOUT',
      retryable: true,
      details: { attempts: 3 },
    });

    expect(retrieveSourcesMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(noWaitAdapters.sleep).toHaveBeenCalledTimes(2);
  });

  it('preserves the retry contract for a low-level DNS failure and reports its stage', async () => {
    mockRetrievalOnce();
    const dnsFailure = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.tokenfactory.nebius.com'), {
        code: 'ENOTFOUND',
      }),
    });
    const fetchMock = vi.fn().mockRejectedValue(dnsFailure);
    const client = new NebiusClient(config(), fetchMock, noWaitAdapters);

    await expect(runPlan(client, new TavilyClient(config()), planInput())).rejects.toMatchObject({
      code: 'NEBIUS_NETWORK_ERROR',
      retryable: true,
      details: {
        attempts: 3,
        lastCauseCode: 'ENOTFOUND',
        lastSuspectedStage: 'dns',
      },
    });

    // One retrieval, three identical re-POSTs, no plan materialized.
    expect(retrieveSourcesMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[2][1].body);
  });
});
