import { execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { getConfig } from '../server/config';
import { NebiusClient } from '../server/lib/nebius';
import { runIntake, runPlan } from '../server/lib/plan';
import type { RetrievedSource } from '../server/lib/retrieval';
import { TavilyClient } from '../server/lib/tavily';
import {
  evaluateEvidenceAcceptance,
  type CaseAcceptanceResult,
  type LiveCaseDefinition,
} from './live-acceptance';
import { DEFAULT_CASE_ID, LIVE_CASES, selectCase } from './live-cases';
import type { TaskInput } from '../src/shared/schemas';

const config = getConfig();

function parseCaseId(argv: string[]): string {
  const flag = argv.find((entry) => entry.startsWith('--case='));
  if (!flag) return DEFAULT_CASE_ID;
  return flag.slice('--case='.length).trim() || DEFAULT_CASE_ID;
}

// Code revision for the artifact. Git metadata is best-effort: a missing git
// binary or detached checkout must never make a real live run fail to record.
function readCodeRevision() {
  const run = (command: string) => {
    try {
      return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      return null;
    }
  };
  return {
    commitSha: run('git rev-parse HEAD'),
    branch: run('git rev-parse --abbrev-ref HEAD'),
  };
}

// Sanitized retrieved-source packet for the audit artifact: metadata plus
// the exact excerpt the pipeline stored, never headers, keys or envelopes.
function sanitizeRetrievedSources(sources: RetrievedSource[]) {
  return sources.map((entry) => ({
    id: entry.source.id,
    url: entry.source.url,
    title: entry.source.title,
    publisher: entry.source.publisher,
    authority: entry.source.authority,
    retrievalRoute: entry.source.retrieval,
    retrievedAt: entry.source.retrievedAt,
    publishedAt: entry.source.publishedAt,
    stale: entry.source.stale,
    contentHash: entry.source.contentHash,
    fullTextLength: entry.text.length,
    excerpt: entry.source.excerpt,
  }));
}

async function runLiveCase(definition: LiveCaseDefinition) {
  const caseRequest: TaskInput = definition.buildRequest();
  const client = new NebiusClient(config);
  const tavily = new TavilyClient(config);

  const intake = await runIntake(client, caseRequest);
  // Do not invent personal facts to silence clarification questions. The
  // model must retain any unresolved uncertainty in the resulting plan.
  const answers = intake.questions.map((entry) => ({
    question: entry.question,
    answer:
      'No additional personal fact is supplied. Keep any resulting uncertainty explicit and do not guess.',
  }));

  const result = await runPlan(
    client,
    tavily,
    {
      ...caseRequest,
      goal: intake.goal,
      searchQueries: intake.searchQueries,
      answers,
    },
    { includeDiagnostics: true },
  );
  if (result.plan.runtime.mode !== 'live' || result.plan.runtime.provider !== 'nebius') {
    throw new Error('The successful result did not contain a live Nebius receipt.');
  }

  const acceptance: CaseAcceptanceResult = evaluateEvidenceAcceptance(definition, {
    request: caseRequest,
    plan: result.plan,
    metrics: result.metrics,
    diagnostics: result.diagnostics,
    sources: result.sources,
  });

  const stepDecisions = result.plan.steps.map((step) => ({
    id: step.id,
    title: step.title,
    finalStatus: step.status,
    citationCount: step.evidence.length,
    notes: step.notes,
  }));

  const artifact = {
    // Inference receipt: true ONLY because a real keyed Nebius call completed.
    // It does not imply the evidence-quality acceptance case passed.
    liveInferenceVerified: true,
    verifiedAt: new Date().toISOString(),
    mode: result.plan.runtime.mode,
    codeRevision: readCodeRevision(),
    case: {
      id: definition.caseId,
      expectedJurisdiction: definition.expectedJurisdiction,
      request: caseRequest,
      expectedSourceUrls: [...definition.expectedSourceUrls],
    },
    note: 'Genuine live API calls for this run only. Not a production availability or future-performance guarantee.',
    provider: {
      id: result.plan.runtime.provider,
      model: result.plan.runtime.model,
      responseId: result.plan.runtime.responseId ?? null,
      latencyMs: result.plan.runtime.latencyMs,
      usage: result.plan.runtime.usage,
    },
    intakeRuntime: intake.runtime,
    planRuntime: result.plan.runtime,
    retrieval: {
      requestedUrlOutcomes: acceptance.requestedUrlOutcomes,
      retrievedSources: sanitizeRetrievedSources(result.sources),
      warnings: result.plan.warnings,
      tavilyCalls: result.plan.runtime.retrieval.tavilyCalls,
      directFetches: result.plan.runtime.retrieval.directFetches,
      tavilyRequestIds: result.plan.runtime.retrieval.tavilyRequestIds,
    },
    stepCounts: {
      total: result.plan.steps.length,
      supported: result.plan.steps.filter((step) => step.status === 'supported').length,
      unverifiable: result.plan.steps.filter((step) => step.status === 'unverifiable').length,
    },
    beforeAfter: {
      modelClaimedSupported: result.metrics.modelSupportedClaims,
      validatedSupported: result.metrics.validatedSupportedClaims,
      downgraded: result.metrics.contradictedClaimCount,
      invalidCitationsRemoved: result.metrics.invalidCitationCount,
      stepDecisions,
    },
    contradictionDiagnostics: result.diagnostics,
    reasonCodeCounts: acceptance.reasonCodeCounts,
    unresolvedQuestions: result.plan.unresolvedQuestions,
    metrics: result.metrics,
    intakeQuestions: intake.questions,
    // Separate, explicit evidence-quality verdict. A model response alone can
    // never set this to true: see every check inside caseAcceptance.checks.
    caseAcceptance: {
      caseId: acceptance.caseId,
      evaluatedAt: acceptance.evaluatedAt,
      passed: acceptance.passed,
      checks: acceptance.checks,
      reasons: acceptance.reasons,
      trapCoverage: acceptance.trapCoverage,
      contradictionCount: acceptance.contradictionCount,
    },
    plan: result.plan,
  };

  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../artifacts/live-verification.json', import.meta.url),
    JSON.stringify(artifact, null, 2),
  );

  console.log(`LIVE NEBIUS VERIFIED: ${result.plan.runtime.model}`);
  console.log(`Case: ${definition.caseId}`);
  console.log(`Plan response ID: ${result.plan.runtime.responseId ?? 'not supplied by provider'}`);
  console.log(
    `Validated steps: ${result.plan.steps.length}; supported: ${artifact.stepCounts.supported}; downgraded: ${artifact.beforeAfter.downgraded}`,
  );
  const retrieved = acceptance.requestedUrlOutcomes.filter(
    (entry) => entry.outcome === 'retrieved',
  ).length;
  console.log(
    `Official URLs retrieved: ${retrieved}/${acceptance.requestedUrlOutcomes.length}; diagnostics: ${result.diagnostics.length} records`,
  );
  if (acceptance.passed) {
    console.log('CASE ACCEPTANCE: PASS — every Nigerian evidence-quality check succeeded.');
  } else {
    console.log('CASE ACCEPTANCE: FAIL — live inference succeeded but evidence checks did not:');
    for (const reason of acceptance.reasons) console.log(`  - ${reason}`);
  }
  console.log(
    'Receipt, retrieval ledger, excerpts and diagnostics written to ignored artifacts/live-verification.json. This does not verify a public deployment.',
  );

  return acceptance.passed;
}

async function main() {
  let caseId: string;
  let definition: LiveCaseDefinition;
  try {
    caseId = parseCaseId(process.argv.slice(2));
    definition = selectCase(caseId);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Could not resolve the live case.');
    process.exitCode = 1;
    return;
  }

  if (!config.nebiusApiKey) {
    console.error(
      'BLOCKED: no Nebius credential is configured. No live request was made and no compliance claim can be established.',
    );
    console.error(
      `Target case: ${caseId}. Available cases: ${LIVE_CASES.map((entry) => entry.caseId).join(', ')}`,
    );
    console.error(
      'Required environment variable: NEBIUS_API_KEY (or NEBIUS_TOKEN_FACTORY_API_KEY). ' +
        'Optional: NEBIUS_BASE_URL, NEBIUS_MODEL, TAVILY_API_KEY.',
    );
    console.error(
      'Add the credential(s) to .env, then rerun exactly: npm run verify:live ' +
        '(or npm run verify:live -- --case=<case-id>). Fixtures and samples are not substitutes for a keyed run.',
    );
    process.exitCode = 2;
    return;
  }

  try {
    const passed = await runLiveCase(definition);
    // Distinct exit code so CI or an operator can tell "inference worked, the
    // evidence-quality acceptance did not" apart from a hard runtime failure.
    process.exitCode = passed ? 0 : 3;
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error ? String(error.code) : 'UNKNOWN';
    console.error(
      `LIVE VERIFICATION FAILED [${code}]: ${error instanceof Error ? error.message : 'Unknown provider error'}`,
    );
    console.error(
      'No live verification artifact was written. Check model access, structured-output support, quota, source reachability and retrieval configuration.',
    );
    process.exitCode = 1;
  }
}

void main();
