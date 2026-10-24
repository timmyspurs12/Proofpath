import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { validateEvidencePlan } from '../server/lib/evidence';
import type { RetrievedSource } from '../server/lib/retrieval';
import {
  KNOWN_REASON_CODES,
  evaluateEvidenceAcceptance,
  type LiveCaseDefinition,
} from '../scripts/live-acceptance';
import { DEFAULT_CASE_ID, LIVE_CASES, selectCase } from '../scripts/live-cases';
import {
  NIGERIA_CASE_ID,
  NIGERIA_OFFICIAL_SOURCE_URLS,
  NIGERIA_TRAP_CLASSES,
  buildNigeriaTaskInput,
} from '../scripts/live-cases/nigeria-domestic-renewal';
import { TaskInputSchema, type Plan, type TaskInput } from '../src/shared/schemas';
import {
  makeNigeriaOfficialInput,
  makeNigeriaOfficialModelPlan,
  makeNigeriaOfficialSources,
  nigeriaOfficialReceipt,
} from './fixtures/nigeria-official-2026';

const execFileAsync = promisify(execFile);

// OFFLINE tests only. The evaluator is a pure function exercised against the
// labelled frozen Nigeria fixture; no test here makes a network call or a
// live inference request, and the fixture receipt is explicitly not a live
// claim. The actual keyed run is `npm run verify:live` (blocked without
// NEBIUS_API_KEY in this sandbox).
function buildDefinition(): LiveCaseDefinition {
  return selectCase(NIGERIA_CASE_ID);
}

function evaluateOffline(requestOverride?: Partial<TaskInput>, sourceOverride?: RetrievedSource[]) {
  const definition = buildDefinition();
  const sources = sourceOverride ?? makeNigeriaOfficialSources();
  const { plan, metrics, diagnostics } = validateEvidencePlan({
    modelPlan: makeNigeriaOfficialModelPlan(),
    sources,
    input: makeNigeriaOfficialInput(),
    runtime: nigeriaOfficialReceipt,
    id: 'live-acceptance-offline-fixture',
    includeDiagnostics: true,
  });
  const request = { ...buildNigeriaTaskInput(), ...requestOverride };
  return evaluateEvidenceAcceptance(definition, {
    request,
    plan,
    metrics,
    diagnostics,
    sources,
  });
}

describe('Nigeria live-case definition', () => {
  it('targets the adult domestic online renewal with the four official URLs and no document', () => {
    const request = buildNigeriaTaskInput();
    const parsed = TaskInputSchema.parse(request);
    expect(parsed.jurisdiction).toBe('Nigeria');
    expect(parsed.document).toBeNull();
    expect(parsed.sourceUrls).toEqual([...NIGERIA_OFFICIAL_SOURCE_URLS]);
    const context = `${request.task} ${request.details}`;
    expect(context).toMatch(/adult/i);
    expect(context).toMatch(/domestic/i);
    expect(context).toMatch(/online/i);
    expect(context).not.toMatch(/consular|diaspora/i);
  });

  it('registers the Nigeria case as the unique default with seven trap classes', () => {
    expect(DEFAULT_CASE_ID).toBe(NIGERIA_CASE_ID);
    expect(LIVE_CASES).toHaveLength(1);
    expect(selectCase(DEFAULT_CASE_ID).caseId).toBe(NIGERIA_CASE_ID);
    expect(() => selectCase('does-not-exist')).toThrow(/Unknown live case/);
    const ids = NIGERIA_TRAP_CLASSES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(7);
  });
});

describe('Nigeria evidence-quality acceptance evaluator (offline fixtures)', () => {
  it('passes every acceptance check on the validated official-source fixture', () => {
    const result = evaluateOffline();
    expect(result.passed).toBe(true);
    expect(result.reasons).toEqual([]);
    const ids = result.checks.map((check) => check.id);
    expect(ids).toContain('request-targets-adult-domestic-online-case');
    expect(ids).toContain('official-source-genuinely-retrieved');
    expect(ids).toContain('genuine-live-provider-receipt');
    expect(ids).toContain('in-person-biometric-obligation-supported');
    expect(ids).toContain('no-supported-online-only-completion');
    expect(ids).toContain('no-supported-included-bank-charges-claim');
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it('records a retrieved outcome for every requested official URL', () => {
    const result = evaluateOffline();
    expect(result.requestedUrlOutcomes).toHaveLength(4);
    expect(result.requestedUrlOutcomes.map((entry) => entry.outcome)).toEqual([
      'retrieved',
      'retrieved',
      'retrieved',
      'retrieved',
    ]);
    for (const entry of result.requestedUrlOutcomes) {
      expect(entry.retrievedAt).toBeTruthy();
      expect(entry.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.excerptLength).toBeGreaterThan(0);
      expect(entry.authority).toBe('official');
    }
  });

  it('distinguishes retrieved trap material from evaluated trap decisions', () => {
    const result = evaluateOffline();
    expect(result.trapCoverage).toHaveLength(7);
    const byId = new Map(result.trapCoverage.map((entry) => [entry.trapId, entry]));
    // The fee-scope trap is fully exercised: a retrieved passage produced a
    // fee-context-mismatch contradiction decision.
    const feeTrap = byId.get('domestic-ngn-vs-diaspora-usd-fees')!;
    expect(feeTrap.materialRetrieved).toBe(true);
    expect(feeTrap.evaluated).toBe(true);
    expect(feeTrap.exercised).toBe(true);
    // Bank-charge and biometric wording exists in the retrieved official
    // sources, but the matching passages are affirmative so the engine needed
    // no contradiction decision: material present, not a false gap.
    for (const id of [
      'bank-charges-excluded-vs-included',
      'online-submission-vs-in-person-biometrics',
      'printed-photo-vs-unrelated-steps',
      'foreign-consulate-cutoff-vs-domestic-submission',
    ]) {
      expect(byId.get(id)!.materialRetrieved).toBe(true);
      expect(byId.get(id)!.exercised).toBe(false);
    }
    // No consular internet-facility or age-rule passage was retrieved at all.
    for (const id of ['consular-internet-vs-domestic-online', 'age-specific-vs-adult-applicant']) {
      expect(byId.get(id)!.materialRetrieved).toBe(false);
      expect(byId.get(id)!.exercised).toBe(false);
    }
    // Every emitted reason code belongs to the documented vocabulary.
    for (const code of Object.keys(result.reasonCodeCounts)) {
      expect(KNOWN_REASON_CODES.has(code as never)).toBe(true);
    }
  });

  it('fails when the request targets the wrong jurisdiction or injects a document', () => {
    const wrongJurisdiction = evaluateOffline({ jurisdiction: 'Kenya' });
    expect(wrongJurisdiction.passed).toBe(false);
    expect(wrongJurisdiction.reasons.join(' ')).toContain('request-targets');

    const withDocument = evaluateOffline({
      document: { name: 'frozen-excerpt.txt', text: 'preloaded official text' },
    });
    expect(withDocument.passed).toBe(false);
    expect(withDocument.reasons.join(' ')).toMatch(/injects a document|online-route case/);
  });

  it('fails when no official-host source was genuinely retrieved', () => {
    const secondaryOnly = makeNigeriaOfficialSources().map((entry) => ({
      ...entry,
      source: { ...entry.source, authority: 'secondary' as const },
    }));
    const result = evaluateOffline(undefined, secondaryOnly);
    expect(result.passed).toBe(false);
    const ids = result.checks.filter((check) => !check.passed).map((check) => check.id);
    expect(ids).toContain('official-source-genuinely-retrieved');
  });

  it('fails on a supported fully-online/no-visit step or included-bank-charges claim', () => {
    const definition = buildDefinition();
    const sources = makeNigeriaOfficialSources();
    const { plan, metrics, diagnostics } = validateEvidencePlan({
      modelPlan: makeNigeriaOfficialModelPlan(),
      sources,
      input: makeNigeriaOfficialInput(),
      runtime: nigeriaOfficialReceipt,
      id: 'live-acceptance-mutation-fixture',
      includeDiagnostics: true,
    });
    const officialId = sources[0].source.id;
    const mutated: Plan = structuredClone(plan);
    mutated.steps.push({
      id: 'step-trap',
      title: 'Complete the entire renewal online',
      instruction:
        'Complete the entire renewal online without visiting an immigration office or attending biometric capture.',
      completionCriteria: 'No office visit occurs.',
      status: 'supported',
      evidence: [{ sourceId: officialId, quote: plan.steps[0].evidence[0].quote }],
      dueDate: null,
      dependsOn: [],
      userEdited: false,
      notes: [],
    });
    const noVisit = evaluateEvidenceAcceptance(definition, {
      request: buildNigeriaTaskInput(),
      plan: mutated,
      metrics,
      diagnostics,
      sources,
    });
    expect(noVisit.passed).toBe(false);
    expect(noVisit.reasons.join(' ')).toContain('no-supported-online-only-completion');

    const chargesPlan: Plan = structuredClone(plan);
    chargesPlan.steps.push({
      id: 'step-charges',
      title: 'Pay a fee including bank charges',
      instruction:
        'Pay NGN 100,000 including bank charges for the domestic 32-page 5-year renewal.',
      completionCriteria: 'Charges are bundled into the fee.',
      status: 'supported',
      evidence: [{ sourceId: officialId, quote: plan.steps[0].evidence[0].quote }],
      dueDate: null,
      dependsOn: [],
      userEdited: false,
      notes: [],
    });
    const charges = evaluateEvidenceAcceptance(definition, {
      request: buildNigeriaTaskInput(),
      plan: chargesPlan,
      metrics,
      diagnostics,
      sources,
    });
    expect(charges.passed).toBe(false);
    expect(charges.reasons.join(' ')).toContain('included-bank-charges');
  });

  it('fails when the live receipt is incomplete or diagnostics carry an unknown reason code', () => {
    const definition = buildDefinition();
    const sources = makeNigeriaOfficialSources();
    const base = validateEvidencePlan({
      modelPlan: makeNigeriaOfficialModelPlan(),
      sources,
      input: makeNigeriaOfficialInput(),
      runtime: nigeriaOfficialReceipt,
      id: 'live-acceptance-receipt-fixture',
      includeDiagnostics: true,
    });
    const sampleMode: Plan = structuredClone(base.plan);
    sampleMode.runtime = { ...sampleMode.runtime, mode: 'sample', responseId: null };
    const receipt = evaluateEvidenceAcceptance(definition, {
      request: buildNigeriaTaskInput(),
      plan: sampleMode,
      metrics: base.metrics,
      diagnostics: base.diagnostics,
      sources,
    });
    expect(receipt.passed).toBe(false);
    expect(receipt.reasons.join(' ')).toContain('live-provider-receipt');

    const malformed = evaluateEvidenceAcceptance(definition, {
      request: buildNigeriaTaskInput(),
      plan: base.plan,
      metrics: base.metrics,
      diagnostics: [
        ...base.diagnostics,
        {
          ...base.diagnostics[0],
          // Deliberately outside the documented reason-code vocabulary.
          reasonCode: 'made-up-code' as never,
          decision: 'contradiction',
        },
      ],
      sources,
    });
    expect(malformed.passed).toBe(false);
    expect(malformed.reasons.join(' ')).toContain('diagnostics-threaded');
  });

  it('records a not-retrieved outcome for a missing official URL without failing on coverage alone', () => {
    const sources = makeNigeriaOfficialSources().filter(
      (entry) => entry.source.url !== NIGERIA_OFFICIAL_SOURCE_URLS[3],
    );
    const result = evaluateOffline(undefined, sources);
    const sla = result.requestedUrlOutcomes.find((entry) =>
      entry.url.endsWith('SERVICE-LEVEL-AGREEMENT-2026_.pdf'),
    )!;
    expect(sla.outcome).toBe('not-retrieved');
    expect(sla.retrievedAt).toBeNull();
    // Three official sources remain, so the case can still pass while the
    // missing PDF is transparently recorded rather than fabricated.
    expect(result.passed).toBe(true);
  });
});

describe('verify-live blocked path', () => {
  it('exits 2 and writes no artifact when no Nebius credential is present', async () => {
    const artifactPath = new URL('../artifacts/live-verification.json', import.meta.url);
    const existedBefore = existsSync(artifactPath);
    const env = {
      ...process.env,
      NEBIUS_API_KEY: '',
      NEBIUS_TOKEN_FACTORY_API_KEY: '',
    };
    await expect(
      execFileAsync('node', ['node_modules/tsx/dist/cli.mjs', 'scripts/verify-live.ts'], {
        cwd: process.cwd(),
        env,
      }),
    ).rejects.toMatchObject({ code: 2 });
    if (!existedBefore) expect(existsSync(artifactPath)).toBe(false);
  }, 15_000);
});
