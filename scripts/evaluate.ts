import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { createApp } from '../server/app';
import { DEFAULT_NEBIUS_MODEL, type AppConfig } from '../server/config';
import { validateEvidencePlan, type EvidenceMetrics, type ModelPlan } from '../server/lib/evidence';
import { NebiusClient } from '../server/lib/nebius';
import type { RetrievedSource } from '../server/lib/retrieval';
import { TavilyClient } from '../server/lib/tavily';
import { PlanResponseSchema } from '../src/shared/schemas';
import { fixtureRuntime, makeInput, makeModelPlan, makeSource } from '../tests/fixtures';

interface CaseResult {
  id: string;
  category: 'evidence' | 'workflow' | 'provider-failure';
  passed: boolean;
  latencyMs: number;
  detail: string;
}

const cases: CaseResult[] = [];
const evidenceRuns: EvidenceMetrics[] = [];
const startedAt = new Date();

async function runCase(
  id: string,
  category: CaseResult['category'],
  check: () => void | Promise<void>,
) {
  const start = performance.now();
  try {
    await check();
    cases.push({
      id,
      category,
      passed: true,
      latencyMs: Math.round((performance.now() - start) * 100) / 100,
      detail: 'Expected deterministic behavior observed.',
    });
  } catch (error) {
    cases.push({
      id,
      category,
      passed: false,
      latencyMs: Math.round((performance.now() - start) * 100) / 100,
      detail: error instanceof Error ? error.message : 'Unknown fixture failure',
    });
  }
}

function validate(
  model: ModelPlan,
  sources: RetrievedSource[] = [
    makeSource(
      'S1',
      'Applicants must renew online. The fee is £102.\nApply before 1 November 2026.',
    ),
  ],
) {
  const result = validateEvidencePlan({
    modelPlan: model,
    sources,
    input: makeInput(),
    runtime: fixtureRuntime,
    id: 'evaluation-fixture',
    now: () => new Date('2026-10-23T12:00:00.000Z'),
  });
  evidenceRuns.push(result.metrics);
  return result.plan;
}

await runCase('valid-supported-and-inferred', 'evidence', () => {
  const plan = validate(makeModelPlan());
  assert.equal(plan.steps[0].status, 'supported');
  assert.equal(plan.steps[1].status, 'inferred');
});

await runCase('fabricated-supported-quote', 'evidence', () => {
  const model = makeModelPlan();
  model.steps[0].evidence = [{ sourceId: 'S1', quote: 'The fee is only £1.' }];
  const plan = validate(model);
  assert.equal(plan.steps[0].status, 'unverifiable');
  assert.equal(plan.steps[0].evidence.length, 0);
});

await runCase('unknown-source-citation', 'evidence', () => {
  const model = makeModelPlan();
  model.steps[0].evidence = [{ sourceId: 'S9', quote: 'The fee is £102.' }];
  const plan = validate(model);
  assert.equal(plan.steps[0].status, 'unverifiable');
});

await runCase('unsupported-date-removal', 'evidence', () => {
  const model = makeModelPlan();
  model.steps[0].dueDate = '2 November 2026';
  const plan = validate(model);
  assert.equal(plan.steps[0].status, 'supported');
  assert.equal(plan.steps[0].dueDate, null);
});

await runCase('valid-two-source-conflict', 'evidence', () => {
  const model = makeModelPlan();
  model.conflicts = [
    {
      topic: 'Fee amount',
      detail: 'The sources state different fees.',
      stepIds: ['a'],
      evidence: [
        { sourceId: 'S1', quote: 'The fee is £102.' },
        { sourceId: 'S2', quote: 'The fee is £115.' },
      ],
    },
  ];
  const plan = validate(model, [
    makeSource('S1', 'The fee is £102.'),
    makeSource('S2', 'The fee is £115.'),
  ]);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.steps[0].status, 'conflicting');
});

await runCase('fabricated-conflict-rejection', 'evidence', () => {
  const model = makeModelPlan();
  model.conflicts = [
    {
      topic: 'Fee amount',
      detail: 'The alleged conflict lacks a second source.',
      stepIds: ['a'],
      evidence: [
        { sourceId: 'S1', quote: 'The fee is £102.' },
        { sourceId: 'S2', quote: 'The fee is £115.' },
      ],
    },
  ];
  const plan = validate(model);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.steps[0].status, 'supported');
});

await runCase('missing-information-remains-visible', 'evidence', () => {
  const model = makeModelPlan();
  model.steps = [model.steps[0]];
  model.steps[0].evidence = [{ sourceId: 'S1', quote: 'An invented requirement.' }];
  model.unresolvedQuestions = [
    {
      id: 'route',
      question: 'Which application route applies?',
      reason: 'The supplied passage does not distinguish the routes.',
    },
  ];
  const plan = validate(model);
  assert.equal(plan.steps[0].status, 'unverifiable');
  assert.equal(plan.unresolvedQuestions.length, 1);
});

await runCase('dependency-cycle-removal', 'evidence', () => {
  const model = makeModelPlan();
  model.steps[0].dependsOn = ['b'];
  model.steps[1].dependsOn = ['a'];
  const plan = validate(model);
  assert.ok(plan.steps.every((step) => step.dependsOn.length === 0));
});

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nebiusApiKey: 'evaluation-fixture-key',
    nebiusBaseUrl: 'https://api.tokenfactory.nebius.com/v1',
    nebiusModel: DEFAULT_NEBIUS_MODEL,
    tavilyApiKey: null,
    apiPort: 3000,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 20,
    ...overrides,
  };
}
const verificationRequest = {
  operation: 'verification' as const,
  systemPrompt: 'Fixture',
  userPrompt: 'Fixture',
  schemaName: 'fixture',
  jsonSchema: { type: 'object' },
  maxTokens: 10,
  timeoutMs: 100,
  maxAttempts: 1 as const,
};
const verificationOutputSchema = z.object({ ok: z.boolean() }).strict();

await runCase('provider-missing-credential', 'provider-failure', async () => {
  const client = new NebiusClient(config({ nebiusApiKey: null }), async () => {
    throw new Error('Fetch must not run');
  });
  await assert.rejects(
    client.complete(verificationRequest, verificationOutputSchema),
    (error: unknown) => (error as { code?: string }).code === 'LIVE_INFERENCE_UNAVAILABLE',
  );
});

await runCase('provider-authentication-failure', 'provider-failure', async () => {
  const client = new NebiusClient(
    config(),
    async () => new Response('fixture secret must not leak', { status: 401 }),
  );
  await assert.rejects(
    client.complete(verificationRequest, verificationOutputSchema),
    (error: unknown) => (error as { code?: string }).code === 'NEBIUS_AUTH_FAILED',
  );
});

await runCase('provider-schema-failure', 'provider-failure', async () => {
  const response = new Response(
    JSON.stringify({ choices: [{ message: { content: '{"unexpected":true}', refusal: null } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
  const client = new NebiusClient(config(), async () => response);
  await assert.rejects(
    client.complete(verificationRequest, verificationOutputSchema),
    (error: unknown) => (error as { code?: string }).code === 'INVALID_MODEL_SCHEMA',
  );
});

await runCase('mocked-provider-full-api-workflow', 'workflow', async () => {
  const model = makeModelPlan();
  const providerResponse = new Response(
    JSON.stringify({
      id: 'evaluation-mock-not-live',
      model: DEFAULT_NEBIUS_MODEL,
      choices: [{ message: { content: JSON.stringify(model), refusal: null } }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
  const fixtureConfig = config();
  const app = createApp({
    nebius: new NebiusClient(fixtureConfig, async () => providerResponse),
    tavily: new TavilyClient(fixtureConfig),
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}/api/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...makeInput(),
        task: 'Complete the fixture application with evidence.',
        document: {
          name: 'fixture.txt',
          text: 'Applicants must renew online. The fee is £102.\nApply before 1 November 2026.',
        },
      }),
    });
    assert.equal(response.status, 200);
    const body = PlanResponseSchema.parse(await response.json());
    assert.equal(body.plan.steps[0].status, 'supported');
    assert.equal(body.plan.runtime.responseId, 'evaluation-mock-not-live');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

const passed = cases.filter((entry) => entry.passed).length;
const sum = (selector: (metric: EvidenceMetrics) => number) =>
  evidenceRuns.reduce((total, metric) => total + selector(metric), 0);
const modelSupported = sum((metric) => metric.modelSupportedClaims);
const genuineConflictsExpected = 1;
const conflictsDetected = cases.find((entry) => entry.id === 'valid-two-source-conflict')?.passed
  ? 1
  : 0;
const missingInformationCases = 1;
const missingInformationHandled = cases.find(
  (entry) => entry.id === 'missing-information-remains-visible',
)?.passed
  ? 1
  : 0;
const workflowCases = cases.filter((entry) => entry.category === 'workflow');
const failureCases = cases.filter((entry) => entry.category === 'provider-failure');
const sortedLatencies = cases.map((entry) => entry.latencyMs).sort((a, b) => a - b);
const middle = Math.floor(sortedLatencies.length / 2);
const medianFixtureLatencyMs =
  sortedLatencies.length % 2
    ? sortedLatencies[middle]
    : Math.round(((sortedLatencies[middle - 1] + sortedLatencies[middle]) / 2) * 100) / 100;

const artifact = {
  schemaVersion: 1,
  ranAt: startedAt.toISOString(),
  mode: 'deterministic-fixtures',
  liveModel: false,
  model: null,
  environment: { node: process.version },
  totals: { cases: cases.length, passed, failed: cases.length - passed },
  metrics: {
    citationCoverage:
      sum((metric) => metric.validatedSupportedClaims) / sum((metric) => metric.stepCount),
    unsupportedClaimRate: modelSupported
      ? sum((metric) => metric.unsupportedModelClaims) / modelSupported
      : 0,
    conflictsDetected,
    conflictsExpected: genuineConflictsExpected,
    missingInformationHandled,
    missingInformationCases,
    endToEndCompleted: workflowCases.filter((entry) => entry.passed).length,
    endToEndCases: workflowCases.length,
    providerFailuresHandled: failureCases.filter((entry) => entry.passed).length,
    providerFailureCases: failureCases.length,
    medianFixtureLatencyMs,
  },
  definitions: {
    citationCoverage:
      'Final source-supported steps divided by all steps in the eight evidence fixtures.',
    unsupportedClaimRate:
      'Model-claimed supported steps rejected for lack of a valid citation, divided by all model-claimed supported steps in those fixtures.',
    latency: 'Median wall time of all local fixture/API cases; no live model latency is included.',
  },
};

const report = `# ProofPath evaluation report\n\nGenerated: ${artifact.ranAt}\n\n**Mode: deterministic fixtures and a mocked provider boundary. No live Nemotron, Nebius, or Tavily quality claim is made.**\n\n## Results\n\n- Cases: **${passed}/${cases.length} passed** (${cases.length - passed} failed)\n- Final citation coverage: **${(artifact.metrics.citationCoverage * 100).toFixed(1)}%**\n- Raw supported claims rejected: **${(artifact.metrics.unsupportedClaimRate * 100).toFixed(1)}%**\n- Expected genuine conflicts detected: **${conflictsDetected}/${genuineConflictsExpected}**\n- Missing-information cases handled: **${missingInformationHandled}/${missingInformationCases}**\n- Mocked-provider end-to-end API workflows: **${artifact.metrics.endToEndCompleted}/${artifact.metrics.endToEndCases}**\n- Provider failure cases contained: **${artifact.metrics.providerFailuresHandled}/${artifact.metrics.providerFailureCases}**\n- Median local fixture/API latency: **${medianFixtureLatencyMs} ms** (not model latency)\n\n## Metric definitions\n\n- **Citation coverage:** final source-supported steps / all steps in the eight evidence fixtures. It is a small fixture result, not an accuracy estimate for real tasks.\n- **Unsupported-claim rate:** model-claimed supported steps rejected for lack of a valid citation / all model-claimed supported steps in those fixtures.\n- **Conflict detection:** a conflict survives only with exact passages from at least two sources. A separate fabricated-conflict case must be rejected.\n- **Missing information:** an unsupported step must become unverifiable while its unresolved question remains visible.\n- **End-to-end completion:** an uploaded source traverses the real Express route, retrieval normalization, a mocked Nebius transport, schema parsing, and evidence gate. It does not test live model behavior.\n- **Provider failure handling:** missing credentials, authentication failure, and invalid structured output must return typed errors rather than fabricated plans.\n\n## Case ledger\n\n| Case | Category | Result | Latency (ms) |\n| --- | --- | --- | ---: |\n${cases.map((entry) => `| ${entry.id} | ${entry.category} | ${entry.passed ? 'PASS' : 'FAIL'} | ${entry.latencyMs} |`).join('\n')}\n\n## Limitations\n\nThis is a deliberately small adversarial suite, not a representative benchmark. Exact-quote matching does not prove semantic entailment, source authority, freshness, or jurisdictional applicability. Live model latency, quality, Nebius availability, Tavily discovery, and production behavior require separate genuine runtime verification.\n`;

await mkdir(new URL('../docs/evaluation/', import.meta.url), { recursive: true });
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../docs/evaluation/cases.json', import.meta.url),
  JSON.stringify({ ...artifact, cases }, null, 2),
);
await writeFile(
  new URL('../public/evaluation.json', import.meta.url),
  JSON.stringify(artifact, null, 2),
);
await writeFile(new URL('../docs/EVALUATION.md', import.meta.url), report);
console.log(
  `Evaluation: ${passed}/${cases.length} cases passed; artifact written to public/evaluation.json.`,
);
if (passed !== cases.length) process.exitCode = 1;
