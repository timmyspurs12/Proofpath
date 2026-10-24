import type { PlanRequest, RuntimeReceipt } from '../../src/shared/schemas';
import type { ModelPlan } from '../../server/lib/evidence';
import { makeSource } from '../fixtures';
import type { RetrievedSource } from '../../server/lib/retrieval';

// Regression fixture for the false-positive contradiction downgrades observed
// in a live domestic Nigerian online passport-renewal run. Every passage here
// is a CLEARLY LABELLED SYNTHETIC FIXTURE: it is not live research, quotes no
// real scraped page, and its hosts are IP-literal stand-ins. The generic,
// country-agnostic engine runs unchanged against it — there is no
// country-specific branch in the validation logic.
//
// The two official sources deliberately mix (a) exact domestic passages that
// genuinely support each renewal step and (b) the four kinds of unrelated
// passage that wrongly withdrew support in production:
//   1. a printed-photograph notice (a paper-route requirement),
//   2. a consular internet-access notice,
//   3. an age/guardian conditional declaration,
//   4. a foreign-mission application cutoff.

const DOMESTIC_OFFICIAL_TEXT = `Domestic online renewal guidance

Register an account on the official portal to start your domestic online renewal.

Verify your national identity number inside the online application before booking an appointment.

Upload the required supporting documents through the portal as document files.

Pay the standard domestic 32-page 5-year renewal fee of NGN 100,000 through the portal, excluding bank charges; bank charges are additional and are settled with the payment provider.

Submit the completed application online and book an in-person biometric capture appointment at an enrolment centre.

Applicants attend biometric capture in person at the designated enrolment centre.

You do not need to attach printed photographs to an online application; printed photographs are required only with a paper form.

If the applicant is under 18, a guardian completes an age declaration and identity-number verification is not required for that application.`;

const CONSULAR_OFFICIAL_TEXT = `Renewal guidance for applicants abroad

The consulate cannot provide internet access or printing facilities during a consular visit.

Applications received after the published cutoff will not be accepted at the New York consulate.

Nigerians abroad renewing through an embassy or consulate pay the diaspora fee of USD 150 and attend consular biometric capture in person.`;

const POSITIVE_CONTROL_TEXT = `Official requirements and prohibitions for the same route

You do not need to post printed photos for an online application; a digital photo is enough.

Biometric capture cannot be completed online; every applicant attends in person at an enrolment centre.

Fees cannot be paid in cash at enrolment centres; all fees are paid through the online portal.

You need two identical printed photos if you are applying using a paper form.

Domestic applicants cannot complete the application through an embassy; the domestic portal must be used instead.`;

export function makeContextSources(): RetrievedSource[] {
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

// Same-route, same-requirement official prohibitions. A genuine contradiction
// against one of these must still withdraw support.
export function makePositiveControlSources(): RetrievedSource[] {
  return [
    makeSource('P1', POSITIVE_CONTROL_TEXT, 'https://7.7.7.7/requirements', {
      title: 'Official requirements and prohibitions for the same route',
      publisher: 'Fixture immigration service',
      authority: 'official',
    }),
  ];
}

export function makeContextInput(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    task: 'Renew my domestic adult passport using the official online portal and in-person biometrics.',
    goal: 'Complete the domestic online renewal with in-person biometric capture.',
    jurisdiction: 'Nigeria',
    category: 'Travel & identity documents',
    details:
      'I am applying domestically with the online route, will pay online, and will attend an enrolment centre in person.',
    sourceUrls: [],
    document: null,
    searchQueries: [],
    answers: [],
    ...overrides,
  };
}

export const contextFixtureReceipt: RuntimeReceipt = {
  mode: 'live',
  provider: 'nebius',
  model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  responseId: 'fixture-contradiction-context-not-a-live-call',
  latencyMs: 1,
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  retrieval: { tavilyCalls: 1, directFetches: 2, tavilyRequestIds: ['fixture-tavily-context-1'] },
};

// Six steps genuinely supported by exact S1 passages, plus one step whose
// citation is fabricated (the quote exists in no retrieved source). The trap
// passages in S1 and S2 must not downgrade any of the six grounded steps.
export function makeContextModelPlan(): ModelPlan {
  return {
    title: 'Domestic online renewal plan',
    steps: [
      {
        id: 'portal-access',
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
        id: 'identity-verification',
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
        dependsOn: ['portal-access'],
      },
      {
        id: 'document-upload',
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
        dependsOn: ['identity-verification'],
      },
      {
        id: 'payment',
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
        dependsOn: ['document-upload'],
      },
      {
        id: 'submission',
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
        dependsOn: ['payment'],
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
        dependsOn: ['submission'],
      },
      {
        id: 'courier-delivery',
        title: 'Request courier delivery of the new document',
        instruction: 'Request courier delivery of the new document after a decision is made.',
        completionCriteria: 'A courier delivery request is recorded.',
        claimedStatus: 'supported',
        // Fabricated: this sentence exists in no retrieved source. It must be
        // stripped by exact-passage validation, not rescued by another passage.
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

// The four false-positive instructions, keyed by the production report. Each is
// a domestic online-route instruction that an unrelated trap passage used to
// contradict. They are exported individually for detector-level tests.
export const FALSE_POSITIVE_INSTRUCTIONS: Record<string, string> = {
  printedPhoto: 'Upload the required supporting documents through the portal.',
  consularInternet: 'Register and access the official portal to start the domestic renewal.',
  ageDeclarationIdentity: 'Verify your national identity number inside the online application.',
  ageDeclarationBiometrics:
    'Attend an in-person biometric capture appointment at an enrolment centre.',
  foreignCutoff: 'Submit the completed domestic application online.',
};

// Genuine same-context contradictions that must still fail closed.
export const POSITIVE_CONTROL_INSTRUCTIONS: Record<string, string> = {
  postPhotos: 'Post printed photos with your online application.',
  onlineBiometrics:
    'Complete biometric capture fully online without attending an enrolment centre.',
  cashPayment: 'Pay the NGN 100,000 fee in cash at the enrolment centre.',
  paperFormPhotos: 'Get two identical printed photos before starting your online renewal.',
  embassyForDomestic:
    'Attend the embassy in person to complete this domestic renewal instead of using the portal.',
};
