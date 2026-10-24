// End-to-end regression for the observed 2026-10-24 production failure on a
// domestic Nigerian adult passport renewal. Every source and quote here is a
// CLEARLY LABELLED SYNTHETIC FIXTURE (see tests/fixtures/nigeria-live-failure.ts);
// no live network call and no real scraped page is involved. The generic,
// country-agnostic engine runs unchanged against the fixture.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { citationIsValid, normalizeQuote, validateEvidencePlan } from '../server/lib/evidence';
import { findInstructionContradictions, routeContextFromInput } from '../server/lib/claim-checks';
import { fetchSource, normalizeSourceText } from '../server/lib/retrieval';
import {
  makeNigeriaFailureInput,
  makeNigeriaFailureModelPlan,
  makeNigeriaFailureSources,
  makeNisPortalHtml,
  nigeriaFixtureReceipt,
} from './fixtures/nigeria-live-failure';

const originalFetch = globalThis.fetch;
afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

function validateFixture() {
  return validateEvidencePlan({
    modelPlan: makeNigeriaFailureModelPlan(),
    sources: makeNigeriaFailureSources(),
    input: makeNigeriaFailureInput(),
    runtime: nigeriaFixtureReceipt,
  });
}

function stepByTitle(plan: ReturnType<typeof validateFixture>['plan'], fragment: string) {
  const step = plan.steps.find((candidate) => candidate.title.includes(fragment));
  if (!step) throw new Error(`fixture step containing "${fragment}" not found`);
  return step;
}

describe('Nigeria live-failure regression: exact-passage gate', () => {
  it('accepts exact official passages and rejects a fabricated quote absent from every source', () => {
    const sources = makeNigeriaFailureSources();
    expect(
      citationIsValid(
        {
          sourceId: 'S1',
          quote:
            'The standard domestic 32-page 5-year adult passport renewal fee is NGN 100,000, excluding bank charges.',
        },
        sources,
      ),
    ).toBe(true);
    // The model's "post your passport" citation exists in no retrieved source.
    expect(
      citationIsValid(
        {
          sourceId: 'S4',
          quote: 'Post every old passport directly to the immigration headquarters.',
        },
        sources,
      ),
    ).toBe(false);
    // A quote citing a source id that was never retrieved cannot validate either.
    expect(citationIsValid({ sourceId: 'S99', quote: 'anything' }, sources)).toBe(false);
  });

  it('strips the fabricated citation and downgrades the unsupported postal instruction', () => {
    const { plan, metrics } = validateFixture();
    const postStep = stepByTitle(plan, 'Post the old passport');
    expect(postStep.status).toBe('unverifiable');
    expect(postStep.evidence).toHaveLength(0);
    expect(postStep.notes.join(' ')).toContain('exact-passage validation');
    expect(metrics.invalidCitationCount).toBe(1);
    expect(plan.warnings.join(' ')).toContain('1 invalid model citation');
  });
});

describe('Nigeria live-failure regression: fee conflict handling', () => {
  it('downgrades the secondary NGN 70,000 figure contradicted by official evidence', () => {
    const sources = makeNigeriaFailureSources();
    const input = makeNigeriaFailureInput();
    const contradictions = findInstructionContradictions({
      instruction: 'Pay the NGN 70,000 renewal fee including bank charges.',
      sources,
      citedSourceIds: ['S4'],
      route: routeContextFromInput(input),
    });
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].kind).toBe('currency-mismatch');
    // The official figures, not the secondary one, are named in the reason.
    expect(contradictions[0].detail).toContain('NGN 100,000');
    expect(contradictions[0].detail).not.toContain('NGN 70,000 found instead');

    const { plan } = validateFixture();
    const wrongFee = stepByTitle(plan, 'secondary-source renewal fee');
    expect(wrongFee.status).toBe('unverifiable');
    // The quote itself was an exact passage, so it is retained on the
    // downgraded step even though it cannot ground a supported claim.
    expect(wrongFee.evidence).toHaveLength(1);
    expect(wrongFee.notes.join(' ')).toContain('contradicted by official evidence');
  });

  it('rejects the real NGN 100,000 figure when its scope (diaspora/included) is misattributed', () => {
    const sources = makeNigeriaFailureSources();
    const input = makeNigeriaFailureInput();
    const contradictions = findInstructionContradictions({
      instruction:
        'Pay the NGN 100,000 diaspora renewal fee at the embassy; this figure includes bank charges.',
      sources,
      citedSourceIds: ['S1'],
      route: routeContextFromInput(input),
    });
    expect(contradictions.map((entry) => entry.kind)).toContain('fee-context-mismatch');
    const detail = contradictions[0].detail;
    expect(detail).toContain('domestic');
    expect(detail).toContain('excludes bank charges');
  });

  it('validates the domestic-vs-diaspora conflict from two official passages and flags the scoped step', () => {
    const { plan, metrics } = validateFixture();
    expect(metrics.validatedConflicts).toBe(1);
    expect(metrics.rejectedConflicts).toBe(0);
    const conflict = plan.conflicts[0];
    expect(conflict.sourceIds).toEqual(expect.arrayContaining(['S1', 'S3']));
    expect(conflict.evidence).toHaveLength(2);
    const scopedFee = stepByTitle(plan, 'embassy route');
    expect(scopedFee.status).toBe('conflicting');
  });

  it('never promotes the NGN 100,000 domestic fee to a supported wrong-scope claim', () => {
    const { plan } = validateFixture();
    const supportedInstructions = plan.steps
      .filter((step) => step.status === 'supported')
      .map((step) => step.instruction);
    expect(supportedInstructions.join(' ')).not.toContain('NGN 70,000');
    expect(supportedInstructions.join(' ')).not.toContain('diaspora');
  });
});

describe('Nigeria live-failure regression: supported steps and open questions', () => {
  it('keeps genuinely grounded steps supported with their exact official passages', () => {
    const { plan, metrics } = validateFixture();
    const biometrics = stepByTitle(plan, 'Book biometric capture');
    const collect = stepByTitle(plan, 'Collect the new passport');
    expect(biometrics.status).toBe('supported');
    expect(collect.status).toBe('supported');
    expect(biometrics.evidence[0].sourceId).toBe('S1');
    expect(collect.evidence[0].sourceId).toBe('S1');
    // 5 steps claimed supported; only the two grounded ones remain so.
    expect(metrics.modelSupportedClaims).toBe(5);
    expect(metrics.validatedSupportedClaims).toBe(2);
    expect(metrics.contradictedClaimCount).toBe(2);
    expect(metrics.unsupportedModelClaims).toBe(3);
  });

  it('retains unresolved questions instead of inventing answers (bank charges, processing time)', () => {
    const { plan } = validateFixture();
    const questions = plan.unresolvedQuestions.map((question) => question.question);
    expect(
      questions.some((question) => question.includes('bank or payment-provider charges')),
    ).toBe(true);
    expect(questions.some((question) => question.includes('processing time'))).toBe(true);
  });

  it('attaches the runtime receipt and all four retrieved sources to the plan', () => {
    const { plan } = validateFixture();
    expect(plan.runtime.responseId).toBe('fixture-nigeria-live-failure-not-a-live-call');
    expect(plan.sources.map((source) => source.id)).toEqual(['S1', 'S2', 'S3', 'S4']);
  });
});

describe('Nigeria live-failure regression: official HTML extraction', () => {
  it('strips portal chrome while preserving the exact quotable official passage', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(makeNisPortalHtml(), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    const result = await fetchSource('https://8.8.8.8/passport-renewal', 'S1');
    const text = normalizeSourceText(result.text);
    expect(normalizeQuote(text)).toContain(
      normalizeQuote(
        'The standard domestic 32-page 5-year adult passport renewal fee is NGN 100,000, excluding bank charges.',
      ),
    );
    // Navigation, header and footer chrome must not enter quotable text.
    expect(text).not.toContain('Skip to main content');
    expect(text).not.toContain('Cookie settings');
    expect(text).not.toContain('Privacy policy');
    expect(text).not.toContain('Home');
    expect(result.source.title).toBe('Passport renewal | Nigeria Immigration Service');
    expect(result.source.publisher).toBe('Nigeria Immigration Service');
  });
});
