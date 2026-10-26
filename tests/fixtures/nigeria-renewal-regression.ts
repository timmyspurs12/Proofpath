import type { PlanRequest, RuntimeReceipt } from '../../src/shared/schemas';
import type { ModelPlan } from '../../server/lib/evidence';
import { makeSource } from '../fixtures';
import type { RetrievedSource } from '../../server/lib/retrieval';
import { makeNigeriaOfficialSources } from './nigeria-official-2026';

// REGRESSION FIXTURE for the domestic Nigerian passport-renewal evidence
// gate. S1-S4 are the frozen 2026-10-24 verbatim NIS excerpts reused from
// nigeria-official-2026 (no live calls). S5 is a SYNTHETIC, clearly-fictional
// foreign-mission page: it exists solely to prove that overseas/consular
// material cannot leak into a domestic retrieval packet, plan step, or
// unresolved question. Nothing in the engine knows any of these facts.

export const OTTAWA_MISSION_TEXT = `Nigeria High Commission in Ottawa, Canada — consular passport services for Nigerians abroad.

Passport renewal for Nigerians in the diaspora residing in Canada and the wider Ottawa consular region.

The consular administrative fee for a 32-page 5-year passport renewal is CAD 220, payable to the High Commission in Ottawa.

Applicants abroad must book a consular biometric appointment at the Ottawa mission before attending.

Nigerians living outside Nigeria cannot use the domestic online payment route for their renewal.

Contact the consular desk at the Ottawa mission for passport collection and any diaspora-specific guidance.`;

export const OTTAWA_MISSION_URL =
  'https://nigeria-highcommission-ottawa.example.org/diaspora-passport-renewal';

export function makeNigeriaRegressionSources(): RetrievedSource[] {
  const official = makeNigeriaOfficialSources();
  const mission = makeSource('S5', OTTAWA_MISSION_TEXT, OTTAWA_MISSION_URL, {
    title: 'Consular passport renewal for Nigerians in the diaspora (Ottawa mission)',
    publisher: 'Nigeria High Commission Ottawa (synthetic fixture source)',
    authority: 'secondary',
    retrieval: 'tavily',
    retrievedAt: '2026-10-24T00:00:00.000Z',
  });
  return [...official, mission];
}

export function makeNigeriaRegressionInput(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    task: 'Renew my Nigerian adult passport domestically using the online route.',
    goal: 'Complete the domestic 32-page 5-year renewal with in-person biometric capture in Nigeria.',
    jurisdiction: 'Nigeria',
    category: 'Travel & identity documents',
    details:
      'Adult applicant in Nigeria, domestic online route, 32-page 5-year booklet, paying the official service fee before bank charges and attending the chosen immigration office in person.',
    sourceUrls: [
      'https://immigration.gov.ng/info-center/renewal-of-passport/',
      'https://passport.immigration.gov.ng/',
      'https://immigration.gov.ng/nigeria-immigration-service-announces-upward-review-of-nigerian-standard-passport-fees/',
      'https://immigration.gov.ng/wp-content/uploads/2026/04/SERVICE-LEVEL-AGREEMENT-2026_.pdf',
    ],
    document: null,
    searchQueries: [],
    answers: [
      {
        question: 'Are you applying domestically or through an overseas mission?',
        answer: 'Domestically, from within Nigeria; no embassy or consulate is involved.',
      },
    ],
    ...overrides,
  };
}

export const nigeriaRegressionReceipt: RuntimeReceipt = {
  mode: 'live',
  provider: 'nebius',
  model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  responseId: 'fixture-nigeria-renewal-regression-not-a-live-call',
  latencyMs: 1,
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  retrieval: { tavilyCalls: 0, directFetches: 4, tavilyRequestIds: [] },
};

// The eight-step domestic renewal path, every citation a verbatim passage of
// an official source, plus the trap steps that must remain blocked.
export function makeNigeriaRegressionModelPlan(): ModelPlan {
  return {
    title: 'Domestic Nigerian passport renewal — eight-step regression plan',
    steps: [
      {
        id: 'portal-apply',
        title: 'Start a Renewal/Reissue application on the official portal',
        instruction:
          'From the application portal dashboard, start an "Apply for Renewal/Reissue" application on the official Nigerian Immigration Services portal. Do not create any separate account unless the portal instructs it.',
        completionCriteria: 'A Renewal/Reissue application is open on the official portal.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote: 'From the application portal dashboard, click on “Apply for Renewal/Reissue”',
          },
          { sourceId: 'S2', quote: 'Apply for Renewal/Re-issue' },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'nin-current-passport',
        title: 'Verify your NIN and supply current passport details',
        instruction:
          'Verify your NIN, entering your date of birth for the second-level checks, then provide your current passport details and review the data comparison against your NIN data.',
        completionCriteria: 'NIN verification passes and current passport details are captured.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote: 'Verify your NIN (enter your date of birth for second-level checks)',
          },
          {
            sourceId: 'S1',
            quote:
              'Provide your current passport details and review data comparison against your NIN data',
          },
        ],
        dueDate: null,
        dependsOn: ['portal-apply'],
      },
      {
        id: 'centre-booklet-photo',
        title: 'Choose centre and booklet, upload photo and confirm personal details',
        instruction:
          'Select your processing centre and booklet size (32 pages or 64 pages), upload your ICAO compliant picture, and review your personal details and valid email address.',
        completionCriteria:
          'Centre and booklet are selected, an ICAO picture is uploaded, and personal details are confirmed.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote: 'Select your processing center and booklet size (32 pages or 64 pages)',
          },
          { sourceId: 'S1', quote: 'Upload your ICAO compliant picture' },
          {
            sourceId: 'S1',
            quote:
              'Review your personal details (these are your NIMC record). Ensure you provide a valid email address for further communication',
          },
        ],
        dueDate: null,
        dependsOn: ['nin-current-passport'],
      },
      {
        id: 'renewal-supporting-docs',
        title: 'Upload the renewal/reissue supporting documents',
        instruction:
          'Upload the supporting documents required for a standard passport renewal/reissue: NIN slip, birth certificate or declaration of age, local government or indigene certificate, ICAO-compliant photograph, and the current passport for the reissue. The document set depends on this application type.',
        completionCriteria: 'Every renewal/reissue supporting document is uploaded.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S4',
            quote:
              'STANDARD PASSPORT (RENEWAL/REISSUE) requirements: NIN slip; Birth Certificate or Declaration of Age (from High Court); Local Government or Indigene Certificate; International Civil Aviation Organization (ICAO) compliant passport photograph; Current Passport (in case of reissue).',
          },
          {
            sourceId: 'S1',
            quote: 'Upload supporting documents (these are based on your application type)',
          },
        ],
        dueDate: null,
        dependsOn: ['centre-booklet-photo'],
      },
      {
        id: 'review-submit',
        title: 'Review and submit the application',
        instruction:
          'Review the complete application and submit it through the portal before moving on to payment and appointment booking.',
        completionCriteria: 'The application is reviewed and submitted.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Review and submit your application. Then proceed to make payment and book an appointment for biometric enrollment',
          },
        ],
        dueDate: null,
        dependsOn: ['renewal-supporting-docs'],
      },
      {
        id: 'payment-booking',
        title: 'Pay the N100,000 standard 32-page 5-year fee and book biometrics',
        instruction:
          'Pay the published domestic standard 32-page 5-year renewal service fee of N100,000 through the portal; the published price excludes bank charges, which are settled separately, then book the biometric enrollment appointment.',
        completionCriteria:
          'The N100,000 service fee is paid, bank charges remain a separate line, and a biometric appointment is booked.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S3',
            quote:
              'The review which only affect Passport Application fees made in Nigeria, now set a new fee thresholds for 32-page with 5-year validity at N100,000 and 64-page with 10-year validity at N200,000.',
          },
          { sourceId: 'S4', quote: 'All Prices are Exclusive of Bank Charges' },
          {
            sourceId: 'S1',
            quote:
              'Review and submit your application. Then proceed to make payment and book an appointment for biometric enrollment',
          },
        ],
        dueDate: null,
        dependsOn: ['review-submit'],
      },
      {
        id: 'attend-biometrics',
        title: 'Attend in-person biometric capture with booklet and slips',
        instruction:
          'On the scheduled appointment date, submit your payment and appointment slips in person at the passport office selected during the online application, and appear with your passport booklet for photograph and biometric data capturing.',
        completionCriteria:
          'In-person biometric capture is completed at the selected office with the booklet and slips.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S4',
            quote:
              'Submit your payment and appointment slips in person at the passport office you selected during the online application, on your scheduled appointment date.',
          },
          {
            sourceId: 'S4',
            quote:
              'Note: Applicants are required to appear with their passport booklet at chosen immigration office for photograph and biometric data capturing.',
          },
          {
            sourceId: 'S1',
            quote:
              'Note: Applicants are required to appear at chosen Immigration office for biometric data capture.',
          },
        ],
        dueDate: null,
        dependsOn: ['payment-booking'],
      },
      {
        id: 'track-and-timeline',
        title: 'Track the application against the published service timeline',
        instruction:
          'Use the portal Application Status/Print Receipt service to track the application. Treat 21 days after successful enrolment as the published re-issue service timeline, a service standard rather than a guaranteed delivery date.',
        completionCriteria:
          'The application is trackable on the portal and expectations are set to the published 21-day service timeline without treating it as a guarantee.',
        claimedStatus: 'supported',
        evidence: [
          { sourceId: 'S2', quote: 'Application Status/Print Receipt' },
          { sourceId: 'S4', quote: 'Re-issue: 21 days after Successful Enrolment' },
        ],
        dueDate: null,
        dependsOn: ['attend-biometrics'],
      },
      {
        id: 'account-creation-trap',
        title: 'Trap: create and verify a separate portal account before applying',
        instruction:
          'Register a new portal account, verify the email address, and wait for account approval before starting the renewal application.',
        completionCriteria: 'This unevidenced account-creation requirement must be blocked.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'First create a separate user account and wait for manual approval before any renewal application can begin.',
          },
          {
            sourceId: 'S99',
            quote: 'Account registration and manual approval is mandatory before passport renewal.',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'courier-collection-trap',
        title: 'Trap: passports are couriered to applicants by post',
        instruction:
          'After processing, the renewed passport is couriered to your home address by post and no office visit is needed for collection.',
        completionCriteria: 'This unevidenced courier/collection claim must be blocked.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Renewed passports are couriered to applicants by post after processing without an office visit.',
          },
        ],
        dueDate: null,
        dependsOn: ['attend-biometrics'],
      },
      {
        id: 'bank-charges-included-trap',
        title: 'Trap: the N100,000 fee includes bank charges',
        instruction:
          'Pay NGN 100,000 including bank charges for the domestic 32-page 5-year renewal, with nothing further to settle.',
        completionCriteria: 'The included-charges claim must be contradicted, not supported.',
        claimedStatus: 'supported',
        evidence: [{ sourceId: 'S4', quote: 'All Prices are Exclusive of Bank Charges' }],
        dueDate: null,
        dependsOn: ['payment-booking'],
      },
      {
        id: 'foreign-cad-fee-trap',
        title: 'Trap: pay the Ottawa CAD 220 consular fee domestically',
        instruction:
          'Pay CAD 220 as the renewal fee for the domestic 32-page 5-year booklet through the domestic portal.',
        completionCriteria:
          'The foreign-mission currency claim must not be supported domestically.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S5',
            quote:
              'The consular administrative fee for a 32-page 5-year passport renewal is CAD 220, payable to the High Commission in Ottawa.',
          },
        ],
        dueDate: null,
        dependsOn: ['payment-booking'],
      },
      {
        id: 'unconfirmed-conflict',
        title: 'Trap: model-asserted conflict without two validated sources',
        instruction: 'Treat the booklet choice as internally conflicting pending further review.',
        completionCriteria:
          'A claimed conflict without two validated source passages must reset to unable to verify.',
        claimedStatus: 'conflicting',
        evidence: [
          {
            sourceId: 'S1',
            quote: 'Select your processing center and booklet size (32 pages or 64 pages)',
          },
        ],
        dueDate: null,
        dependsOn: ['centre-booklet-photo'],
      },
    ],
    conflicts: [],
    unresolvedQuestions: [
      {
        id: 'ottawa-mission-question',
        question:
          'Which consular section at the Nigeria High Commission in Ottawa should diaspora applicants book through when renewing from abroad?',
        reason:
          'A retrieved foreign-mission page described an Ottawa consular route, but this is a domestic application.',
      },
      {
        id: 'bank-charge-amount',
        question:
          'What exact naira amount will the payment provider charge as bank charges on top of the N100,000 service fee?',
        reason:
          'The official sources state prices exclude bank charges, but none publishes the current provider charge amount for a domestic renewal.',
      },
      {
        id: 'centre-availability',
        question:
          'Which biometric appointment dates are currently available at the chosen processing centre?',
        reason:
          'The portal exposes a centre-availability check, but no retrieved source contains live appointment dates.',
      },
    ],
  };
}
