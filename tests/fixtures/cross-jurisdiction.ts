import type { PlanRequest, RuntimeReceipt } from '../../src/shared/schemas';
import type { ModelPlan } from '../../server/lib/evidence';
import { makeSource } from '../fixtures';
import type { RetrievedSource } from '../../server/lib/retrieval';

// Cross-jurisdiction universality fixtures.
//
// These are SYNTHETIC, clearly-labelled fixtures built to exercise the generic
// engine across unrelated countries, task categories, currencies and routes.
// They are not fresh live research and their passages are self-contained;
// URLs stand in for the real official hosts named in them. The same generic
// validation code paths run for every fixture — there are no country-specific
// branches in the engine.

export const crossJurisdictionReceipt: RuntimeReceipt = {
  mode: 'live',
  provider: 'nebius',
  model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  responseId: 'fixture-cross-jurisdiction-not-a-live-call',
  latencyMs: 1,
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  retrieval: { tavilyCalls: 0, directFetches: 0, tavilyRequestIds: [] },
};

function baseInput(overrides: Partial<PlanRequest>): PlanRequest {
  return {
    task: '',
    goal: '',
    jurisdiction: '',
    category: '',
    details: '',
    sourceUrls: [],
    document: null,
    searchQueries: [],
    answers: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Nigeria — domestic adult passport, online route with in-person biometrics
// ---------------------------------------------------------------------------

const NIS_PORTAL_TEXT = `Nigerian passport application guidelines

The Nigeria Immigration Service receives adult passport applications through its official online portal.

The standard 32-page adult passport application fee is NGN 25,000.

After submitting the online form, every applicant books a biometric capture appointment at an enrolment centre in Nigeria.

If you apply from abroad through a Nigerian embassy or consulate, different consular fees and procedures apply.`;

const NIS_BIOMETRIC_TEXT = `Biometric capture for passport applicants

Applications cannot be completed by post; every applicant in Nigeria must attend biometric capture in person at the designated enrolment centre.

Bring your printed application acknowledgement slip and supporting documents to the appointment.`;

const NG_SECONDARY_TEXT = `Nigeria passport tips

Many travellers budget around NGN 15,000 for a Nigerian passport and assume the paperwork can be sent by post, but always confirm current requirements on the official portal.`;

const NIS_CONSULAR_TEXT = `Passport services for Nigerians abroad

Nigerians applying from abroad cannot complete the passport renewal online; they must attend a Nigerian embassy or consulate in person for biometric capture and identity verification.

Consular passport fees differ from domestic application fees and are published by each mission.`;

export function makeNigeriaSources(): RetrievedSource[] {
  return [
    makeSource('S1', NIS_PORTAL_TEXT, 'https://immigration.gov.ng/passport', {
      title: 'Nigerian passport application guidelines',
      publisher: 'Nigeria Immigration Service',
      authority: 'official',
    }),
    makeSource('S2', NIS_BIOMETRIC_TEXT, 'https://immigration.gov.ng/biometric', {
      title: 'Biometric capture for passport applicants',
      publisher: 'Nigeria Immigration Service',
      authority: 'official',
    }),
    makeSource('S3', NG_SECONDARY_TEXT, 'https://travelguide.example/nigeria-passports', {
      title: 'Nigeria passport tips',
      publisher: 'Travel Guide example',
      authority: 'secondary',
    }),
    makeSource('S4', NIS_CONSULAR_TEXT, 'https://immigration.gov.ng/consular', {
      title: 'Passport services for Nigerians abroad',
      publisher: 'Nigeria Immigration Service',
      authority: 'official',
    }),
  ];
}

export function makeNigeriaInput(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return baseInput({
    task: 'Renew my Nigerian adult passport online and complete biometric enrolment.',
    goal: 'Renew an adult Nigerian passport using the domestic online route with in-person biometrics.',
    jurisdiction: 'Nigeria',
    category: 'Travel & identity documents',
    details:
      'I live in Nigeria and will attend an in-person biometric appointment at an enrolment centre.',
    ...overrides,
  });
}

export function makeNigeriaModelPlan(): ModelPlan {
  return {
    title: 'Domestic Nigerian passport renewal',
    steps: [
      {
        id: 'fee',
        title: 'Pay the passport application fee',
        instruction: 'Pay the NGN 15,000 passport application fee online.',
        completionCriteria: 'A payment receipt for the correct official fee is saved.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S3',
            quote: 'Many travellers budget around NGN 15,000 for a Nigerian passport',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'post',
        title: 'Send paperwork by post',
        instruction: 'Send the passport paperwork by post instead of visiting an enrolment centre.',
        completionCriteria: 'The paperwork is mailed to the immigration service.',
        claimedStatus: 'supported',
        evidence: [{ sourceId: 'S3', quote: 'assume the paperwork can be sent by post' }],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'biometric',
        title: 'Book biometric capture',
        instruction:
          'Book an in-person biometric capture appointment after submitting the online form.',
        completionCriteria: 'A biometric appointment at an enrolment centre is confirmed.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'every applicant books a biometric capture appointment at an enrolment centre in Nigeria.',
          },
        ],
        dueDate: null,
        dependsOn: ['fee'],
      },
    ],
    conflicts: [],
    unresolvedQuestions: [
      {
        id: 'timeline',
        question: 'How long does domestic passport processing currently take?',
        reason: 'No retrieved source states a current processing time.',
      },
    ],
  };
}

export function makeConsularModelPlan(): ModelPlan {
  return {
    title: 'Consular Nigerian passport renewal abroad',
    steps: [
      {
        id: 'online-only',
        title: 'Renew fully online',
        instruction: 'Complete the full passport renewal online without visiting an embassy.',
        completionCriteria: 'The renewal is submitted entirely online.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S4',
            quote:
              'they must attend a Nigerian embassy or consulate in person for biometric capture and identity verification.',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'consular-visit',
        title: 'Attend the embassy in person',
        instruction:
          'Attend the embassy in person for biometric capture and identity verification.',
        completionCriteria: 'An embassy biometric appointment is completed.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S4',
            quote:
              'attend a Nigerian embassy or consulate in person for biometric capture and identity verification.',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
    ],
    conflicts: [],
    unresolvedQuestions: [],
  };
}

export function makeConsularInput(): PlanRequest {
  return baseInput({
    task: 'Renew my Nigerian passport from abroad at the embassy, in person.',
    goal: 'Renew an adult Nigerian passport through the consular route outside Nigeria.',
    jurisdiction: 'Nigeria',
    category: 'Travel & identity documents',
    details: 'I live outside Nigeria and will use the consular route at a Nigerian embassy.',
  });
}

// ---------------------------------------------------------------------------
// 2. Canada — third-country immigration process (study permit), CAD fees
// ---------------------------------------------------------------------------

const IRCC_TEXT = `Study permit application guide from Immigration, Refugees and Citizenship Canada

Apply online for a study permit in Canada.

The study permit processing fee is CAD 150.

You may need to give biometrics after you apply; the biometrics fee is CAD 85.

Processing times vary by country and application volume.`;

const CA_SECONDARY_TEXT = `Canada study permit planning

Students often set aside CAD 200 for the study permit fee and should check the official Canada.ca page before paying.`;

export function makeCanadaSources(): RetrievedSource[] {
  return [
    makeSource(
      'S1',
      IRCC_TEXT,
      'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html',
      {
        title: 'Study permit application guide',
        publisher: 'Immigration, Refugees and Citizenship Canada',
        authority: 'official',
      },
    ),
    makeSource('S2', CA_SECONDARY_TEXT, 'https://studyabroad.example/canada', {
      title: 'Canada study permit planning',
      publisher: 'Study Abroad example',
      authority: 'secondary',
    }),
  ];
}

export function makeCanadaInput(): PlanRequest {
  return baseInput({
    task: 'Apply for a Canadian study permit online from outside Canada.',
    goal: 'Submit a study permit application to Canada using the online route from abroad.',
    jurisdiction: 'Canada',
    category: 'Visa & immigration',
    details: 'I am applying from abroad and will submit a digital application.',
  });
}

export function makeCanadaModelPlan(): ModelPlan {
  return {
    title: 'Canadian study permit application',
    steps: [
      {
        id: 'fee',
        title: 'Pay the study permit fee',
        instruction: 'Pay the CAD 200 study permit processing fee online.',
        completionCriteria: 'The official fee is paid and the receipt is saved.',
        claimedStatus: 'supported',
        evidence: [
          { sourceId: 'S2', quote: 'Students often set aside CAD 200 for the study permit fee' },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'biometrics',
        title: 'Pay biometrics if required',
        instruction: 'Pay the CAD 85 biometrics fee after applying if biometrics are required.',
        completionCriteria: 'The biometrics fee is handled when IRCC requests biometrics.',
        claimedStatus: 'supported',
        evidence: [{ sourceId: 'S1', quote: 'the biometrics fee is CAD 85.' }],
        dueDate: null,
        dependsOn: [],
      },
    ],
    conflicts: [],
    unresolvedQuestions: [
      {
        id: 'processing',
        question: 'What is the current study permit processing time for my country?',
        reason: 'The official source says processing times vary without giving a number.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 3. France — non-passport task: online business registration, EUR, no fee
// ---------------------------------------------------------------------------

const FR_OFFICIAL_TEXT = `Registering a business in France

This guide applies to businesses in France registering through the registre national des entreprises.

Registration is completed online through the formalites portal for the standard procedure.

Registering a company online is free of charge; no registration fee applies to the standard formalite, and there is no paper form to post.`;

const FR_SECONDARY_TEXT = `Setting up in France

Founders should budget a EUR 95 registration fee and prepare paper forms to mail to the registry.`;

export function makeFranceSources(): RetrievedSource[] {
  return [
    makeSource('S1', FR_OFFICIAL_TEXT, 'https://formalites.entreprises.gouv.fr/en/start', {
      title: 'Registering a business in France',
      publisher: 'formalites.entreprises.gouv.fr',
      authority: 'official',
    }),
    makeSource('S2', FR_SECONDARY_TEXT, 'https://europe-startup.example/france', {
      title: 'Setting up in France',
      publisher: 'Europe Startups example',
      authority: 'secondary',
    }),
  ];
}

export function makeFranceInput(): PlanRequest {
  return baseInput({
    task: 'Register a new French company online.',
    goal: 'Complete the standard French business registration through the online portal.',
    jurisdiction: 'France',
    category: 'Business registration & licensing',
    details: 'Standard domestic procedure for a new small company.',
  });
}

export function makeFranceModelPlan(): ModelPlan {
  return {
    title: 'French company registration',
    steps: [
      {
        id: 'fee',
        title: 'Pay a registration fee',
        instruction: 'Pay the EUR 95 registration fee to register the company.',
        completionCriteria: 'A registration fee payment is confirmed.',
        claimedStatus: 'supported',
        evidence: [{ sourceId: 'S2', quote: 'Founders should budget a EUR 95 registration fee' }],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'paper',
        title: 'Mail paper forms',
        instruction: 'Post paper forms to the business registry.',
        completionCriteria: 'Paper forms are mailed to the registry.',
        claimedStatus: 'supported',
        evidence: [{ sourceId: 'S2', quote: 'prepare paper forms to mail to the registry.' }],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'portal',
        title: 'Register online via the formalites portal',
        instruction: 'Complete the company registration online through the formalites portal.',
        completionCriteria: 'The registration is submitted on the formalites portal.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Registration is completed online through the formalites portal for the standard procedure.',
          },
        ],
        dueDate: '15 January 2027',
        dependsOn: [],
      },
    ],
    conflicts: [],
    unresolvedQuestions: [
      {
        id: 'documents',
        question: 'Which supporting documents does the portal require for this company?',
        reason: 'No retrieved source lists the required documents.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 4. No adequate evidence: secondary-only sources, no official requirements
// ---------------------------------------------------------------------------

export function makeWeakSources(): RetrievedSource[] {
  return [
    makeSource(
      'S1',
      'Administrative procedures vary and applicants should consult the responsible official body for current requirements. This page does not publish fees, forms, or deadlines.',
      'https://generic-advice.example/process',
      { title: 'Generic advice page', publisher: 'Generic Advice example' },
    ),
  ];
}

export function makeWeakInput(): PlanRequest {
  return baseInput({
    task: 'Apply for a regional trading permit for my market stall.',
    goal: 'Complete a regional trading permit application.',
    jurisdiction: 'Kenya',
    category: 'Business registration & licensing',
    details: '',
  });
}

export function makeWeakModelPlan(): ModelPlan {
  return {
    title: 'Trading permit application',
    steps: [
      {
        id: 'fee',
        title: 'Pay the permit fee',
        instruction: 'Pay the KES 5,000 permit fee when submitting the application.',
        completionCriteria: 'A permit fee receipt is saved.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Administrative procedures vary and applicants should consult the responsible official body for current requirements.',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
    ],
    conflicts: [],
    unresolvedQuestions: [
      {
        id: 'official-source',
        question: 'Which county office issues this trading permit and what is the current fee?',
        reason: 'No official source was retrieved and the only page publishes no requirements.',
      },
    ],
  };
}
