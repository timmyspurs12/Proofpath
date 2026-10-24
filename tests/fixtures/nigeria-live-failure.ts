import type { PlanRequest, RuntimeReceipt } from '../../src/shared/schemas';
import type { ModelPlan } from '../../server/lib/evidence';
import { makeSource } from '../fixtures';
import type { RetrievedSource } from '../../server/lib/retrieval';

// Regression fixture modeled on the observed 2026-10-24 production failure for
// a domestic Nigerian adult passport renewal: the official NGN 100,000 fee
// (32-page, 5-year, excluding bank charges) was discovered but never supported
// a generated step, while a secondary publisher figure and an ungrounded
// collection instruction reached the plan. All passages below are SYNTHETIC,
// clearly-labelled fixtures; they are not live research and quote no real
// scraped page. The same generic engine code runs against them — there is no
// Nigeria-specific branch anywhere in the validation logic.

const NIS_PORTAL_TEXT = `Nigeria Immigration Service passport renewal portal

Domestic adult passport renewal

The standard domestic 32-page 5-year adult passport renewal fee is NGN 100,000, excluding bank charges.

Applicants in Nigeria complete the online application and book an in-person biometric capture appointment at an enrolment centre.

After biometric capture, collect your new passport in person at the enrolment centre when notified.

Applications cannot be completed by post and old passports are handed over at the enrolment centre.`;

const NIS_SLA_TEXT = `Passport service level agreement

The domestic 32-page 5-year passport fee remains NGN 100,000 excluding bank charges, and bank charges are settled separately with the payment provider.

Published fees are reviewed when the service announces a new fee circular.`;

const NIS_DIASPORA_TEXT = `Passport renewal for Nigerians abroad

Nigerians abroad renewing through an embassy or consulate pay the diaspora 32-page passport fee of NGN 150,000 and attend consular biometric capture in person.

Diaspora applications cannot use the domestic online payment route.`;

const SECONDARY_TEXT = `Independent passport application tips

Applicants often budget around NGN 70,000 including bank charges for a renewal and assume old passports can be posted to the immigration office, but always confirm current requirements on the official portal.`;

export function makeNigeriaFailureSources(): RetrievedSource[] {
  return [
    makeSource('S1', NIS_PORTAL_TEXT, 'https://immigration.gov.ng/passport-renewal', {
      title: 'Nigeria Immigration Service passport renewal portal',
      publisher: 'Nigeria Immigration Service',
      authority: 'official',
    }),
    makeSource('S2', NIS_SLA_TEXT, 'https://immigration.gov.ng/service-level-agreement', {
      title: 'Passport service level agreement',
      publisher: 'Nigeria Immigration Service',
      authority: 'official',
    }),
    makeSource('S3', NIS_DIASPORA_TEXT, 'https://immigration.gov.ng/diaspora-passport', {
      title: 'Passport renewal for Nigerians abroad',
      publisher: 'Nigeria Immigration Service',
      authority: 'official',
    }),
    makeSource('S4', SECONDARY_TEXT, 'https://traveltips.example/nigeria-passport', {
      title: 'Independent passport application tips',
      publisher: 'Travel Tips example',
      authority: 'secondary',
    }),
  ];
}

export function makeNigeriaFailureInput(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    task: 'Renew my Nigerian adult passport domestically using the online route.',
    goal: 'Renew an adult Nigerian passport in Nigeria with the domestic online route and in-person biometrics.',
    jurisdiction: 'Nigeria',
    category: 'Travel & identity documents',
    details:
      'I am in Nigeria, applying domestically. I need the 32-page 5-year passport and the exact fee before bank charges.',
    sourceUrls: [],
    document: null,
    searchQueries: [],
    answers: [],
    ...overrides,
  };
}

export const nigeriaFixtureReceipt: RuntimeReceipt = {
  mode: 'live',
  provider: 'nebius',
  model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  responseId: 'fixture-nigeria-live-failure-not-a-live-call',
  latencyMs: 1,
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  retrieval: { tavilyCalls: 2, directFetches: 7, tavilyRequestIds: ['fixture-tavily-1'] },
};

export function makeNigeriaFailureModelPlan(): ModelPlan {
  return {
    title: 'Domestic Nigerian passport renewal',
    steps: [
      {
        id: 'wrong-fee',
        title: 'Pay the secondary-source renewal fee',
        instruction: 'Pay the NGN 70,000 renewal fee including bank charges.',
        completionCriteria: 'A payment receipt for the renewal fee is saved.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S4',
            quote: 'Applicants often budget around NGN 70,000 including bank charges for a renewal',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'scoped-fee',
        title: 'Pay the official fee through the embassy route',
        instruction:
          'Pay the NGN 100,000 diaspora renewal fee at the embassy; this figure includes bank charges.',
        completionCriteria: 'The scoped fee payment is confirmed with the mission.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'The standard domestic 32-page 5-year adult passport renewal fee is NGN 100,000, excluding bank charges.',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'post-passport',
        title: 'Post the old passport to the immigration office',
        instruction: 'Send your old passport by post to the immigration office.',
        completionCriteria: 'The old passport is mailed and a courier receipt is kept.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S4',
            quote: 'Post every old passport directly to the immigration headquarters.',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'biometrics',
        title: 'Book biometric capture',
        instruction:
          'Complete the online application and book an in-person biometric capture appointment at an enrolment centre.',
        completionCriteria: 'A biometric appointment at an enrolment centre is confirmed.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Applicants in Nigeria complete the online application and book an in-person biometric capture appointment at an enrolment centre.',
          },
        ],
        dueDate: null,
        dependsOn: ['wrong-fee'],
      },
      {
        id: 'collect',
        title: 'Collect the new passport at the enrolment centre',
        instruction: 'Collect your new passport in person at the enrolment centre when notified.',
        completionCriteria: 'The new passport is collected in person after notification.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'After biometric capture, collect your new passport in person at the enrolment centre when notified.',
          },
        ],
        dueDate: null,
        dependsOn: ['biometrics'],
      },
    ],
    conflicts: [
      {
        topic: 'Passport fee differs between domestic and diaspora scopes',
        detail:
          'Official sources publish NGN 100,000 for the domestic 32-page 5-year renewal and NGN 150,000 for the diaspora 32-page renewal; the scopes must not be merged.',
        stepIds: ['scoped-fee'],
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'The standard domestic 32-page 5-year adult passport renewal fee is NGN 100,000, excluding bank charges.',
          },
          {
            sourceId: 'S3',
            quote:
              'Nigerians abroad renewing through an embassy or consulate pay the diaspora 32-page passport fee of NGN 150,000 and attend consular biometric capture in person.',
          },
        ],
      },
    ],
    unresolvedQuestions: [
      {
        id: 'bank-charges',
        question:
          'What exact bank or payment-provider charges apply on top of the NGN 100,000 fee?',
        reason:
          'Official sources state bank charges are excluded but no retrieved source publishes the current provider amount.',
      },
      {
        id: 'processing-time',
        question: 'What is the current domestic passport processing time?',
        reason: 'No retrieved official source states a current processing duration.',
      },
    ],
  };
}

// An HTML page with navigation/chrome around the same official passage, used
// to prove extraction strips chrome while preserving exact quotable text.
export function makeNisPortalHtml(): string {
  return `<!doctype html>
<html lang="en">
<head><title>Passport renewal | Nigeria Immigration Service</title>
<meta property="og:site_name" content="Nigeria Immigration Service">
<nav><a href="/">Home</a><a href="/about">About</a><a href="/contact">Contact</a></nav>
</head>
<body>
<header>Skip to main content | Menu | Search</header>
<main>
<h1>Domestic adult passport renewal</h1>
<p>The standard domestic 32-page 5-year adult passport renewal fee is NGN 100,000, excluding bank charges.</p>
<p>Applicants in Nigeria complete the online application and book an in-person biometric capture appointment at an enrolment centre.</p>
</main>
<footer>Copyright Nigeria Immigration Service. Cookie settings. Privacy policy.</footer>
</body></html>`;
}
