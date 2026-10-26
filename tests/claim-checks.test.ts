import { describe, expect, it } from 'vitest';
import { validateEvidencePlan } from '../server/lib/evidence';
import {
  currencyQuestionAnswered,
  extractCurrencyClaims,
  findInstructionContradictions,
  instructionTerms,
  jurisdictionCoverage,
  routeContextFromInput,
} from '../server/lib/claim-checks';
import { makeSource } from './fixtures';
import {
  makeObservedModelPlan,
  makePassportInput,
  makePassportSources,
  observedLiveReceipt,
} from './fixtures/passport-live-export';
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
} from './fixtures/cross-jurisdiction';

const onlineRoute = {
  online: true,
  paper: false,
  inPerson: false,
  consular: false,
  abroad: false,
};

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

  it('handles currencies used by other jurisdictions, including ISO codes and local symbols', () => {
    const claims = extractCurrencyClaims(
      'Pay NGN 25,000, then CAD 150 and a biometrics fee of CAD 85, or R$120.50 in Brazil.',
    );
    expect(claims).toContainEqual({ currency: 'NGN', amount: 25000, surface: 'NGN 25,000' });
    expect(claims).toContainEqual({ currency: 'CAD', amount: 150, surface: 'CAD 150' });
    expect(claims).toContainEqual({ currency: 'CAD', amount: 85, surface: 'CAD 85' });
    expect(claims).toContainEqual({ currency: 'BRL', amount: 120.5, surface: 'R$120.50' });
  });

  it('parses naira, rupee, yen and won symbols without confusing R$ with US dollars', () => {
    const claims = extractCurrencyClaims('₦15,000 and ₹4,500 and ¥3,000 and ₩10,000 and R$50.');
    expect(claims.map((claim) => claim.currency)).toEqual(['BRL', 'NGN', 'INR', 'JPY', 'KRW']);
    expect(claims.some((claim) => claim.currency === 'USD')).toBe(false);
  });

  it('does not treat an unknown three-letter token as a currency', () => {
    const claims = extractCurrencyClaims('The code ABC 500 is a reference number, not money.');
    expect(claims).toEqual([]);
  });

  it('parses a registered typographic letter prefix on a grouped money amount', () => {
    // Official publishers sometimes write "N100,000" instead of "₦100,000".
    const claims = extractCurrencyClaims(
      '32 Pages 5-Years Validity is N100,000/$150 and reissue costs N30,000.',
    );
    expect(claims).toContainEqual({ currency: 'NGN', amount: 100000, surface: 'N100,000' });
    expect(claims).toContainEqual({ currency: 'NGN', amount: 30000, surface: 'N30,000' });
    expect(claims).toContainEqual({ currency: 'USD', amount: 150, surface: '$150' });
  });

  it('never reads identifiers or ungrouped numbers as prefixed money', () => {
    // Grouping is required: source IDs, form codes and small tokens stay inert.
    expect(extractCurrencyClaims('See source S1 and clause A1 and mask N95.')).toEqual([]);
    // An unregistered prefix letter is not guessed at, even when grouped.
    expect(extractCurrencyClaims('Reference X100,000 for the case officer.')).toEqual([]);
  });
});

describe('route context and term extraction', () => {
  it('detects generic online versus paper route vocabulary only from the request', () => {
    const context = routeContextFromInput({
      task: 'Renew my passport online',
      details: 'digital route preferred',
      goal: 'complete an online application',
    });
    expect(context).toEqual({
      online: true,
      paper: false,
      inPerson: false,
      consular: false,
      abroad: false,
    });
    expect(
      routeContextFromInput({
        task: 'Apply by post',
        details: 'paper form',
        goal: 'postal application',
      }),
    ).toEqual({
      online: false,
      paper: true,
      inPerson: false,
      consular: false,
      abroad: false,
    });
  });

  it('keeps domain nouns and drops generic stopwords', () => {
    const terms = instructionTerms('Get two identical printed photos before applying online.');
    expect(terms).toContain('printed');
    expect(terms).toContain('photos');
    expect(terms).not.toContain('before');
  });

  it('detects in-person and consular routes and abroad location generically', () => {
    const context = routeContextFromInput({
      task: 'Renew my passport at the embassy while I am abroad',
      details: 'Consular biometrics are collected in person at the mission.',
      goal: 'consular renewal from overseas',
    });
    expect(context.consular).toBe(true);
    expect(context.inPerson).toBe(true);
    expect(context.abroad).toBe(true);
    expect(context.online).toBe(false);
    expect(context.paper).toBe(false);
  });
});

describe('jurisdiction coverage signal', () => {
  it('notices when no source mentions the requested jurisdiction', () => {
    const sources = [makeSource('S1', 'Generic advice that never names any country or place.')];
    const coverage = jurisdictionCoverage('Kenya', sources);
    expect(coverage.mentioned).toBe(false);
    expect(coverage.tokens).toContain('kenya');
  });

  it('passes when a source mentions the jurisdiction phrase or token', () => {
    const sources = [
      makeSource('S1', 'The Nigeria Immigration Service publishes this guidance for applicants.'),
    ];
    expect(jurisdictionCoverage('Nigeria', sources).mentioned).toBe(true);
  });

  it('abstains on generic state-name vocabulary it cannot test reliably', () => {
    const sources = [makeSource('S1', 'Guidance text without any place names at all in it.')];
    const coverage = jurisdictionCoverage('United Kingdom', sources);
    expect(coverage.tokens).toEqual([]);
    expect(coverage.mentioned).toBe(true);
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

// The same generic gate, with no country-specific branches, must behave
// symmetrically across unrelated jurisdictions, currencies and task types.
describe('cross-jurisdiction universality', () => {
  it('downgrades a contradicted NGN fee and a by-post claim in a Nigerian passport plan', () => {
    const { plan, metrics } = validateEvidencePlan({
      modelPlan: makeNigeriaModelPlan(),
      sources: makeNigeriaSources(),
      input: makeNigeriaInput(),
      runtime: crossJurisdictionReceipt,
      id: 'ng-fixture',
    });
    const fee = plan.steps.find((step) => step.title === 'Pay the passport application fee')!;
    const post = plan.steps.find((step) => step.title === 'Send paperwork by post')!;
    const biometric = plan.steps.find((step) => step.title === 'Book biometric capture')!;
    expect(fee.status).toBe('unverifiable');
    expect(fee.notes.join(' ')).toContain('NGN 25,000');
    expect(post.status).toBe('unverifiable');
    expect(biometric.status).toBe('supported');
    expect(metrics.contradictedClaimCount).toBeGreaterThanOrEqual(2);
    // The official Nigerian sources mention the requested jurisdiction.
    expect(plan.warnings.some((warning) => warning.includes('jurisdiction'))).toBe(false);
    expect(plan.unresolvedQuestions).toHaveLength(1);
  });

  it('downgrades a contradicted CAD fee in a third-country immigration plan', () => {
    const { plan } = validateEvidencePlan({
      modelPlan: makeCanadaModelPlan(),
      sources: makeCanadaSources(),
      input: makeCanadaInput(),
      runtime: crossJurisdictionReceipt,
      id: 'ca-fixture',
    });
    const fee = plan.steps.find((step) => step.title === 'Pay the study permit fee')!;
    const biometrics = plan.steps.find((step) => step.title === 'Pay biometrics if required')!;
    expect(fee.status).toBe('unverifiable');
    expect(fee.notes.join(' ')).toContain('CAD 150');
    expect(biometrics.status).toBe('supported');
  });

  it('handles a non-passport business registration task with EUR and a free official process', () => {
    const { plan } = validateEvidencePlan({
      modelPlan: makeFranceModelPlan(),
      sources: makeFranceSources(),
      input: makeFranceInput(),
      runtime: crossJurisdictionReceipt,
      id: 'fr-fixture',
    });
    const fee = plan.steps.find((step) => step.title === 'Pay a registration fee')!;
    const paper = plan.steps.find((step) => step.title === 'Mail paper forms')!;
    const portal = plan.steps.find(
      (step) => step.title === 'Register online via the formalites portal',
    )!;
    expect(fee.status).toBe('unverifiable');
    expect(paper.status).toBe('unverifiable');
    expect(portal.status).toBe('supported');
    // A due date with no validated supporting passage is always removed.
    expect(portal.dueDate).toBeNull();
  });

  it('protects a consular route from domestic online-route instructions', () => {
    const { plan } = validateEvidencePlan({
      modelPlan: makeConsularModelPlan(),
      sources: makeNigeriaSources(),
      input: makeConsularInput(),
      runtime: crossJurisdictionReceipt,
      id: 'consular-fixture',
    });
    const onlineOnly = plan.steps.find((step) => step.title === 'Renew fully online')!;
    const embassy = plan.steps.find((step) => step.title === 'Attend the embassy in person')!;
    expect(onlineOnly.status).toBe('unverifiable');
    expect(embassy.status).toBe('supported');
  });

  it('warns honestly when no adequate evidence is available and keeps every claim unverifiable', () => {
    const { plan } = validateEvidencePlan({
      modelPlan: makeWeakModelPlan(),
      sources: makeWeakSources(),
      input: makeWeakInput(),
      runtime: crossJurisdictionReceipt,
      id: 'weak-fixture',
      // The real runPlan pipeline forwards retrieval warnings into the plan.
      initialWarnings: [
        'No official-domain source was retrieved; secondary publisher guidance cannot override official requirements. Add an official source URL to establish supported requirements.',
      ],
    });
    expect(plan.steps.every((step) => step.status !== 'supported')).toBe(true);
    expect(
      plan.warnings.some((warning) => warning.includes('No official-domain source was retrieved')),
    ).toBe(true);
    expect(plan.warnings.some((warning) => warning.includes('jurisdiction'))).toBe(true);
    expect(plan.unresolvedQuestions).toHaveLength(1);
  });
});

// Generic, jurisdiction-neutral coverage for evidence-answered fee questions.
// Sources are fictional administrative pages; the helper must work for any
// country and never synthesize an answer itself.
describe('currencyQuestionAnswered', () => {
  const domesticRoute = {
    online: true,
    paper: false,
    inPerson: false,
    consular: false,
    abroad: false,
  };
  const abroadRoute = { ...domesticRoute, consular: true, abroad: true };

  function officialSources() {
    return [
      makeSource(
        'S1',
        'The standard four-year business permit application fee is EUR 250. All listed fees are exclusive of processing bank charges.',
        'https://permits.example-gov.org/fees',
        { authority: 'official' },
      ),
      makeSource(
        'S2',
        'Applicants resident abroad pay a consular fee of EUR 400 at the overseas mission when applying from outside the country.',
        'https://permits.example-gov.org/abroad',
        { authority: 'official' },
      ),
    ];
  }

  it('answers an in-scope fee question from an official passage', () => {
    const answered = currencyQuestionAnswered(
      {
        question: 'What is the official fee for the domestic four-year business permit?',
        reason: 'The exact published fee is needed before submission.',
      },
      officialSources(),
      domesticRoute,
    );
    expect(answered).toBe(true);
  });

  it('keeps a bank-charge amount question open even when the fee itself is published', () => {
    expect(
      currencyQuestionAnswered(
        {
          question: 'What bank charge amount is added on top of the EUR 250 permit fee?',
          reason: 'The sources only say charges are excluded.',
        },
        officialSources(),
        domesticRoute,
      ),
    ).toBe(false);
  });

  it('keeps a question open when no source mentions the requested service variant', () => {
    expect(
      currencyQuestionAnswered(
        {
          question: 'What does the urgent same-day premium permit service cost?',
          reason: 'No retrieved source publishes an urgent or premium fee.',
        },
        officialSources(),
        domesticRoute,
      ),
    ).toBe(false);
  });

  it('never answers a domestic request with opposite-location fee wording', () => {
    expect(
      currencyQuestionAnswered(
        {
          question:
            'What is the consular fee for applicants resident abroad at the overseas mission?',
          reason: 'This question is out of route for a domestic request.',
        },
        officialSources(),
        domesticRoute,
      ),
    ).toBe(false);
    // The same question on an abroad route is answered by the consular passage.
    expect(
      currencyQuestionAnswered(
        {
          question:
            'What is the consular fee for applicants resident abroad at the overseas mission?',
          reason: 'Consular processing for residents outside the country.',
        },
        officialSources(),
        abroadRoute,
      ),
    ).toBe(true);
  });

  it('abstains on non-monetary questions and when no source publishes an amount', () => {
    expect(
      currencyQuestionAnswered(
        { question: 'How long does permit review take after submission?', reason: 'Timeline gap.' },
        officialSources(),
        domesticRoute,
      ),
    ).toBe(false);
    const textOnly = [
      makeSource('S1', 'Applicants apply online and upload the required documents.', undefined, {
        authority: 'official',
      }),
    ];
    expect(
      currencyQuestionAnswered(
        { question: 'What is the domestic permit fee?', reason: 'No fee table was retrieved.' },
        textOnly,
        domesticRoute,
      ),
    ).toBe(false);
  });

  it('prefers official passages and lets secondary sources answer only when no official source exists', () => {
    const secondaryOnly = [
      makeSource(
        'S1',
        'An independent guide lists the domestic business permit fee as EUR 250.',
        'https://guides.example.net/permits',
        { authority: 'secondary' },
      ),
    ];
    expect(
      currencyQuestionAnswered(
        {
          question: 'What is the domestic business permit fee?',
          reason: 'Only guides were retrieved.',
        },
        secondaryOnly,
        domesticRoute,
      ),
    ).toBe(true);

    const mixed = [
      ...secondaryOnly,
      makeSource(
        'S2',
        'The official register describes the application workflow without publishing any fee.',
        'https://permits.example-gov.org/workflow',
        { authority: 'official' },
      ),
    ];
    expect(
      currencyQuestionAnswered(
        {
          question: 'What is the domestic business permit fee?',
          reason: 'An official source exists but names no amount.',
        },
        mixed,
        domesticRoute,
      ),
    ).toBe(false);
  });
});
