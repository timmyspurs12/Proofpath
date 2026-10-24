import type { PlanRequest, RuntimeReceipt } from '../../src/shared/schemas';
import type { ModelPlan } from '../../server/lib/evidence';
import { makeSource } from '../fixtures';
import type { RetrievedSource } from '../../server/lib/retrieval';

// CLEARLY LABELLED SYNTHETIC FIXTURE for contradiction-decision diagnostics.
//
// These passages are not live research and quote no real scraped page; hosts
// are IP-literal stand-ins. They reconstruct the KINDS of passage reported in
// the 2026-10-24 domestic Nigerian online renewal production failure, including
// phrasings the earlier fixture did not cover (age rules expressed as noun
// subjects without an "if" lead, and a shared verb with a different object).
// They are not an exact replay of production: the raw model trace is not stored
// in the repository. The generic, country-agnostic engine runs unchanged.

const DOMESTIC_OFFICIAL_TEXT = `Domestic online renewal guidance

Register an account on the official portal to start your domestic online renewal.

Verify your national identity number inside the online application before booking an appointment.

Upload the required supporting documents through the portal as document files.

Pay the standard domestic 32-page 5-year renewal fee of NGN 100,000 through the portal, excluding bank charges; bank charges are additional and are settled with the payment provider.

Submit the completed application online and book an in-person biometric capture appointment at an enrolment centre.

Applicants attend biometric capture in person at the designated enrolment centre.

You do not need to attach printed photographs to an online application; printed photographs are required only with a paper form.

Applicants under 16 do not complete identity-number verification; a guardian supplies an age declaration instead.

Minors cannot attend biometric capture without a guardian and must bring an age declaration to the enrolment centre.

Do not book travel until you have a valid passport; your new passport will not have the same number.

You do not need a guarantor for an online renewal; guarantor forms exist only for paper applications.`;

const CONSULAR_OFFICIAL_TEXT = `Renewal guidance for applicants abroad

The consulate cannot provide internet access or printing facilities during a consular visit.

Applications received after the published cutoff will not be accepted at the New York consulate.

Nigerians abroad renewing through an embassy or consulate pay the diaspora fee of USD 150 and attend consular biometric capture in person.`;

const POSITIVE_CONTROL_TEXT = `Official requirements and prohibitions for the same route

You do not need to post printed photos for an online application; a digital photo is enough.

Biometric capture cannot be completed online; every applicant attends in person at an enrolment centre.

Fees cannot be paid in cash at enrolment centres; all fees are paid through the online portal.

Applications cannot be completed by post; every applicant must attend biometric capture in person.

You need two identical printed photos if you are applying using a paper form.

If the applicant is under 18, a guardian completes an age declaration and identity-number verification is not required for that application.`;

export function makeDiagnosticSources(): RetrievedSource[] {
  return [
    makeSource('S1', DOMESTIC_OFFICIAL_TEXT, 'https://8.8.8.8/domestic-renewal', {
      title: 'Domestic online renewal guidance',
      publisher: 'Fixture immigration service',
      authority: 'official',
    }),
    makeSource('S2', CONSULAR_OFFICIAL_TEXT, 'https://9.9.9.9/consular-renewal', {
      title: 'Renewal guidance for applicants abroad',
      publisher: 'Fixture immigration service',
      authority: 'official',
    }),
  ];
}

export function makePositiveControlSources(): RetrievedSource[] {
  return [
    makeSource('P1', POSITIVE_CONTROL_TEXT, 'https://7.7.7.7/requirements', {
      title: 'Official requirements and prohibitions for the same route',
      publisher: 'Fixture immigration service',
      authority: 'official',
    }),
  ];
}

export function makeDiagnosticInput(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    task: 'Renew an expired Nigerian adult passport domestically.',
    goal: 'Complete the domestic online renewal with in-person biometric capture.',
    jurisdiction: 'Nigeria',
    category: 'Travel & identity documents',
    details:
      'Adult applicant applying domestically with the online route, paying online, and attending an enrolment centre in person.',
    sourceUrls: [],
    document: null,
    searchQueries: [],
    answers: [],
    ...overrides,
  };
}

export const diagnosticFixtureReceipt: RuntimeReceipt = {
  mode: 'live',
  provider: 'nebius',
  model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  responseId: 'fixture-contradiction-diagnostics-not-a-live-call',
  latencyMs: 1,
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  retrieval: { tavilyCalls: 1, directFetches: 2, tavilyRequestIds: ['fixture-tavily-diag-1'] },
};

// Instructions reproducing each reported false positive, keyed for assertions.
export const TRAP_INSTRUCTIONS: Record<string, string> = {
  printedPhotoNotice: 'Register and access the official portal to start the domestic renewal.',
  consularInternet: 'Verify your national identity number inside the online application.',
  ageRuleNounFormNin: 'Verify your national identity number inside the online application.',
  ageRuleNounFormBiometrics:
    'Attend an in-person biometric capture appointment at an enrolment centre.',
  foreignMissionCutoff: 'Submit the completed domestic application online.',
  sharedVerbDifferentObject:
    'Book an in-person biometric capture appointment at an enrolment centre.',
  guarantorNotice: 'Upload the required supporting documents through the portal.',
};

// Instructions that a same-context official passage genuinely contradicts.
export const GENUINE_CONTRADICTION_INSTRUCTIONS: Record<string, string> = {
  postPhotos: 'Post printed photos with your online application.',
  fullyOnlineBiometrics:
    'Complete biometric capture fully online without attending an enrolment centre.',
  cashFee: 'Pay the NGN 100,000 fee in cash at the enrolment centre.',
  byPost: 'Send the passport paperwork by post instead of visiting an enrolment centre.',
  paperFormPhotos: 'Get two identical printed photos before starting your online renewal.',
  underEighteenVerification:
    'For the applicant under 18, complete identity-number verification inside the online application.',
};

export function makeDiagnosticModelPlan(): ModelPlan {
  return {
    title: 'Domestic online renewal plan',
    steps: [
      {
        id: 'portal',
        title: 'Access the official portal',
        instruction: 'Register and access the official portal to start the domestic renewal.',
        completionCriteria: 'A portal account is registered and the renewal is started.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Register an account on the official portal to start your domestic online renewal.',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'nin',
        title: 'Verify your national identity number',
        instruction: 'Verify your national identity number inside the online application.',
        completionCriteria: 'The national identity number is verified inside the application.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Verify your national identity number inside the online application before booking an appointment.',
          },
        ],
        dueDate: null,
        dependsOn: ['portal'],
      },
      {
        id: 'upload',
        title: 'Upload supporting documents',
        instruction: 'Upload the required supporting documents through the portal.',
        completionCriteria: 'Every required supporting document is uploaded through the portal.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote: 'Upload the required supporting documents through the portal as document files.',
          },
        ],
        dueDate: null,
        dependsOn: ['nin'],
      },
      {
        id: 'pay',
        title: 'Pay the domestic renewal fee',
        instruction:
          'Pay the NGN 100,000 domestic renewal fee through the portal, excluding bank charges.',
        completionCriteria: 'The domestic fee is paid and a payment receipt is saved.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Pay the standard domestic 32-page 5-year renewal fee of NGN 100,000 through the portal, excluding bank charges; bank charges are additional and are settled with the payment provider.',
          },
        ],
        dueDate: null,
        dependsOn: ['upload'],
      },
      {
        id: 'submit',
        title: 'Submit the application online',
        instruction: 'Submit the completed domestic application online.',
        completionCriteria: 'The completed domestic application is submitted online.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Submit the completed application online and book an in-person biometric capture appointment at an enrolment centre.',
          },
        ],
        dueDate: null,
        dependsOn: ['pay'],
      },
      {
        id: 'biometrics',
        title: 'Attend biometric capture in person',
        instruction: 'Attend an in-person biometric capture appointment at an enrolment centre.',
        completionCriteria: 'Biometric capture is completed in person at an enrolment centre.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Applicants attend biometric capture in person at the designated enrolment centre.',
          },
        ],
        dueDate: null,
        dependsOn: ['submit'],
      },
      {
        // Genuinely contradicted by an in-scope same-route prohibition: the
        // detector must still downgrade this and emit a decisive diagnostic.
        id: 'post-photos',
        title: 'Post printed photos',
        instruction: 'Post printed photos with your online application.',
        completionCriteria: 'Printed photos are posted with the online application.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'P1',
            quote:
              'You do not need to post printed photos for an online application; a digital photo is enough.',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        // Fabricated citation: exact-passage validation must strip it and the
        // step must never be promoted.
        id: 'courier',
        title: 'Request courier delivery',
        instruction: 'Request courier delivery of the new document after a decision is made.',
        completionCriteria: 'A courier delivery request is recorded.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote: 'Courier delivery of the new document can be requested after the decision.',
          },
        ],
        dueDate: null,
        dependsOn: ['biometrics'],
      },
    ],
    conflicts: [],
    unresolvedQuestions: [
      {
        id: 'processing-time',
        question: 'How long does domestic renewal processing currently take?',
        reason: 'No retrieved source states a current domestic processing duration.',
      },
      {
        id: 'courier-availability',
        question: 'Can the new document be delivered by courier, and at what charge?',
        reason: 'No retrieved source mentions courier delivery or its charge.',
      },
    ],
  };
}
