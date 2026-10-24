import { execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { getConfig } from '../server/config';
import { NebiusClient } from '../server/lib/nebius';
import { runIntake, runPlan } from '../server/lib/plan';
import { TavilyClient } from '../server/lib/tavily';
import type { TaskInput } from '../src/shared/schemas';

const config = getConfig();

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

if (!config.nebiusApiKey) {
  console.error(
    'BLOCKED: no Nebius credential is configured. No live request was made and no compliance claim can be established.',
  );
  console.error(
    'Required environment variable: NEBIUS_API_KEY (or NEBIUS_TOKEN_FACTORY_API_KEY). ' +
      'Optional: NEBIUS_BASE_URL, NEBIUS_MODEL, TAVILY_API_KEY.',
  );
  console.error(
    'Add the credential(s) to .env, then rerun exactly: npm run verify:live. ' +
      'The labelled sample and every fixture are not substitutes for a keyed run.',
  );
  process.exitCode = 2;
} else {
  const documentText = `Renew or replace your adult passport

It costs £102 to renew or replace your passport if you apply online or £115.50 if you fill in a paper form.

You must be aged 16 or over (or turning 16 in the next 3 weeks) to get an adult passport.

Check how long it will take to get a passport before you apply.

Do not book travel until you have a valid passport - your new passport will not have the same number as your old one.

You can track your passport application using your application reference number.`;

  const input: TaskInput = {
    task: 'Create an action plan to renew my adult UK passport online.',
    jurisdiction: 'United Kingdom',
    category: 'Travel & identity',
    details:
      'The applicant is 32, lives in the UK, is renewing a standard adult passport, prefers the online route, and is not asking about an urgent service.',
    sourceUrls: [],
    document: { name: 'govuk-renewal-excerpt-2026-10-23.txt', text: documentText },
  };

  try {
    const client = new NebiusClient(config);
    const tavily = new TavilyClient(config);
    const intake = await runIntake(client, input);
    // Do not invent personal facts to silence clarification questions. The model
    // must retain any unresolved uncertainty in the resulting plan.
    const answers = intake.questions.map((entry) => ({
      question: entry.question,
      answer:
        'No additional personal fact is supplied. Keep any resulting uncertainty explicit and do not guess.',
    }));
    const result = await runPlan(
      client,
      tavily,
      {
        ...input,
        goal: intake.goal,
        searchQueries: intake.searchQueries,
        answers,
      },
      { includeDiagnostics: true },
    );
    if (result.plan.runtime.mode !== 'live' || result.plan.runtime.provider !== 'nebius') {
      throw new Error('The successful result did not contain a live Nebius receipt.');
    }

    // Sanitized retrieval ledger: primitive metadata and clipped excerpts
    // only. Headers, API keys, request envelopes and full page bodies are
    // never written to the artifact.
    const retrievalLedger = result.sources.map((entry) => ({
      id: entry.source.id,
      url: entry.source.url,
      title: entry.source.title,
      publisher: entry.source.publisher,
      authority: entry.source.authority,
      route: entry.source.retrieval,
      retrievedAt: entry.source.retrievedAt,
      stale: entry.source.stale,
      contentHash: entry.source.contentHash,
      excerpt: entry.source.excerpt,
    }));
    const stepDecisions = result.plan.steps.map((step) => ({
      id: step.id,
      title: step.title,
      finalStatus: step.status,
      citationCount: step.evidence.length,
      notes: step.notes,
    }));
    const reasonCodeCounts = result.diagnostics.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.reasonCode] = (acc[entry.reasonCode] ?? 0) + 1;
      return acc;
    }, {});

    const artifact = {
      // Explicit compliance flag: this file is only ever written by a real
      // keyed run, so the literal true here is evidence, never a default.
      liveInferenceVerified: true,
      verifiedAt: new Date().toISOString(),
      mode: result.plan.runtime.mode,
      codeRevision: readCodeRevision(),
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
        ledger: retrievalLedger,
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
      reasonCodeCounts,
      metrics: result.metrics,
      intakeQuestions: intake.questions,
      plan: result.plan,
    };
    await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
    await writeFile(
      new URL('../artifacts/live-verification.json', import.meta.url),
      JSON.stringify(artifact, null, 2),
    );
    console.log(`LIVE NEBIUS VERIFIED: ${result.plan.runtime.model}`);
    console.log(
      `Plan response ID: ${result.plan.runtime.responseId ?? 'not supplied by provider'}`,
    );
    console.log(
      `Validated steps: ${result.plan.steps.length}; supported: ${artifact.stepCounts.supported}; downgraded: ${artifact.beforeAfter.downgraded}`,
    );
    console.log(
      `Retrieval ledger: ${retrievalLedger.length} source(s), tavily=${artifact.retrieval.tavilyCalls} direct=${artifact.retrieval.directFetches}`,
    );
    console.log(
      'Receipt, retrieval ledger and contradiction diagnostics written to ignored artifacts/live-verification.json. This does not verify a public deployment.',
    );
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error ? String(error.code) : 'UNKNOWN';
    console.error(
      `LIVE VERIFICATION FAILED [${code}]: ${error instanceof Error ? error.message : 'Unknown provider error'}`,
    );
    console.error(
      'No live verification artifact was written. Check model access, structured-output support, quota, and source discovery configuration.',
    );
    process.exitCode = 1;
  }
}
