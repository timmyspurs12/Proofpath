import type { PlanRequest, RuntimeReceipt } from '../src/shared/schemas';
import type { ModelPlan } from '../server/lib/evidence';
import { hashText, type RetrievedSource } from '../server/lib/retrieval';

export const fixtureRuntime: RuntimeReceipt = {
  mode: 'live',
  provider: 'nebius',
  model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  responseId: 'fixture-response-not-a-live-call',
  latencyMs: 1,
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  retrieval: { tavilyCalls: 0, directFetches: 0, tavilyRequestIds: [] },
};

export function makeSource(
  id: string,
  text: string,
  url = `https://example.com/${id}`,
): RetrievedSource {
  return {
    text,
    source: {
      id,
      title: `Fixture ${id}`,
      publisher: 'Fixture publisher',
      url,
      retrievedAt: '2026-10-23T12:00:00.000Z',
      publishedAt: null,
      authority: 'secondary',
      retrieval: 'direct',
      contentHash: hashText(text),
      excerpt: text.slice(0, 2800),
      stale: false,
    },
  };
}

export function makeInput(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    task: 'Create a fixture administrative checklist',
    goal: 'Complete the fixture process using the supplied evidence',
    jurisdiction: 'Fixtureland',
    category: 'Documents & applications',
    details: '',
    sourceUrls: [],
    document: null,
    searchQueries: [],
    answers: [],
    ...overrides,
  };
}

export function makeModelPlan(): ModelPlan {
  return {
    title: 'Fixture action plan',
    steps: [
      {
        id: 'a',
        title: 'Review the fixture fee',
        instruction: 'Review the stated £102 fee before applying.',
        completionCriteria: 'The fee has been reviewed.',
        claimedStatus: 'supported',
        evidence: [{ sourceId: 'S1', quote: 'The fee is £102.' }],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'b',
        title: 'Prepare your reference',
        instruction: 'Keep a personal reference nearby for convenience.',
        completionCriteria: 'A reference is within reach.',
        claimedStatus: 'inferred',
        evidence: [],
        dueDate: null,
        dependsOn: ['a'],
      },
    ],
    conflicts: [],
    unresolvedQuestions: [],
  };
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
