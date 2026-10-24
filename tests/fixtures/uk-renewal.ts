import type { PlanRequest, RuntimeReceipt } from '../../src/shared/schemas';
import type { ModelPlan } from '../../server/lib/evidence';
import { makeSource } from '../fixtures';
import type { RetrievedSource } from '../../server/lib/retrieval';

// Regression fixture for an online adult UK passport renewal, pairing with the
// Nigeria live-failure fixture to prove the same generic engine behaves across
// jurisdictions. All passages are SYNTHETIC, clearly-labelled fixtures written
// in the style of the GOV.UK renew/photo/track pages; they are not live
// research and quote no real scraped page. No UK-specific branch exists in the
// validation logic — currency tokens and generic route vocabulary do the work.

const GOVUK_RENEW_TEXT = `Renew or replace your adult passport

Renew online

Use this service to renew your passport online. It costs £102.

You'll need a digital photo, a credit or debit card, and your current passport.

Renew using a paper application form

You can get a paper application form from a Post Office that has a Check and Send service.

It costs £115.50.

You'll need 2 new and identical printed photos of yourself for the paper form.`;

const GOVUK_PHOTO_TEXT = `Get a passport photo

Digital photos

You need a digital photo to apply for a passport online.

You must get a new photo when you get a new passport, even if your appearance has not changed.

You need 2 identical printed photos if you are applying for a passport using a paper form.`;

const GOVUK_TRACK_TEXT = `Track your passport application

After you apply online, sign in to the track service with your application reference number to check progress.

You will get an email confirming your new passport is on its way.`;

const SECONDARY_TEXT = `UK passport renewal tips

Renewing online costs £82.50 and applicants should get two printed passport photos ready before they apply, even for the online service. Posting your old passport and tracking the application are handled after you pay.`;

export function makeUkRenewalSources(): RetrievedSource[] {
  return [
    makeSource('S1', GOVUK_RENEW_TEXT, 'https://www.gov.uk/renew-adult-passport/renew', {
      title: 'Renew or replace your adult passport: Renew',
      publisher: 'GOV.UK / HM Passport Office',
      authority: 'official',
      retrieval: 'direct',
    }),
    makeSource('S2', GOVUK_PHOTO_TEXT, 'https://www.gov.uk/photos-for-passports', {
      title: 'Get a passport photo',
      publisher: 'GOV.UK / HM Passport Office',
      authority: 'official',
      retrieval: 'tavily',
    }),
    makeSource('S3', GOVUK_TRACK_TEXT, 'https://www.gov.uk/track-passport-application', {
      title: 'Track your passport application',
      publisher: 'GOV.UK / HM Passport Office',
      authority: 'official',
      retrieval: 'tavily',
    }),
    makeSource('S4', SECONDARY_TEXT, 'https://travel-tips.example/uk-passport-renewal', {
      title: 'UK passport renewal tips',
      publisher: 'Travel Tips Blog',
      authority: 'secondary',
      retrieval: 'tavily',
    }),
  ];
}

export function makeUkRenewalInput(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    task: 'Create an action plan to renew my adult UK passport online.',
    goal: 'Complete an online adult UK passport renewal with evidence from official guidance.',
    jurisdiction: 'United Kingdom',
    category: 'Travel & identity documents',
    details:
      'The applicant lives in the UK, is renewing a standard adult passport, and wants the online route rather than the paper Check and Send route.',
    sourceUrls: ['https://www.gov.uk/renew-adult-passport/renew'],
    document: null,
    searchQueries: [
      'renew adult passport online GOV.UK fee digital photo',
      'track online passport application GOV.UK application reference',
    ],
    answers: [],
    ...overrides,
  };
}

export const ukFixtureReceipt: RuntimeReceipt = {
  mode: 'live',
  provider: 'nebius',
  model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  responseId: 'fixture-uk-renewal-not-a-live-call',
  latencyMs: 1,
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  retrieval: { tavilyCalls: 2, directFetches: 4, tavilyRequestIds: ['fixture-tavily-uk-1'] },
};

export function makeUkRenewalModelPlan(): ModelPlan {
  return {
    title: 'Renew your adult UK passport online',
    steps: [
      {
        id: 'wrong-fee',
        title: 'Pay the secondary blog renewal fee',
        instruction:
          'Pay the £82.50 online renewal fee with a credit or debit card when you submit the application.',
        completionCriteria: 'A payment confirmation for the renewal fee is saved.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S4',
            quote:
              'Renewing online costs £82.50 and applicants should get two printed passport photos ready before they apply, even for the online service.',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'post-old-passport',
        title: 'Post the old passport to the passport office',
        instruction: 'Post your old passport to HM Passport Office after applying online.',
        completionCriteria: 'A courier receipt for the old passport is kept.',
        claimedStatus: 'supported',
        // Fabricated citation: this sentence exists in no retrieved source.
        evidence: [
          {
            sourceId: 'S4',
            quote: 'Send your old passport by post to HM Passport Office for processing.',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'digital-photo',
        title: 'Prepare a digital photo',
        instruction: 'Provide a digital photo for the online application.',
        completionCriteria: 'A compliant digital photo is uploaded with the online application.',
        claimedStatus: 'supported',
        evidence: [
          { sourceId: 'S2', quote: 'You need a digital photo to apply for a passport online.' },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'track',
        title: 'Track the application with your reference number',
        instruction:
          'Sign in to the track service with your application reference number to check progress.',
        completionCriteria: 'The application status shows as received in the track service.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S3',
            quote:
              'After you apply online, sign in to the track service with your application reference number to check progress.',
          },
        ],
        dueDate: null,
        dependsOn: ['digital-photo'],
      },
    ],
    conflicts: [],
    unresolvedQuestions: [
      {
        id: 'urgent-fee',
        question: 'What does the urgent or premium online renewal service cost, if one is needed?',
        reason: 'No retrieved official source publishes an urgent or premium service fee.',
      },
    ],
  };
}
