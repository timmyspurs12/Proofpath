import { describe, expect, it } from 'vitest';
import { citationIsValid, validateEvidencePlan } from '../server/lib/evidence';
import {
  makeNigeriaOfficialInput,
  makeNigeriaOfficialModelPlan,
  makeNigeriaOfficialSources,
  nigeriaOfficialReceipt,
} from './fixtures/nigeria-official-2026';

// End-to-end validation over VERBATIM excerpts of four official Nigeria
// Immigration Service sources freshly fetched on 2026-10-24 (URLs live in the
// fixture). The test itself makes no network calls. The generic engine has no
// Nigeria-specific knowledge; every country fact is contained in the fixture.
describe('Nigeria domestic renewal against current official NIS sources', () => {
  function validate(includeDiagnostics = true) {
    return validateEvidencePlan({
      modelPlan: makeNigeriaOfficialModelPlan(),
      sources: makeNigeriaOfficialSources(),
      input: makeNigeriaOfficialInput(),
      runtime: nigeriaOfficialReceipt,
      id: 'ng-official-2026-fixture',
      includeDiagnostics,
    });
  }

  it('supports the six exactly-evidenced domestic steps and keeps every citation valid', () => {
    const { plan } = validate();
    const sources = makeNigeriaOfficialSources();
    const supported = plan.steps.filter((step) => step.status === 'supported');
    expect(supported.map((step) => step.id)).toEqual([
      'step-1',
      'step-2',
      'step-3',
      'step-4',
      'step-5',
      'step-6',
    ]);
    for (const step of supported) {
      expect(step.evidence.length).toBeGreaterThan(0);
      for (const citation of step.evidence) {
        expect(citationIsValid(citation, sources)).toBe(true);
      }
    }
  });

  it('keeps the service-fee and bank-charge distinction on the supported fee step', () => {
    const { plan } = validate();
    const feeStep = plan.steps.find((step) => step.title.includes('excluding bank charges'))!;
    expect(feeStep.status).toBe('supported');
    expect(feeStep.evidence.map((citation) => citation.sourceId)).toContain('S4');
    const exclusiveQuote = feeStep.evidence.find((citation) =>
      citation.quote.includes('All Prices are Exclusive of Bank Charges'),
    );
    expect(exclusiveQuote).toBeTruthy();
  });

  it('downgrades a dollar figure claimed domestically with a fee-context-mismatch diagnostic', () => {
    const { plan, diagnostics } = validate();
    const trap = plan.steps.find((step) => step.id === 'step-7')!;
    expect(trap.status).toBe('unverifiable');
    expect(trap.notes.join(' ')).toContain('scope does not match');
    const record = diagnostics.find(
      (entry) =>
        entry.instructionId === 'usd-scope-trap' && entry.reasonCode === 'fee-context-mismatch',
    );
    expect(record).toBeTruthy();
    expect(record!.decision).toBe('contradiction');
    expect(record!.sourceId).toBe('S3');
    // Both the domestic/abroad location scope and the 5/10-year validity
    // scope are surfaced as machine-readable reasons.
    expect(trap.notes.join(' ')).toContain('domestic');
    expect(trap.notes.join(' ')).toContain('abroad');
    expect(trap.notes.join(' ')).toMatch(/5-year|10-year/);
  });

  it('downgrades the included-bank-charges money claim against the exclusive-charges policy', () => {
    const { plan, diagnostics } = validate();
    const trap = plan.steps.find((step) => step.id === 'step-8')!;
    expect(trap.status).toBe('unverifiable');
    // The naira amount now parses, so the downgrade cites the precise
    // document-level pricing policy rather than a missing-amount gap.
    expect(trap.notes.join(' ')).toContain('exclude bank charges');
    const record = diagnostics.find(
      (entry) =>
        entry.instructionId === 'bank-charges-trap' && entry.reasonCode === 'fee-context-mismatch',
    );
    expect(record).toBeTruthy();
    expect(record!.decision).toBe('contradiction');
    // The exact provider charge is honestly retained as an open question.
    const question = plan.unresolvedQuestions.find((q) => q.id === 'bank-charge-amount');
    expect(question).toBeTruthy();
  });

  it('strips the fabricated no-visit citation instead of promoting the claim', () => {
    const { plan } = validate();
    const trap = plan.steps.find((step) => step.id === 'step-9')!;
    expect(trap.status).toBe('unverifiable');
    expect(trap.evidence).toHaveLength(0);
    expect(trap.notes.join(' ')).toContain('exact-passage validation');
  });

  it('keeps the in-person biometric requirement supported as an obligation, not an online-only route', () => {
    const { plan } = validate();
    const biometrics = plan.steps.find((step) => step.id === 'step-6')!;
    expect(biometrics.status).toBe('supported');
    const quotes = biometrics.evidence.map((citation) => citation.quote).join(' ');
    expect(quotes).toContain('required to appear');
    expect(quotes).toContain('biometric data capture');
  });

  it('reports final metrics and retains unresolved questions without inventing answers', () => {
    const { plan, metrics } = validate();
    expect(metrics).toMatchObject({
      stepCount: 9,
      validatedSupportedClaims: 6,
      unsupportedModelClaims: 3,
      invalidCitationCount: 1,
      contradictedClaimCount: 2,
      rejectedConflicts: 1,
    });
    expect(plan.unresolvedQuestions.map((q) => q.id)).toEqual([
      'bank-charge-amount',
      'centre-availability',
    ]);
    expect(plan.warnings.some((w) => w.includes('invalid model citation'))).toBe(true);
  });

  it('is deterministic across runs and omits diagnostics unless requested', () => {
    const first = validate();
    const second = validate();
    // Wall-clock receipt stamps are intentionally run-specific; every
    // decision-bearing field must be byte-identical across runs.
    const stripStamps = (plan: typeof first.plan) => {
      const { createdAt: _c, updatedAt: _u, ...rest } = plan;
      return rest;
    };
    expect(stripStamps(second.plan)).toEqual(stripStamps(first.plan));
    expect(second.diagnostics).toEqual(first.diagnostics);
    const silent = validate(false);
    expect(silent.diagnostics).toEqual([]);
  });

  it('freezes the four real official source URLs and the 2026-10-24 retrieval date', () => {
    const sources = makeNigeriaOfficialSources();
    expect(sources.map((source) => source.source.url)).toEqual([
      'https://immigration.gov.ng/info-center/renewal-of-passport/',
      'https://passport.immigration.gov.ng/',
      'https://immigration.gov.ng/nigeria-immigration-service-announces-upward-review-of-nigerian-standard-passport-fees/',
      'https://immigration.gov.ng/wp-content/uploads/2026/04/SERVICE-LEVEL-AGREEMENT-2026_.pdf',
    ]);
    expect(sources.every((source) => source.source.authority === 'official')).toBe(true);
    expect(
      sources.every((source) => source.source.retrievedAt === '2026-10-24T00:00:00.000Z'),
    ).toBe(true);
  });
});
