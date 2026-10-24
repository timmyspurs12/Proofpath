import { describe, expect, it } from 'vitest';
import { validateEvidencePlan } from '../server/lib/evidence';
import {
  extractCurrencyClaims,
  findInstructionContradictions,
  instructionTerms,
  routeContextFromInput,
} from '../server/lib/claim-checks';
import { makeSource } from './fixtures';
import {
  makeObservedModelPlan,
  makePassportInput,
  makePassportSources,
  observedLiveReceipt,
} from './fixtures/passport-live-export';

const onlineRoute = { online: true, paper: false };

describe('currency claim extraction', () => {
  it('parses symbols, ISO codes and thousands separators', () => {
    const claims = extractCurrencyClaims('Pay £82.50 now or USD 1,200 later (€99).');
    expect(claims).toHaveLength(3);
    expect(claims).toContainEqual({ currency: 'GBP', amount: 82.5, surface: '£82.50' });
    expect(claims).toContainEqual({ currency: 'USD', amount: 1200, surface: 'USD 1,200' });
    expect(claims).toContainEqual({ currency: 'EUR', amount: 99, surface: '€99' });
  });

  it('deduplicates repeated amounts and ignores bare numbers', () => {
    const claims = extractCurrencyClaims('£102 again £102 and a bare 42 without currency.');
    expect(claims).toEqual([{ currency: 'GBP', amount: 102, surface: '£102' }]);
  });
});

describe('route context and term extraction', () => {
  it('detects generic online versus paper route vocabulary only from the request', () => {
    const context = routeContextFromInput({
      task: 'Renew my passport online',
      details: 'digital route preferred',
      goal: 'complete an online application',
    });
    expect(context).toEqual({ online: true, paper: false });
    expect(
      routeContextFromInput({
        task: 'Apply by post',
        details: 'paper form',
        goal: 'postal application',
      }),
    ).toEqual({ online: false, paper: true });
  });

  it('keeps domain nouns and drops generic stopwords', () => {
    const terms = instructionTerms('Get two identical printed photos before applying online.');
    expect(terms).toContain('printed');
    expect(terms).toContain('photos');
    expect(terms).not.toContain('before');
  });
});

describe('findInstructionContradictions', () => {
  it('flags a secondary-source fee contradicted by official evidence', () => {
    const sources = makePassportSources();
    const result = findInstructionContradictions({
      instruction:
        'Pay the £82.50 online renewal fee with a credit or debit card when you submit the application.',
      sources,
      citedSourceIds: ['S3'],
      route: onlineRoute,
    });
    expect(result.map((entry) => entry.kind)).toContain('currency-mismatch');
    const mismatch = result.find((entry) => entry.kind === 'currency-mismatch')!;
    expect(mismatch.sourceIds).toContain('S1');
    expect(mismatch.detail).toContain('£102');
  });

  it('flags an amount that appears in no retrieved source at all', () => {
    const result = findInstructionContradictions({
      instruction: 'Pay a £50 administration charge.',
      sources: [
        makeSource('S1', 'The process page lists the fees applicants pay and how to submit them.'),
      ],
      citedSourceIds: ['S1'],
      route: onlineRoute,
    });
    expect(result.map((entry) => entry.kind)).toEqual(['ungrounded-currency']);
  });

  it('does not flag an amount that official evidence confirms', () => {
    const result = findInstructionContradictions({
      instruction: 'Pay the £102 online fee when submitting.',
      sources: makePassportSources(),
      citedSourceIds: ['S1'],
      route: onlineRoute,
    });
    expect(result.filter((entry) => entry.kind.startsWith('currency'))).toHaveLength(0);
  });

  it('flags explicit negation of an asserted requirement', () => {
    const result = findInstructionContradictions({
      instruction: 'Post printed photos with your online application.',
      sources: [
        makeSource(
          'S1',
          'You do not need to post printed photos for an online application; a digital photo is enough.',
          'https://service.gov.example/guide',
          { authority: 'official' },
        ),
      ],
      citedSourceIds: ['S1'],
      route: onlineRoute,
    });
    expect(result.map((entry) => entry.kind)).toContain('negated-requirement');
  });

  it('flags a requirement conditional on the opposite application route', () => {
    const result = findInstructionContradictions({
      instruction: 'Get two identical printed photos before starting your online renewal.',
      sources: makePassportSources(),
      citedSourceIds: ['S3'],
      route: onlineRoute,
    });
    expect(result.map((entry) => entry.kind)).toContain('conditional-route');
    expect(result.find((entry) => entry.kind === 'conditional-route')!.sourceIds).toContain('S2');
  });

  it('leaves an online-route digital photo requirement untouched', () => {
    const result = findInstructionContradictions({
      instruction: 'Provide a digital photo for the online application.',
      sources: makePassportSources(),
      citedSourceIds: ['S2'],
      route: onlineRoute,
    });
    expect(result).toHaveLength(0);
  });
});

describe('observed live export as an end-to-end evidence fixture', () => {
  function validateObserved() {
    return validateEvidencePlan({
      modelPlan: makeObservedModelPlan(),
      sources: makePassportSources(),
      input: makePassportInput(),
      runtime: observedLiveReceipt,
      id: 'observed-export-fixture',
    });
  }

  it('downgrades the contradicted fee claim and keeps its citation inspectable', () => {
    const { plan, metrics } = validateObserved();
    const fee = plan.steps.find((step) => step.title === 'Pay the online renewal fee')!;
    expect(fee.status).toBe('unverifiable');
    expect(fee.evidence).toHaveLength(1);
    expect(fee.notes.join(' ')).toContain('official evidence');
    expect(metrics.contradictedClaimCount).toBeGreaterThanOrEqual(1);
    expect(metrics.unsupportedModelClaims).toBeGreaterThanOrEqual(1);
  });

  it('downgrades the paper-route printed photo step in an online workflow', () => {
    const { plan } = validateObserved();
    const printed = plan.steps.find((step) => step.title === 'Get printed photos')!;
    expect(printed.status).toBe('unverifiable');
    expect(printed.notes.join(' ')).toContain('different application route');
  });

  it('keeps the correctly evidenced digital photo step supported', () => {
    const { plan } = validateObserved();
    const digital = plan.steps.find((step) => step.title === 'Prepare a digital photo')!;
    expect(digital.status).toBe('supported');
    expect(digital.evidence[0].sourceId).toBe('S2');
  });

  it('keeps the unresolved submission and tracking question visible', () => {
    const { plan } = validateObserved();
    expect(plan.unresolvedQuestions).toHaveLength(1);
    expect(plan.unresolvedQuestions[0].question).toMatch(/track the online application/);
  });

  it('surfaces a plan-level downgrade warning and preserves the live receipt unchanged', () => {
    const { plan } = validateObserved();
    expect(plan.warnings.some((warning) => warning.includes('downgraded'))).toBe(true);
    expect(plan.runtime).toEqual(observedLiveReceipt);
  });

  it('still accepts a genuinely supported plan without contradictions', () => {
    const model = makeObservedModelPlan();
    model.steps = [
      {
        id: 'fee',
        title: 'Pay the online renewal fee',
        instruction: 'Pay the £102 online renewal fee when you submit the application.',
        completionCriteria: 'A payment confirmation is saved.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote: 'Use this service to renew your passport online. It costs £102.',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
    ];
    model.unresolvedQuestions = [];
    const { plan, metrics } = validateEvidencePlan({
      modelPlan: model,
      sources: makePassportSources(),
      input: makePassportInput(),
      runtime: observedLiveReceipt,
      id: 'clean-fixture',
    });
    expect(plan.steps[0].status).toBe('supported');
    expect(metrics.contradictedClaimCount).toBe(0);
  });
});
