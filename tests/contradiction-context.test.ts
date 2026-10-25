// Regression tests for the false-positive contradiction downgrades observed
// in the live domestic Nigerian online renewal run. Everything here uses the
// CLEARLY LABELLED SYNTHETIC FIXTURES in
// tests/fixtures/contradiction-context.ts: no live network calls and no real
// scraped pages. The same generic engine code runs for every jurisdiction.
import { describe, expect, it } from 'vitest';
import { citationIsValid, validateEvidencePlan } from '../server/lib/evidence';
import {
  extractCurrencyClaims,
  findInstructionContradictions,
  routeContextFromInput,
} from '../server/lib/claim-checks';
import {
  FALSE_POSITIVE_INSTRUCTIONS,
  POSITIVE_CONTROL_INSTRUCTIONS,
  contextFixtureReceipt,
  makeContextInput,
  makeContextModelPlan,
  makeContextSources,
  makePositiveControlSources,
} from './fixtures/contradiction-context';

const domesticRoute = () => routeContextFromInput(makeContextInput());
const abroadRoute = () =>
  routeContextFromInput({
    task: 'Renew my passport at the embassy while I am abroad',
    details: 'Consular route, attended in person at the mission overseas.',
    goal: 'Complete the consular renewal from outside the country.',
  });

describe('false-positive contradictions are eliminated on the domestic online route', () => {
  const sources = makeContextSources();

  it.each(Object.entries(FALSE_POSITIVE_INSTRUCTIONS))(
    'trap passage "%s" does not withdraw support from a domestic step',
    (_name, instruction) => {
      const contradictions = findInstructionContradictions({
        instruction,
        sources,
        citedSourceIds: ['S1', 'S2'],
        route: domesticRoute(),
      });
      expect(contradictions).toEqual([]);
    },
  );

  it('the printed-photograph notice cannot invalidate portal, identity, upload or payment steps', () => {
    // Explicit guard for production failure #1 with the four step subjects.
    for (const instruction of [
      'Register and access the official portal to start the domestic renewal.',
      'Verify your national identity number inside the online application.',
      'Upload the required supporting documents through the portal.',
      'Pay the NGN 100,000 domestic renewal fee through the portal, excluding bank charges.',
    ]) {
      const result = findInstructionContradictions({
        instruction,
        sources,
        citedSourceIds: ['S1'],
        route: domesticRoute(),
      });
      expect(result.map((entry) => entry.kind)).not.toContain('negated-requirement');
    }
  });

  it('consular internet and foreign-mission cutoff passages are out of scope domestically', () => {
    // Production failures #2 and #4: consular/diaspora sentences must not
    // negate domestic online access and domestic submission instructions.
    const internet = findInstructionContradictions({
      instruction: FALSE_POSITIVE_INSTRUCTIONS.consularInternet,
      sources,
      citedSourceIds: ['S2'],
      route: domesticRoute(),
    });
    const cutoff = findInstructionContradictions({
      instruction: FALSE_POSITIVE_INSTRUCTIONS.foreignCutoff,
      sources,
      citedSourceIds: ['S2'],
      route: domesticRoute(),
    });
    expect(internet).toEqual([]);
    expect(cutoff).toEqual([]);
  });

  it('age and guardian conditionals do not negate adult identity or biometric steps', () => {
    // Production failure #3: the conditional only binds applicants under 18.
    for (const instruction of [
      FALSE_POSITIVE_INSTRUCTIONS.ageDeclarationIdentity,
      FALSE_POSITIVE_INSTRUCTIONS.ageDeclarationBiometrics,
    ]) {
      const result = findInstructionContradictions({
        instruction,
        sources,
        citedSourceIds: ['S1'],
        route: domesticRoute(),
      });
      expect(result).toEqual([]);
    }
  });

  it('applies the same conditional rule when the instruction actually concerns a minor', () => {
    // Symmetric control: an instruction that itself concerns an under-18
    // applicant stays exposed to the conditional requirement.
    const result = findInstructionContradictions({
      instruction:
        'For the applicant under 18, complete identity-number verification inside the online application.',
      sources,
      citedSourceIds: ['S1'],
      route: domesticRoute(),
    });
    // The age conditional is in scope; its negated verification clause shares
    // the verification subject, so a negated-requirement finding is permitted.
    expect(result.map((entry) => entry.kind)).toContain('negated-requirement');
  });
});

describe('genuine same-context contradictions still fail closed', () => {
  const sources = [...makeContextSources(), ...makePositiveControlSources()];

  it('downgrades an instruction to post printed photos on the online route', () => {
    const result = findInstructionContradictions({
      instruction: POSITIVE_CONTROL_INSTRUCTIONS.postPhotos,
      sources,
      citedSourceIds: ['P1'],
      route: domesticRoute(),
    });
    expect(result.map((entry) => entry.kind)).toContain('negated-requirement');
  });

  it('downgrades a claim that biometric capture can be completed fully online', () => {
    const result = findInstructionContradictions({
      instruction: POSITIVE_CONTROL_INSTRUCTIONS.onlineBiometrics,
      sources,
      citedSourceIds: ['P1'],
      route: domesticRoute(),
    });
    expect(result.map((entry) => entry.kind)).toContain('negated-requirement');
  });

  it('downgrades an instruction to pay the fee in cash at the enrolment centre', () => {
    const result = findInstructionContradictions({
      instruction: POSITIVE_CONTROL_INSTRUCTIONS.cashPayment,
      sources,
      citedSourceIds: ['P1'],
      route: domesticRoute(),
    });
    expect(result.map((entry) => entry.kind)).toContain('negated-requirement');
  });

  it('downgrades a paper-route photo requirement inside an online workflow', () => {
    const result = findInstructionContradictions({
      instruction: POSITIVE_CONTROL_INSTRUCTIONS.paperFormPhotos,
      sources,
      citedSourceIds: ['P1'],
      route: domesticRoute(),
    });
    expect(result.map((entry) => entry.kind)).toContain('conditional-route');
  });

  it('keeps a correctly evidenced online step untouched by the trap passages', () => {
    const result = findInstructionContradictions({
      instruction: 'Upload the required supporting documents through the portal.',
      sources,
      citedSourceIds: ['S1'],
      route: domesticRoute(),
    });
    expect(result).toEqual([]);
  });
});

describe('domestic and diaspora fees and instructions stay distinct', () => {
  const sources = makeContextSources();

  it('parses the domestic NGN fee and the diaspora USD fee as separate currencies', () => {
    const all = sources.flatMap((source) => extractCurrencyClaims(source.text));
    expect(all).toContainEqual({ currency: 'NGN', amount: 100000, surface: 'NGN 100,000' });
    expect(all).toContainEqual({ currency: 'USD', amount: 150, surface: 'USD 150' });
  });

  it('accepts the exact domestic fee with bank charges excluded', () => {
    const result = findInstructionContradictions({
      instruction:
        'Pay the NGN 100,000 domestic renewal fee through the portal, excluding bank charges.',
      sources,
      citedSourceIds: ['S1'],
      route: domesticRoute(),
    });
    expect(
      result.filter(
        (entry) => entry.kind.endsWith('currency') || entry.kind === 'fee-context-mismatch',
      ),
    ).toEqual([]);
  });

  it('rejects the diaspora USD fee attached to a domestic instruction', () => {
    const result = findInstructionContradictions({
      instruction: 'Pay the USD 150 renewal fee for this domestic application through the portal.',
      sources,
      citedSourceIds: ['S2'],
      route: domesticRoute(),
    });
    expect(result.map((entry) => entry.kind)).toContain('fee-context-mismatch');
  });

  it('rejects treating bank charges as included when the official note says they are additional', () => {
    const result = findInstructionContradictions({
      instruction:
        'Pay NGN 100,000 including bank charges for the domestic 32-page 5-year renewal.',
      sources,
      citedSourceIds: ['S1'],
      route: domesticRoute(),
    });
    expect(result.map((entry) => entry.kind)).toContain('fee-context-mismatch');
    expect(result[0].detail).toContain('bank charges');
  });

  it('accepts the USD consular fee on an abroad route and rejects the domestic NGN fee there', () => {
    const clean = findInstructionContradictions({
      instruction: 'Pay the USD 150 consular renewal fee at the embassy when attending in person.',
      sources,
      citedSourceIds: ['S2'],
      route: abroadRoute(),
    });
    expect(
      clean.filter(
        (entry) => entry.kind === 'fee-context-mismatch' || entry.kind.endsWith('currency'),
      ),
    ).toEqual([]);

    const misScoped = findInstructionContradictions({
      instruction:
        'Pay the NGN 100,000 domestic renewal fee at the embassy for this abroad application.',
      sources,
      citedSourceIds: ['S1'],
      route: abroadRoute(),
    });
    expect(misScoped.map((entry) => entry.kind)).toContain('fee-context-mismatch');
  });

  it('does not let a domestic-scope prohibition negate a consular instruction abroad', () => {
    const domesticOnly = makePositiveControlSources();
    const result = findInstructionContradictions({
      instruction: 'Attend the embassy in person to complete the renewal while abroad.',
      sources: domesticOnly,
      citedSourceIds: ['P1'],
      route: abroadRoute(),
    });
    expect(result.map((entry) => entry.kind)).not.toContain('negated-requirement');
  });
});

describe('end-to-end evidence plan on the synthetic domestic fixture', () => {
  function validate() {
    return validateEvidencePlan({
      modelPlan: makeContextModelPlan(),
      sources: makeContextSources(),
      input: makeContextInput(),
      runtime: contextFixtureReceipt,
      id: 'contradiction-context-fixture',
    });
  }

  it('keeps every exactly-evidenced domestic step supported despite the trap passages', () => {
    const { plan, metrics } = validate();
    const supported = plan.steps.filter((step) => step.status === 'supported');
    expect(supported.map((step) => step.title)).toEqual([
      'Access the official portal',
      'Verify your national identity number',
      'Upload supporting documents',
      'Pay the domestic renewal fee',
      'Submit the application online',
      'Attend biometric capture in person',
    ]);
    // Every supported step carries an exact passage from a retrieved source.
    for (const step of supported) {
      expect(step.evidence.length).toBeGreaterThan(0);
      for (const citation of step.evidence) {
        expect(citationIsValid(citation, makeContextSources())).toBe(true);
      }
    }
    expect(metrics.contradictedClaimCount).toBe(0);
    expect(plan.warnings.join(' ')).not.toContain('downgraded');
  });

  it('strips the fabricated courier citation without promoting the unsupported step', () => {
    const { plan, metrics } = validate();
    const courier = plan.steps.find(
      (step) => step.title === 'Request courier delivery of the new document',
    )!;
    expect(courier.status).toBe('unverifiable');
    expect(courier.evidence).toHaveLength(0);
    expect(courier.notes.join(' ')).toContain('exact-passage validation');
    expect(metrics.invalidCitationCount).toBe(1);
    expect(metrics.validatedSupportedClaims).toBe(6);
    expect(metrics.unsupportedModelClaims).toBe(1);
  });

  it('retains unresolved questions and the labelled fixture receipt', () => {
    const { plan } = validate();
    expect(plan.unresolvedQuestions.map((question) => question.id)).toEqual([
      'processing-time',
      'courier-availability',
    ]);
    expect(plan.runtime.responseId).toBe('fixture-contradiction-context-not-a-live-call');
    // The consular source remains in the ledger without tainting domestic steps.
    expect(plan.sources.map((source) => source.id)).toEqual(['S1', 'S2']);
  });
});
