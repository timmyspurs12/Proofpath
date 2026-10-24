// UK online adult passport renewal regression, using only the clearly-labelled
// synthetic fixtures in tests/fixtures/uk-renewal.ts. Covers contradictory fee
// sources, an unsupported collection instruction with a fabricated citation,
// exact-passage validation, and how inaccessible official documents fail
// closed. No live network calls and no real scraped pages are involved.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { citationIsValid, validateEvidencePlan } from '../server/lib/evidence';
import { findInstructionContradictions, routeContextFromInput } from '../server/lib/claim-checks';
import { fetchSource } from '../server/lib/retrieval';
import {
  makeUkRenewalInput,
  makeUkRenewalModelPlan,
  makeUkRenewalSources,
  ukFixtureReceipt,
} from './fixtures/uk-renewal';

const originalFetch = globalThis.fetch;
afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

function validateFixture() {
  return validateEvidencePlan({
    modelPlan: makeUkRenewalModelPlan(),
    sources: makeUkRenewalSources(),
    input: makeUkRenewalInput(),
    runtime: ukFixtureReceipt,
  });
}

function stepByTitle(plan: ReturnType<typeof validateFixture>['plan'], fragment: string) {
  const step = plan.steps.find((candidate) => candidate.title.includes(fragment));
  if (!step) throw new Error(`fixture step containing "${fragment}" not found`);
  return step;
}

describe('UK renewal regression: exact-passage gate', () => {
  it('accepts exact GOV.UK passages and rejects a fabricated postal citation', () => {
    const sources = makeUkRenewalSources();
    expect(
      citationIsValid(
        { sourceId: 'S1', quote: 'Use this service to renew your passport online. It costs £102.' },
        sources,
      ),
    ).toBe(true);
    expect(
      citationIsValid(
        {
          sourceId: 'S4',
          quote: 'Send your old passport by post to HM Passport Office for processing.',
        },
        sources,
      ),
    ).toBe(false);
  });

  it('strips the fabricated citation and leaves the postal instruction unverifiable', () => {
    const { plan, metrics } = validateFixture();
    const postStep = stepByTitle(plan, 'Post the old passport');
    expect(postStep.status).toBe('unverifiable');
    expect(postStep.evidence).toHaveLength(0);
    expect(metrics.invalidCitationCount).toBe(1);
    expect(plan.warnings.join(' ')).toContain('1 invalid model citation');
  });
});

describe('UK renewal regression: contradictory fee sources', () => {
  it('downgrades the secondary £82.50 figure contradicted by the official £102 fee', () => {
    const sources = makeUkRenewalSources();
    const contradictions = findInstructionContradictions({
      instruction:
        'Pay the £82.50 online renewal fee with a credit or debit card when you submit the application.',
      sources,
      citedSourceIds: ['S4'],
      route: routeContextFromInput(makeUkRenewalInput()),
    });
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].kind).toBe('currency-mismatch');
    expect(contradictions[0].detail).toContain('£102');
    // The paper-route figure may appear in the official surfaces, but the
    // secondary blog's £82.50 must never be treated as an official amount.
    expect(contradictions[0].sourceIds).not.toContain('S4');

    const { plan } = validateFixture();
    const wrongFee = stepByTitle(plan, 'secondary blog renewal fee');
    expect(wrongFee.status).toBe('unverifiable');
    expect(wrongFee.evidence.map((citation) => citation.sourceId)).toEqual(['S4']);
  });

  it('never lets a supported step carry the contradicted £82.50 figure', () => {
    const { plan } = validateFixture();
    const supported = plan.steps
      .filter((step) => step.status === 'supported')
      .map((step) => step.instruction)
      .join(' ');
    expect(supported).not.toContain('£82.50');
  });
});

describe('UK renewal regression: supported steps and open questions', () => {
  it('keeps the grounded digital-photo and tracking steps supported on official sources', () => {
    const { plan, metrics } = validateFixture();
    const photo = stepByTitle(plan, 'Prepare a digital photo');
    const track = stepByTitle(plan, 'Track the application');
    expect(photo.status).toBe('supported');
    expect(track.status).toBe('supported');
    expect(photo.evidence[0].sourceId).toBe('S2');
    expect(track.evidence[0].sourceId).toBe('S3');
    // All four steps claimed support; only the two officially grounded ones
    // survive the gate.
    expect(metrics.modelSupportedClaims).toBe(4);
    expect(metrics.validatedSupportedClaims).toBe(2);
    expect(metrics.unsupportedModelClaims).toBe(2);
    expect(metrics.contradictedClaimCount).toBe(1);
    expect(metrics.citationCoverage).toBe(0.5);
  });

  it('retains the unresolved urgent-fee question rather than inventing a figure', () => {
    const { plan } = validateFixture();
    expect(
      plan.unresolvedQuestions.some((question) => question.question.includes('urgent or premium')),
    ).toBe(true);
    expect(plan.runtime.responseId).toBe('fixture-uk-renewal-not-a-live-call');
  });
});

describe('UK renewal regression: inaccessible official documents fail closed', () => {
  it('exposes an unparseable official PDF as SOURCE_PDF_UNREADABLE without inventing text', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('<!doctype html><p>gateway error page</p>', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    );
    await expect(fetchSource('https://8.8.8.8/uk-fee-circular.pdf', 'S1')).rejects.toMatchObject({
      code: 'SOURCE_PDF_UNREADABLE',
    });
  });

  it('surfaces a missing official document as SOURCE_UNAVAILABLE for backfill', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    await expect(
      fetchSource('https://9.9.9.9/missing-fee-circular.pdf', 'S1'),
    ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
  });
});
