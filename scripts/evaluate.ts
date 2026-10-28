import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { createApp } from '../server/app';
import { DEFAULT_NEBIUS_MODEL, type AppConfig } from '../server/config';
import { validateEvidencePlan, type EvidenceMetrics, type ModelPlan } from '../server/lib/evidence';
import { requiredClarifications } from '../server/lib/intake';
import { NebiusClient } from '../server/lib/nebius';
import { retrieveSources, type RetrievedSource } from '../server/lib/retrieval';
import { TavilyClient } from '../server/lib/tavily';
import { PlanResponseSchema } from '../src/shared/schemas';
import { fixtureRuntime, makeInput, makeModelPlan, makeSource } from '../tests/fixtures';
import {
  makeObservedModelPlan,
  makePassportInput,
  makePassportSources,
} from '../tests/fixtures/passport-live-export';
import {
  crossJurisdictionReceipt,
  makeCanadaInput,
  makeCanadaModelPlan,
  makeCanadaSources,
  makeConsularInput,
  makeConsularModelPlan,
  makeFranceInput,
  makeFranceModelPlan,
  makeFranceSources,
  makeNigeriaInput,
  makeNigeriaModelPlan,
  makeNigeriaSources,
  makeWeakInput,
  makeWeakModelPlan,
  makeWeakSources,
} from '../tests/fixtures/cross-jurisdiction';

interface CaseResult {
  id: string;
  category: 'evidence' | 'workflow' | 'provider-failure' | 'universality';
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

await runCase('official-contradiction-downgrades-fee', 'evidence', () => {
  const result = validateEvidencePlan({
    modelPlan: makeObservedModelPlan(),
    sources: makePassportSources(),
    input: makePassportInput(),
    runtime: fixtureRuntime,
    id: 'passport-observed-export',
    now: () => new Date('2026-10-24T12:00:00.000Z'),
  });
  evidenceRuns.push(result.metrics);
  const fee = result.plan.steps.find((step) => step.title === 'Pay the online renewal fee');
  assert.ok(fee, 'fee step exists');
  assert.equal(fee!.status, 'unverifiable');
  assert.equal(result.metrics.contradictedClaimCount >= 1, true);
  // The contradicted citation remains inspectable rather than being deleted.
  assert.equal(fee!.evidence.length, 1);
});

await runCase('route-specific-requirement-cannot-mix-routes', 'evidence', () => {
  const result = validateEvidencePlan({
    modelPlan: makeObservedModelPlan(),
    sources: makePassportSources(),
    input: makePassportInput(),
    runtime: fixtureRuntime,
    id: 'passport-route-mixing',
    now: () => new Date('2026-10-24T12:00:00.000Z'),
  });
  evidenceRuns.push(result.metrics);
  const printed = result.plan.steps.find((step) => step.title === 'Get printed photos');
  const digital = result.plan.steps.find((step) => step.title === 'Prepare a digital photo');
  assert.ok(printed && digital, 'both photo steps exist');
  assert.equal(printed!.status, 'unverifiable');
  assert.equal(digital!.status, 'supported');
  assert.equal(result.plan.unresolvedQuestions.length, 1);
});

await runCase('dependency-cycle-removal', 'evidence', () => {
  const model = makeModelPlan();
  model.steps[0].dependsOn = ['b'];
  model.steps[1].dependsOn = ['a'];
  const plan = validate(model);
  assert.ok(plan.steps.every((step) => step.dependsOn.length === 0));
});

// --- Cross-jurisdiction universality suite (synthetic labelled fixtures) ---
// Required scenario coverage: (1) Nigeria domestic passport, (2) UK passport is
// covered by official-contradiction-downgrades-fee and route-specific-
// requirement-cannot-mix-routes above, (3) third-country immigration,
// (4) non-passport task, (5) missing-detail clarification, (6) official vs
// secondary contradiction, (7) inaccessible official source, (8) inadequate
// evidence, (9) route/conditional requirements, (10) fees and deadlines.

function crossValidate(
  model: ModelPlan,
  sources: RetrievedSource[],
  input: ReturnType<typeof makeNigeriaInput>,
  id: string,
  initialWarnings: string[] = [],
) {
  const result = validateEvidencePlan({
    modelPlan: model,
    sources,
    input,
    runtime: crossJurisdictionReceipt,
    id,
    now: () => new Date('2026-10-24T12:00:00.000Z'),
    initialWarnings,
  });
  evidenceRuns.push(result.metrics);
  return result.plan;
}

await runCase('xjur-nigeria-domestic-passport-ngn-and-routes', 'universality', () => {
  const plan = crossValidate(
    makeNigeriaModelPlan(),
    makeNigeriaSources(),
    makeNigeriaInput(),
    'xjur-nigeria-plan',
  );
  const fee = plan.steps.find((step) => step.title === 'Pay the passport application fee')!;
  const post = plan.steps.find((step) => step.title === 'Send paperwork by post')!;
  const biometric = plan.steps.find((step) => step.title === 'Book biometric capture')!;
  assert.equal(fee.status, 'unverifiable');
  assert.ok(fee.notes.join(' ').includes('NGN 25,000'));
  assert.equal(post.status, 'unverifiable');
  assert.equal(biometric.status, 'supported');
  assert.equal(plan.unresolvedQuestions.length, 1);
});

await runCase('xjur-canada-study-permit-third-country-cad', 'universality', () => {
  const plan = crossValidate(
    makeCanadaModelPlan(),
    makeCanadaSources(),
    makeCanadaInput(),
    'xjur-canada-plan',
  );
  const fee = plan.steps.find((step) => step.title === 'Pay the study permit fee')!;
  const biometrics = plan.steps.find((step) => step.title === 'Pay biometrics if required')!;
  assert.equal(fee.status, 'unverifiable');
  assert.ok(fee.notes.join(' ').includes('CAD 150'));
  assert.equal(biometrics.status, 'supported');
});

await runCase('xjur-france-business-registration-non-passport', 'universality', () => {
  const plan = crossValidate(
    makeFranceModelPlan(),
    makeFranceSources(),
    makeFranceInput(),
    'xjur-france-plan',
  );
  const fee = plan.steps.find((step) => step.title === 'Pay a registration fee')!;
  const paper = plan.steps.find((step) => step.title === 'Mail paper forms')!;
  const portal = plan.steps.find(
    (step) => step.title === 'Register online via the formalites portal',
  )!;
  assert.equal(fee.status, 'unverifiable');
  assert.equal(paper.status, 'unverifiable');
  assert.equal(portal.status, 'supported');
  assert.equal(portal.dueDate, null);
});

await runCase('xjur-consular-route-protected-abroad', 'universality', () => {
  const plan = crossValidate(
    makeConsularModelPlan(),
    makeNigeriaSources(),
    makeConsularInput(),
    'xjur-consular',
  );
  const onlineOnly = plan.steps.find((step) => step.title === 'Renew fully online')!;
  const embassy = plan.steps.find((step) => step.title === 'Attend the embassy in person')!;
  assert.equal(onlineOnly.status, 'unverifiable');
  assert.equal(embassy.status, 'supported');
});

await runCase('xjur-weak-evidence-stays-honest', 'universality', () => {
  const plan = crossValidate(makeWeakModelPlan(), makeWeakSources(), makeWeakInput(), 'xjur-weak', [
    'No official-domain source was retrieved; secondary publisher guidance cannot override official requirements. Add an official source URL to establish supported requirements.',
  ]);
  assert.ok(plan.steps.every((step) => step.status !== 'supported'));
  assert.ok(plan.warnings.some((warning) => warning.includes('No official-domain source')));
  assert.ok(plan.warnings.some((warning) => warning.includes('jurisdiction')));
  assert.equal(plan.unresolvedQuestions.length, 1);
});

await runCase('xjur-missing-jurisdiction-triggers-clarification', 'universality', () => {
  const questions = requiredClarifications({
    task: 'Apply for a residence permit for my family.',
    jurisdiction: '',
    category: 'Visa & immigration',
    details: '',
    sourceUrls: [],
    document: null,
  });
  assert.ok(questions.some((question) => question.id === 'clarify-jurisdiction'));
  assert.ok(questions.some((question) => question.id === 'clarify-route'));
});

await runCase('xjur-specified-request-needs-no-clarification', 'universality', () => {
  const questions = requiredClarifications({
    task: 'Renew my passport in person at the consulate while living abroad.',
    jurisdiction: 'Brazil',
    category: 'Travel & identity documents',
    details: 'Consular route, outside the country.',
    sourceUrls: [],
    document: null,
  });
  assert.equal(questions.length, 0);
});

await runCase(
  'xjur-inaccessible-official-source-backfills-alternative',
  'universality',
  async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes('8.8.8.8/broken')) {
        return new Response('fault', { status: 500, headers: { 'content-type': 'text/plain' } });
      }
      return new Response(
        `Retrieved guidance text from ${String(url)} with enough words to pass the source length check.`,
        { status: 200, headers: { 'content-type': 'text/plain' } },
      );
    }) as typeof fetch;
    try {
      const tavily = {
        configured: true,
        discover: async () => ({
          urls: [
            'https://9.9.9.9/one',
            'https://9.9.9.9/two',
            'https://9.9.9.9/three',
            'https://9.9.9.9/four',
            'https://9.9.9.9/five',
            'https://9.9.9.9/six',
          ],
          requestIds: ['eval-backfill'],
          calls: 1,
        }),
      };
      const result = await retrieveSources({
        directUrls: ['https://8.8.8.8/broken'],
        searchQueries: ['permit guidance'],
        goal: 'Complete a permit application',
        jurisdiction: 'Kenya',
        document: null,
        tavily: tavily as unknown as TavilyClient,
      });
      assert.equal(result.sources.length, 6);
      assert.ok(result.warnings.some((warning) => warning.includes('8.8.8.8')));
      // The direct 500 now consumes its one bounded retry before the failed
      // slot is backfilled from the Tavily queue: six batch attempts plus the
      // retry plus one backfill.
      assert.equal(result.directFetches, 8);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

await runCase('xjur-no-sources-fails-closed-without-invention', 'universality', async () => {
  const tavily = {
    configured: false,
    discover: async () => ({ urls: [], requestIds: [], calls: 0 }),
  };
  await assert.rejects(
    retrieveSources({
      directUrls: [],
      searchQueries: [],
      goal: 'Complete an unknown administrative process',
      jurisdiction: 'Kenya',
      document: null,
      tavily: tavily as unknown as TavilyClient,
    }),
    (error: unknown) => (error as { code?: string }).code === 'SOURCES_REQUIRED',
  );
});

await runCase('xjur-engine-contains-no-country-specific-rules', 'universality', async () => {
  const engineSources = await Promise.all(
    [
      new URL('../server/lib/claim-checks.ts', import.meta.url),
      new URL('../server/lib/evidence.ts', import.meta.url),
      new URL('../server/lib/intake.ts', import.meta.url),
    ].map((url) => readFile(url, 'utf8')),
  );
  const engineText = engineSources.join('\n');
  for (const country of [
    'Nigeria',
    'Kenya',
    'Canada',
    'France',
    'Brazil',
    'United Kingdom',
    'passport',
    'Naira',
  ]) {
    assert.ok(
      !engineText.includes(country),
      `Core engine must not hardcode ${country}; country facts belong in retrieved evidence.`,
    );
  }
});

await runCase('xjur-stale-source-and-unsupported-deadline-warn', 'universality', () => {
  const sources = [
    makeSource(
      'S1',
      'Applicants must renew online. The fee is £102 and this guidance is long enough to validate.',
      'https://service.gov.example/guide',
      { authority: 'official', stale: true, publishedAt: '2024-01-01' },
    ),
  ];
  const model = makeModelPlan();
  model.steps[0].dueDate = '1 March 2027';
  const plan = validate(model, sources);
  assert.equal(plan.steps[0].dueDate, null);
  assert.ok(plan.warnings.some((warning) => warning.includes('18 months old')));
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
const universalityCases = cases.filter((entry) => entry.category === 'universality');
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
    universalityCasesPassed: universalityCases.filter((entry) => entry.passed).length,
    universalityCases: universalityCases.length,
    medianFixtureLatencyMs,
  },
  definitions: {
    citationCoverage:
      'Final source-supported steps divided by all steps in the deterministic evidence fixtures.',
    unsupportedClaimRate:
      'Model-claimed supported steps rejected for lack of a valid citation, divided by all model-claimed supported steps in those fixtures.',
    latency: 'Median wall time of all local fixture/API cases; no live model latency is included.',
  },
};

const report = `# ProofPath evaluation report\n\nGenerated: ${artifact.ranAt}\n\n**Mode: deterministic fixtures and a mocked provider boundary. No live Nemotron, Nebius, or Tavily quality claim is made.**\n\n## Results\n\n- Cases: **${passed}/${cases.length} passed** (${cases.length - passed} failed)\n- Final citation coverage: **${(artifact.metrics.citationCoverage * 100).toFixed(1)}%**\n- Raw supported claims rejected: **${(artifact.metrics.unsupportedClaimRate * 100).toFixed(1)}%**\n- Expected genuine conflicts detected: **${conflictsDetected}/${genuineConflictsExpected}**\n- Missing-information cases handled: **${missingInformationHandled}/${missingInformationCases}**\n- Mocked-provider end-to-end API workflows: **${artifact.metrics.endToEndCompleted}/${artifact.metrics.endToEndCases}**\n- Provider failure cases contained: **${artifact.metrics.providerFailuresHandled}/${artifact.metrics.providerFailureCases}**\n- Cross-jurisdiction universality cases: **${artifact.metrics.universalityCasesPassed}/${artifact.metrics.universalityCases}**\n- Median local fixture/API latency: **${medianFixtureLatencyMs} ms** (not model latency)\n\n## Cross-jurisdiction universality scenarios\n\nSynthetic, clearly-labelled fixtures exercise one generic engine with no country-specific branches:\n\n1. Nigerian domestic adult passport renewal (NGN fees, in-person biometrics) — \`xjur-nigeria-domestic-passport-ngn-and-routes\`\n2. UK adult passport renewal — \`official-contradiction-downgrades-fee\` and \`route-specific-requirement-cannot-mix-routes\`\n3. Third-country immigration process (Canada study permit, CAD) — \`xjur-canada-study-permit-third-country-cad\`\n4. Non-passport task (French business registration, EUR) — \`xjur-france-business-registration-non-passport\`\n5. Missing jurisdiction and route require clarification — \`xjur-missing-jurisdiction-triggers-clarification\` and \`xjur-specified-request-needs-no-clarification\`\n6. Official source contradicts a secondary source — the Nigeria, Canada and UK fee cases\n7. Inaccessible official source triggers alternative retrieval — \`xjur-inaccessible-official-source-backfills-alternative\`\n8. No adequate evidence stays honest — \`xjur-weak-evidence-stays-honest\` and \`xjur-no-sources-fails-closed-without-invention\`\n9. Different routes and conditional requirements — \`xjur-consular-route-protected-abroad\` plus the UK route-mixing case\n10. Fees, deadlines and stale sources — the currency cases plus \`xjur-stale-source-and-unsupported-deadline-warn\`\n\nThe engine guard \`xjur-engine-contains-no-country-specific-rules\` asserts the core validation modules contain no country, domain, or currency-name hardcoding.\n\n## Metric definitions\n\n- **Citation coverage:** final source-supported steps / all steps in the deterministic evidence fixtures. It is a small fixture result, not an accuracy estimate for real tasks.\n- **Unsupported-claim rate:** model-claimed supported steps rejected for lack of a valid citation / all model-claimed supported steps in those fixtures.\n- **Conflict detection:** a conflict survives only with exact passages from at least two sources. A separate fabricated-conflict case must be rejected.\n- **Missing information:** an unsupported step must become unverifiable while its unresolved question remains visible.\n- **End-to-end completion:** an uploaded source traverses the real Express route, retrieval normalization, a mocked Nebius transport, schema parsing, and evidence gate. It does not test live model behavior.\n- **Provider failure handling:** missing credentials, authentication failure, and invalid structured output must return typed errors rather than fabricated plans.\n\n## Case ledger\n\n| Case | Category | Result | Latency (ms) |\n| --- | --- | --- | ---: |\n${cases.map((entry) => `| ${entry.id} | ${entry.category} | ${entry.passed ? 'PASS' : 'FAIL'} | ${entry.latencyMs} |`).join('\n')}\n\n## Limitations\n\nThis is a deliberately small adversarial suite, not a representative benchmark. Exact-quote matching does not prove semantic entailment, source authority, freshness, or jurisdictional applicability. Live model latency, quality, Nebius availability, Tavily discovery, and production behavior require separate genuine runtime verification.\n`;

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
