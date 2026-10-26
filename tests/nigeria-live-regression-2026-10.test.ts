import { describe, expect, it } from 'vitest';
import { citationIsValid, validateEvidencePlan } from '../server/lib/evidence';
import { currencyQuestionAnswered } from '../server/lib/claim-checks';
import { sourcePacketForModel } from '../server/lib/plan';
import {
  makeNigeriaLiveRegressionInput,
  makeNigeriaLiveRegressionModelPlan,
  makeNigeriaLiveRegressionSources,
  nigeriaLiveRegressionReceipt,
} from './fixtures/nigeria-live-regression-2026-10';

// Deterministic replay of the evidence gaps observed on live receipt
// chatcmpl-2aff50c9-9aa7-4db7-9f6b-311fe50e44fe (11 steps, 9 supported, 7
// invalid citations). No network or live inference: sources are the frozen
// verbatim 2026-10-24 NIS excerpts and every country fact lives in fixtures.
describe('Nigeria live-run regression: fee question, appointment citations, collection split', () => {
  function validate(includeDiagnostics = false) {
    const sources = makeNigeriaLiveRegressionSources();
    const input = makeNigeriaLiveRegressionInput();
    return {
      sources,
      input,
      ...validateEvidencePlan({
        modelPlan: makeNigeriaLiveRegressionModelPlan(),
        sources,
        input,
        runtime: nigeriaLiveRegressionReceipt,
        id: 'nigeria-live-regression-2026-10',
        includeDiagnostics,
      }),
    };
  }

  it('keeps nine of eleven steps supported and records seven rejected citations without contradictions', () => {
    const { plan, metrics } = validate();
    expect(plan.steps).toHaveLength(11);
    expect(plan.steps.filter((step) => step.status === 'supported')).toHaveLength(9);
    expect(plan.steps.filter((step) => step.status === 'unverifiable')).toHaveLength(2);
    expect(metrics).toMatchObject({
      stepCount: 11,
      modelSupportedClaims: 11,
      validatedSupportedClaims: 9,
      unsupportedModelClaims: 2,
      invalidCitationCount: 7,
      contradictedClaimCount: 0,
      evidenceResolvedQuestions: 1,
      removedOutOfRouteQuestions: 1,
    });
    expect(metrics.outcomeCounts).toMatchObject({
      supported: 9,
      'invalid-citation': 2,
      contradicted: 0,
      unverifiable: 0,
    });
    expect(plan.warnings.some((warning) => warning.includes('7 invalid model citation'))).toBe(
      true,
    );
  });

  it('resolves the domestic fee question from official passages while retaining genuine open questions', () => {
    const { plan } = validate();
    const ids = plan.unresolvedQuestions.map((question) => question.id);
    expect(ids).toEqual(['bank-charge-amount', 'centre-availability', 'collection-notification']);
    expect(ids).not.toContain('domestic-service-fee');
    expect(
      plan.warnings.some((warning) =>
        warning.includes(
          'unresolved question(s) were removed because retrieved sources already publish the requested fee',
        ),
      ),
    ).toBe(true);

    // The fee itself stays a supported step carrying the exact official
    // naira figure and the bank-charge exclusion policy.
    const feeStep = plan.steps.find((step) => step.id === 'step-6')!;
    expect(feeStep.status).toBe('supported');
    expect(feeStep.instruction).toContain('N100,000');
    const citedSources = feeStep.evidence.map((citation) => citation.sourceId).sort();
    expect(citedSources).toEqual(['S3', 'S4']);
    expect(
      feeStep.evidence.some((citation) =>
        citation.quote.includes('All Prices are Exclusive of Bank Charges'),
      ),
    ).toBe(true);

    // The helper agrees directly, including the bank-charge protection and
    // the non-monetary collection question.
    const sources = makeNigeriaLiveRegressionSources();
    const route = {
      online: true,
      paper: false,
      inPerson: true,
      consular: false,
      abroad: false,
    };
    expect(
      currencyQuestionAnswered(
        {
          question: 'What is the official service fee for the domestic 32-page 5-year renewal?',
          reason: 'The exact published service fee is needed.',
        },
        sources,
        route,
      ),
    ).toBe(true);
    expect(
      currencyQuestionAnswered(
        {
          question:
            'What exact naira amount will the payment provider charge as bank charges on top of the N100,000 service fee?',
          reason: 'No source publishes the provider charge amount.',
        },
        sources,
        route,
      ),
    ).toBe(false);
    expect(
      currencyQuestionAnswered(
        {
          question: 'How will the renewed passport be collected and how is readiness notified?',
          reason: 'No retrieved source describes collection or notification.',
        },
        sources,
        route,
      ),
    ).toBe(false);
  });

  it('downgrades the appointment step on citation fidelity while the verbatim passage stays valid', () => {
    const { plan, sources } = validate();
    const appointment = plan.steps.find((step) => step.id === 'step-7')!;
    expect(appointment.status).toBe('unverifiable');
    expect(appointment.evidenceOutcome).toBe('invalid-citation');
    expect(appointment.evidence).toHaveLength(0);
    expect(appointment.rejectedCitations).toHaveLength(3);
    const reasons = appointment.rejectedCitations!.map((entry) => entry.reason).sort();
    expect(reasons).toEqual(['passage-not-found', 'passage-not-found', 'source-not-retrieved']);
    // Provenance preserves exactly what the model claimed, including the
    // regional spelling change and the never-retrieved source, so the failure
    // mode stays auditable.
    const rejectedQuotes = appointment.rejectedCitations!.map((entry) => entry.quote).join(' ');
    expect(rejectedQuotes).toContain('enrolment');
    expect(appointment.rejectedCitations!.map((entry) => entry.sourceId)).toContain('S8');
    const s8 = appointment.rejectedCitations!.find((entry) => entry.sourceId === 'S8')!;
    expect(s8.reason).toBe('source-not-retrieved');

    // The gate is not loosened: the near-miss and stitched quotes are invalid
    // against the real sources ...
    expect(
      citationIsValid(
        {
          sourceId: 'S1',
          quote: 'Then proceed to make payment and book an appointment for biometric enrolment',
        },
        sources,
      ),
    ).toBe(false);
    // ... while the official passage the model SHOULD have quoted validates,
    // proving the evidence exists and only citation fidelity failed.
    expect(
      citationIsValid(
        {
          sourceId: 'S1',
          quote:
            'Review and submit your application. Then proceed to make payment and book an appointment for biometric enrollment',
        },
        sources,
      ),
    ).toBe(true);
    expect(
      citationIsValid(
        {
          sourceId: 'S4',
          quote:
            'Complete passport application online, upload the required documents, passport datapage, make payment and book appointment.',
        },
        sources,
      ),
    ).toBe(true);

    // The in-person biometric obligation survives on a separate supported
    // step with official citations, so the appointment citation failure never
    // removes the mandatory office-visit requirement.
    const biometrics = plan.steps.find((step) => step.id === 'step-8')!;
    expect(biometrics.status).toBe('supported');
    const biometricQuotes = biometrics.evidence.map((citation) => citation.quote).join(' ');
    expect(biometricQuotes).toContain('required to appear');
    expect(biometricQuotes).toContain('biometric data');
  });

  it('keeps the 21-day timeline separately supported and leaves collection method unverified', () => {
    const { plan } = validate();
    const tracking = plan.steps.find((step) => step.id === 'step-9')!;
    expect(tracking.status).toBe('supported');
    expect(tracking.evidence.map((citation) => citation.sourceId).sort()).toEqual(['S2', 'S4']);
    expect(
      tracking.evidence.some((citation) =>
        citation.quote.includes('Re-issue: 21 days after Successful Enrolment'),
      ),
    ).toBe(true);
    expect(tracking.instruction).toMatch(/service standard, not a guaranteed/);
    // The invalid collection-flavored citation is rejected but the valid
    // timeline/tracking citations keep the step supported.
    expect(tracking.rejectedCitations).toHaveLength(1);
    expect(tracking.rejectedCitations?.[0]?.reason).toBe('passage-not-found');

    const collection = plan.steps.find((step) => step.id === 'step-10')!;
    expect(collection.status).toBe('unverifiable');
    expect(collection.evidenceOutcome).toBe('invalid-citation');
    expect(collection.evidence).toHaveLength(0);
    expect(collection.rejectedCitations).toHaveLength(2);
    const collectionQuestion = plan.unresolvedQuestions.find(
      (question) => question.id === 'collection-notification',
    );
    expect(collectionQuestion).toBeTruthy();

    // No supported step may assert a collection, courier or notification
    // mechanism that no retrieved source establishes.
    const supportedText = plan.steps
      .filter((step) => step.status === 'supported')
      .map((step) => `${step.title} ${step.instruction}`)
      .join(' ');
    expect(supportedText).not.toMatch(/courier|ready for collection|notification mechanism/i);
  });

  it('keeps diaspora dollar material out of every supported domestic step and instruction', () => {
    const { plan } = validate();
    for (const step of plan.steps.filter((candidate) => candidate.status === 'supported')) {
      expect(step.instruction).not.toMatch(/\$|USD|diaspora|embassy|consulate/i);
      expect(step.evidence.map((citation) => citation.sourceId)).not.toContain('S5');
    }
    // The overseas question is removed by the route filter, not answered.
    const ids = plan.unresolvedQuestions.map((question) => question.id);
    expect(ids).not.toContain('overseas-mission-question');
    expect(
      plan.warnings.some((warning) => warning.includes('overseas/consular application route')),
    ).toBe(true);
  });

  it('puts the appointment-booking and 21-day passages inside the model source packet', () => {
    const packet = sourcePacketForModel(makeNigeriaLiveRegressionSources());
    const joined = JSON.stringify(packet);
    expect(joined).toContain(
      'Review and submit your application. Then proceed to make payment and book an appointment for biometric enrollment',
    );
    expect(joined).toContain(
      'Complete passport application online, upload the required documents, passport datapage, make payment and book appointment.',
    );
    expect(joined).toContain('Re-issue: 21 days after Successful Enrolment');
    expect(joined).toContain('All Prices are Exclusive of Bank Charges');
  });

  it('is deterministic across validation runs', () => {
    const first = validate().plan;
    const second = validate().plan;
    const stripStamps = (plan: typeof first) => {
      const { createdAt: _c, updatedAt: _u, ...rest } = plan;
      return rest;
    };
    expect(stripStamps(second)).toEqual(stripStamps(first));
  });
});
