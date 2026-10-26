import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { ContradictionDiagnostic } from '../server/lib/claim-checks';
import { validateEvidencePlan } from '../server/lib/evidence';
import type { RetrievedSource } from '../server/lib/retrieval';
import {
  KNOWN_REASON_CODES,
  evaluateEvidenceAcceptance,
  type LiveCaseDefinition,
  type TrapObservation,
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

function validatedFixture() {
  const sources = makeNigeriaOfficialSources();
  const modelPlan = makeNigeriaOfficialModelPlan();
  const output = validateEvidencePlan({
    modelPlan,
    sources,
    input: makeNigeriaOfficialInput(),
    runtime: nigeriaOfficialReceipt,
    id: 'live-acceptance-offline-fixture',
    includeDiagnostics: true,
  });
  return { sources, modelPlan, ...output };
}

function evaluateOffline(requestOverride?: Partial<TaskInput>, sourceOverride?: RetrievedSource[]) {
  const definition = buildDefinition();
  const sources = sourceOverride ?? makeNigeriaOfficialSources();
  const modelPlan = makeNigeriaOfficialModelPlan();
  const { plan, metrics, diagnostics } = validateEvidencePlan({
    modelPlan,
    sources,
    input: makeNigeriaOfficialInput(),
    runtime: nigeriaOfficialReceipt,
    id: 'live-acceptance-offline-fixture',
    includeDiagnostics: true,
  });
  const request = { ...buildNigeriaTaskInput(), ...requestOverride };
  return evaluateEvidenceAcceptance(definition, {
    request,
    modelPlan,
    plan,
    metrics,
    diagnostics,
    sources,
  });
}

// A fully populated synthetic contradiction record for evaluator tests. It
// is clearly test-constructed and is never represented as a live result.
function contradictionDiagnostic(
  overrides: Partial<ContradictionDiagnostic>,
): ContradictionDiagnostic {
  return {
    instructionId: 'portal-nin',
    sourceId: 'S4',
    sentence: 'Synthetic trap sentence for an offline evaluator test.',
    clause: null,
    requestedRoute: { online: true, paper: false, inPerson: true, consular: false, abroad: false },
    sentenceRoutes: ['paper'],
    locationScope: 'domestic',
    negationCues: ['not'],
    negatedTerms: [],
    alignedTerms: ['portal'],
    subjectActionAligned: true,
    routeAligned: true,
    circumstanceAligned: true,
    decision: 'contradiction',
    reasonCode: 'negated-requirement',
    findingKind: 'negated-requirement',
    ...overrides,
  };
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

  it('registers the Nigeria case as the unique default with seven trap relationships', () => {
    expect(DEFAULT_CASE_ID).toBe(NIGERIA_CASE_ID);
    expect(LIVE_CASES).toHaveLength(1);
    expect(selectCase(DEFAULT_CASE_ID).caseId).toBe(NIGERIA_CASE_ID);
    expect(() => selectCase('does-not-exist')).toThrow(/Unknown live case/);
    const ids = NIGERIA_TRAP_CLASSES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(7);
    for (const trap of NIGERIA_TRAP_CLASSES) {
      expect(trap.protectedStepPattern).toBeInstanceOf(RegExp);
      expect(trap.applicableStepPattern).toBeInstanceOf(RegExp);
    }
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
    expect(ids).toContain('no-false-positive-trap-downgrades');
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it('records a retrieved, provenance-qualified outcome for every requested official URL', () => {
    const result = evaluateOffline();
    expect(result.requestedUrlOutcomes).toHaveLength(4);
    expect(result.requestedUrlOutcomes.map((entry) => entry.outcome)).toEqual([
      'retrieved',
      'retrieved',
      'retrieved',
      'retrieved',
    ]);
    for (const entry of result.requestedUrlOutcomes) {
      expect(entry.liveRetrievalQualified).toBe(true);
      expect(entry.provenanceIssues).toEqual([]);
      expect(entry.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entry.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.excerptLength).toBeGreaterThan(0);
      expect(entry.authority).toBe('official');
      expect(['direct', 'tavily']).toContain(entry.retrievalRoute);
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
    // Bank-charge wording is exercised through the sentence-less currency
    // record, which may only attach to the bank-charges class.
    const bankTrap = byId.get('bank-charges-excluded-vs-included')!;
    expect(bankTrap.materialRetrieved).toBe(true);
    expect(bankTrap.exercised).toBe(true);
    expect(bankTrap.observations[0].classification).toBe('legitimate');
    // Other passages exist in the retrieved sources, but the matching
    // wording is affirmative or out of scope, so no contradiction decision
    // was required: material present, not a false gap, and — crucially —
    // the sentence-less currency record never fans out into these classes.
    for (const id of [
      'online-submission-vs-in-person-biometrics',
      'printed-photo-vs-unrelated-steps',
      'foreign-consulate-cutoff-vs-domestic-submission',
    ]) {
      expect(byId.get(id)!.materialRetrieved).toBe(true);
      expect(byId.get(id)!.exercised).toBe(false);
      expect(byId.get(id)!.observations).toEqual([]);
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

  it('classifies the genuine fee and bank-charge downgrades as legitimate contradictions, not false positives', () => {
    const result = evaluateOffline();
    expect(result.falsePositiveViolations).toEqual([]);
    expect(result.legitimateContradictions).toBeGreaterThanOrEqual(2);
    const observations = result.trapCoverage.flatMap((entry) => entry.observations);
    const classifications = new Map(
      observations.map((entry: TrapObservation) => [entry.reasonCode, entry.classification]),
    );
    expect(classifications.get('fee-context-mismatch')).toBe('legitimate');
    // The bank-charges trap previously surfaced as an ungrounded-currency
    // record only because the bare-prefix naira amount ("N100,000") could not
    // be parsed. With generic bare-prefix parsing plus document-level pricing
    // policy, it now downgrades precisely via fee-context-mismatch, so no
    // ungrounded-currency decision remains in this fixture — and every
    // observed decision is still a legitimate same-subject downgrade.
    expect(classifications.has('ungrounded-currency')).toBe(false);
    for (const classification of classifications.values()) {
      expect(classification).toBe('legitimate');
    }
    // Every observation resolves to the actual final step id, title and status.
    for (const observation of observations) {
      expect(observation.finalStepId).toMatch(/^step-\d+$/);
      expect(observation.stepTitle).toBeTruthy();
      expect(observation.finalStepStatus).toBe('unverifiable');
    }
  });

  it('fails acceptance when a retrieved trap passage downgrades a protected unrelated domestic step', () => {
    const definition = buildDefinition();
    const fixture = validatedFixture();
    const plan: Plan = structuredClone(fixture.plan);
    // Simulate the original production class: a printed-photograph passage
    // downgrades the unrelated portal/NIN step (model id portal-nin → step-1).
    const portalStep = plan.steps.find((step) => step.id === 'step-1')!;
    portalStep.status = 'unverifiable';
    const diagnostic = contradictionDiagnostic({
      instructionId: 'portal-nin',
      sourceId: 'S4',
      sentence: 'You need two identical printed photos if you are applying using a paper form.',
      reasonCode: 'negated-requirement',
    });
    const result = evaluateEvidenceAcceptance(definition, {
      request: buildNigeriaTaskInput(),
      modelPlan: fixture.modelPlan,
      plan,
      metrics: fixture.metrics,
      diagnostics: [...fixture.diagnostics, diagnostic],
      sources: fixture.sources,
    });
    expect(result.passed).toBe(false);
    expect(result.reasons.join(' ')).toContain('no-false-positive-trap-downgrades');
    expect(result.falsePositiveViolations.join(' ')).toContain('printed-photo-vs-unrelated-steps');
    const photoTrap = result.trapCoverage.find(
      (entry) => entry.trapId === 'printed-photo-vs-unrelated-steps',
    )!;
    const observation = photoTrap.observations[0];
    expect(observation.classification).toBe('false-positive');
    expect(observation.stepTitle).toBe(portalStep.title);
    expect(observation.finalStepStatus).toBe('unverifiable');
    expect(observation.sourceId).toBe('S4');
  });

  it('keeps a same-subject, same-route photo prohibition as a legitimate contradiction', () => {
    const definition = buildDefinition();
    const fixture = validatedFixture();
    // Add a model step and its renumbered final counterpart that genuinely
    // instructs posting printed photos — the prohibition applies directly.
    const modelPlan = structuredClone(fixture.modelPlan);
    modelPlan.steps.push({
      id: 'post-photos',
      title: 'Post printed photos with your online application',
      instruction: 'Post printed photos with your online application.',
      completionCriteria: 'Printed photos are mailed.',
      claimedStatus: 'supported',
      evidence: [],
      dueDate: null,
      dependsOn: [],
    });
    const plan: Plan = structuredClone(fixture.plan);
    plan.steps.push({
      id: `step-${plan.steps.length + 1}`,
      title: 'Post printed photos with your online application',
      instruction: 'Post printed photos with your online application.',
      completionCriteria: 'Printed photos are mailed.',
      status: 'unverifiable',
      evidence: [],
      dueDate: null,
      dependsOn: [],
      userEdited: false,
      notes: [],
    });
    const diagnostic = contradictionDiagnostic({
      instructionId: 'post-photos',
      sourceId: 'S4',
      sentence: 'You need two identical printed photos if you are applying using a paper form.',
    });
    const result = evaluateEvidenceAcceptance(definition, {
      request: buildNigeriaTaskInput(),
      modelPlan,
      plan,
      metrics: fixture.metrics,
      diagnostics: [...fixture.diagnostics, diagnostic],
      sources: fixture.sources,
    });
    const photoTrap = result.trapCoverage.find(
      (entry) => entry.trapId === 'printed-photo-vs-unrelated-steps',
    )!;
    expect(photoTrap.observations[0].classification).toBe('legitimate');
    expect(result.falsePositiveViolations).toEqual([]);
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
    expect(
      result.requestedUrlOutcomes.every((entry) => entry.liveRetrievalQualified === false),
    ).toBe(true);
  });

  it('rejects sources with missing, malformed or stale timestamps and non-pipeline routes', () => {
    const definition = buildDefinition();
    const fixture = validatedFixture();
    const runStartedAt = new Date().toISOString();
    const singleSource = (
      mutate: (source: RetrievedSource) => RetrievedSource,
      stamp?: string | null,
    ) => {
      const source = mutate(structuredClone(fixture.sources[0]));
      if (stamp !== undefined) source.source.retrievedAt = stamp as string;
      return evaluateEvidenceAcceptance(definition, {
        request: buildNigeriaTaskInput(),
        modelPlan: fixture.modelPlan,
        plan: fixture.plan,
        metrics: fixture.metrics,
        diagnostics: fixture.diagnostics,
        sources: [source],
        runStartedAt: stamp === undefined ? undefined : runStartedAt,
      });
    };

    const missingStamp = singleSource((s) => s, null);
    expect(missingStamp.passed).toBe(false);
    expect(missingStamp.requestedUrlOutcomes[0].provenanceIssues.join(' ')).toMatch(/timestamp/);

    const malformedStamp = singleSource((s) => s, '2026-10-24 00:00:00');
    expect(malformedStamp.requestedUrlOutcomes[0].liveRetrievalQualified).toBe(false);
    expect(malformedStamp.requestedUrlOutcomes[0].provenanceIssues.join(' ')).toMatch(/timestamp/);

    const uploaded = singleSource((s) => {
      s.source.retrieval = 'upload';
      return s;
    }, new Date().toISOString());
    expect(uploaded.requestedUrlOutcomes[0].provenanceIssues.join(' ')).toMatch(
      /not a live direct\/tavily fetch/,
    );

    const badHash = singleSource((s) => {
      s.text = `${s.text} appended after hashing`;
      return s;
    }, new Date().toISOString());
    expect(badHash.requestedUrlOutcomes[0].provenanceIssues.join(' ')).toMatch(/content hash/);

    // A frozen fixture stamp cannot evidence a live run when the run window
    // is supplied...
    const frozen = singleSource((s) => s, fixture.sources[0].source.retrievedAt);
    expect(frozen.requestedUrlOutcomes[0].liveRetrievalQualified).toBe(false);
    expect(frozen.requestedUrlOutcomes[0].provenanceIssues.join(' ')).toMatch(
      /frozen or stale stamp/,
    );
    // ...while a genuinely fresh timestamp inside the run window qualifies.
    const freshSource = structuredClone(fixture.sources[0]);
    freshSource.source.retrievedAt = new Date().toISOString();
    const fresh = evaluateEvidenceAcceptance(definition, {
      request: buildNigeriaTaskInput(),
      modelPlan: fixture.modelPlan,
      plan: fixture.plan,
      metrics: fixture.metrics,
      diagnostics: fixture.diagnostics,
      sources: [freshSource],
      runStartedAt,
    });
    expect(fresh.requestedUrlOutcomes[0].liveRetrievalQualified).toBe(true);
    expect(fresh.requestedUrlOutcomes[0].provenanceIssues).toEqual([]);
    expect(
      fresh.checks.find((check) => check.id === 'official-source-genuinely-retrieved')!.passed,
    ).toBe(true);
  });

  it('fails on a supported fully-online/no-visit step or included-bank-charges claim', () => {
    const definition = buildDefinition();
    const fixture = validatedFixture();
    const officialId = fixture.sources[0].source.id;
    const mutated: Plan = structuredClone(fixture.plan);
    mutated.steps.push({
      id: 'step-trap',
      title: 'Complete the entire renewal online',
      instruction:
        'Complete the entire renewal online without visiting an immigration office or attending biometric capture.',
      completionCriteria: 'No office visit occurs.',
      status: 'supported',
      evidence: [{ sourceId: officialId, quote: fixture.plan.steps[0].evidence[0].quote }],
      dueDate: null,
      dependsOn: [],
      userEdited: false,
      notes: [],
    });
    const noVisit = evaluateEvidenceAcceptance(definition, {
      request: buildNigeriaTaskInput(),
      modelPlan: fixture.modelPlan,
      plan: mutated,
      metrics: fixture.metrics,
      diagnostics: fixture.diagnostics,
      sources: fixture.sources,
    });
    expect(noVisit.passed).toBe(false);
    expect(noVisit.reasons.join(' ')).toContain('no-supported-online-only-completion');

    const chargesPlan: Plan = structuredClone(fixture.plan);
    chargesPlan.steps.push({
      id: 'step-charges',
      title: 'Pay a fee including bank charges',
      instruction:
        'Pay NGN 100,000 including bank charges for the domestic 32-page 5-year renewal.',
      completionCriteria: 'Charges are bundled into the fee.',
      status: 'supported',
      evidence: [{ sourceId: officialId, quote: fixture.plan.steps[0].evidence[0].quote }],
      dueDate: null,
      dependsOn: [],
      userEdited: false,
      notes: [],
    });
    const charges = evaluateEvidenceAcceptance(definition, {
      request: buildNigeriaTaskInput(),
      modelPlan: fixture.modelPlan,
      plan: chargesPlan,
      metrics: fixture.metrics,
      diagnostics: fixture.diagnostics,
      sources: fixture.sources,
    });
    expect(charges.passed).toBe(false);
    expect(charges.reasons.join(' ')).toContain('included-bank-charges');
  });

  it('fails when the live receipt is incomplete or diagnostics carry an unknown reason code', () => {
    const definition = buildDefinition();
    const fixture = validatedFixture();
    const sampleMode: Plan = structuredClone(fixture.plan);
    sampleMode.runtime = { ...sampleMode.runtime, mode: 'sample', responseId: null };
    const receipt = evaluateEvidenceAcceptance(definition, {
      request: buildNigeriaTaskInput(),
      modelPlan: fixture.modelPlan,
      plan: sampleMode,
      metrics: fixture.metrics,
      diagnostics: fixture.diagnostics,
      sources: fixture.sources,
    });
    expect(receipt.passed).toBe(false);
    expect(receipt.reasons.join(' ')).toContain('live-provider-receipt');

    const malformed = evaluateEvidenceAcceptance(definition, {
      request: buildNigeriaTaskInput(),
      modelPlan: fixture.modelPlan,
      plan: fixture.plan,
      metrics: fixture.metrics,
      diagnostics: [
        ...fixture.diagnostics,
        {
          ...fixture.diagnostics[0],
          // Deliberately outside the documented reason-code vocabulary.
          reasonCode: 'made-up-code' as never,
          decision: 'contradiction',
        },
      ],
      sources: fixture.sources,
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
    expect(sla.liveRetrievalQualified).toBe(false);
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
