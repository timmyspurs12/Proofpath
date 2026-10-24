import type { PlanRequest, RuntimeReceipt } from '../../src/shared/schemas';
import type { ModelPlan } from '../../server/lib/evidence';
import { makeSource } from '../fixtures';
import type { RetrievedSource } from '../../server/lib/retrieval';

// Regression fixture modeled on the genuine live export reported on
// 2026-10-24: an online adult UK passport renewal plan whose model output
// (a) stated an £82.50 fee contradicted by the GOV.UK £102 online fee,
// (b) mixed paper-route printed photos into the online workflow,
// (c) relied on a secondary publisher against official guidance, and
// (d) left submission/tracking guidance unresolved. Source passages use
// wording read from the current GOV.UK pages on 2026-10-24. The receipt is
// clearly labelled fixture data; it is not a fabricated live response.

const GOVUK_RENEW_TEXT = `Renew or replace your adult passport

Renew online

Use this service to renew your passport online. It costs £102.

You'll need:

- a digital photo
- a credit or debit card
- your passport

Renew using a paper application form

You can get a paper application form from a Post Office that has a Check and Send service.

It costs £115.50.

You'll need 2 new and identical printed photos of yourself.`;

const GOVUK_PHOTO_TEXT = `Get a passport photo

Digital photos

You need a digital photo to apply for a passport online.

You must get a new photo when you get a new passport, even if your appearance has not changed.

You need 2 identical printed photos if you are applying for a passport using a paper form.

You need digital photos to apply for a passport online.`;

const SECONDARY_TEXT = `UK passport renewal tips

Renewing online costs £82.50 and applicants should get two printed passport photos ready before they apply, even for the online service. Posting your old passport and tracking the application are handled after you pay.`;

export function makePassportSources(): RetrievedSource[] {
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
    makeSource('S3', SECONDARY_TEXT, 'https://travel-tips.example/uk-passport-renewal', {
      title: 'UK passport renewal tips',
      publisher: 'Travel Tips Blog',
      authority: 'secondary',
      retrieval: 'tavily',
    }),
  ];
}

export function makePassportInput(): PlanRequest {
  return {
    task: 'Create an action plan to renew my adult UK passport online.',
    jurisdiction: 'United Kingdom',
    category: 'Travel & identity',
    details:
      'The applicant is 32, lives in the UK, is renewing a standard adult passport, prefers the online route, and is not asking about an urgent service.',
    sourceUrls: ['https://www.gov.uk/renew-adult-passport/renew'],
    document: null,
    goal: 'Complete an online adult UK passport renewal with evidence from official guidance.',
    searchQueries: [
      'renew adult passport online GOV.UK fee digital photo',
      'track online passport application GOV.UK submission reference',
    ],
    answers: [],
  };
}

export function makeObservedModelPlan(): ModelPlan {
  return {
    title: 'Renew your UK passport',
    steps: [
      {
        id: 'fee',
        title: 'Pay the online renewal fee',
        instruction:
          'Pay the £82.50 online renewal fee with a credit or debit card when you submit the application.',
        completionCriteria: 'The renewal fee has been paid and a payment confirmation is saved.',
        claimedStatus: 'supported',
        // Valid exact passage from the secondary source — the quote exists,
        // but its figure contradicts the official £102 online fee.
        evidence: [
          {
            sourceId: 'S3',
            quote:
              'Renewing online costs £82.50 and applicants should get two printed passport photos ready before they apply, even for the online service.',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'printed-photo',
        title: 'Get printed photos',
        instruction:
          'Get two identical printed photos before starting your online renewal and keep them ready to post.',
        completionCriteria:
          'Two identical printed photos are available to send with the application.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S3',
            quote:
              'applicants should get two printed passport photos ready before they apply, even for the online service.',
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
        dependsOn: ['printed-photo'],
      },
    ],
    conflicts: [],
    unresolvedQuestions: [
      {
        id: 'submission-tracking',
        question: 'How do I submit my old passport and track the online application after paying?',
        reason:
          'No retrieved source covers the submission and tracking instructions for the online route.',
      },
    ],
  };
}

export const observedLiveReceipt: RuntimeReceipt = {
  mode: 'live',
  provider: 'nebius',
  model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  responseId: 'chatcmpl-fixture-observed-export-not-a-live-call',
  latencyMs: 14_979,
  usage: { inputTokens: 4820, outputTokens: 1984, totalTokens: 6804 },
  retrieval: { tavilyCalls: 2, directFetches: 1, tavilyRequestIds: ['fixture-tavily-1'] },
};
