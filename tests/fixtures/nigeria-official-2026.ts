import type { PlanRequest, RuntimeReceipt } from '../../src/shared/schemas';
import type { ModelPlan } from '../../server/lib/evidence';
import { makeSource } from '../fixtures';
import type { RetrievedSource } from '../../server/lib/retrieval';

// LIVE-SOURCE FIXTURE — Nigerian domestic passport renewal, frozen on
// 2026-10-24 from four freshly fetched official NIS sources. The passages
// below are verbatim excerpts of the pages named in each source URL; they are
// not synthetic paraphrases and no live call runs in the test suite. The live
// retrieval (HTTP fetch, not a model replay) is documented in
// docs/technical-report-contradiction-2026-10.md.
//
// Transcription note (limitation, not a correction): NIS writes naira amounts
// with a bare letter prefix ("N100,000"), which the generic currency
// extractor does not parse; the excerpts keep that spelling exactly. The
// dollar figures in the same SLA cells ("$150", "$230") are machine-parseable,
// which is what the fee-scope trap step relies on. Nothing in the engine knows
// these passages concern Nigeria: every country fact lives in this fixture.

const RENEWAL_PAGE_TEXT = `Renewal of Passport

From the application portal dashboard, click on “Apply for Renewal/Reissue”

Verify your NIN (enter your date of birth for second-level checks)

Provide your current passport details and review data comparison against your NIN data

Select your processing center and booklet size (32 pages or 64 pages)

Upload your ICAO compliant picture

Review your personal details (these are your NIMC record). Ensure you provide a valid email address for further communication

Provide your contact address and next of kin information

Upload supporting documents (these are based on your application type)

Review and submit your application. Then proceed to make payment and book an appointment for biometric enrollment

Note: Applicants are required to appear at chosen Immigration office for biometric data capture.`;

const PORTAL_TEXT = `Nigerian Immigration Services Passport Application Services

Apply for Renewal/Re-issue

Resume/Edit your Application

Application Status/Print Receipt

Book Appointment

Check Centre Availability

Test Photo Upload`;

const FEE_PRESS_RELEASE_TEXT = `NIGERIA IMMIGRATION SERVICE ANNOUNCES UPWARD REVIEW OF NIGERIAN STANDARD PASSPORT FEES.

In a bid to uphold the quality and integrity of the Nigerian Passport, the Nigeria Immigration Service hereby announces an upward review of Nigerian Stardard Passport fees, set to take effect on 1st September, 2025.

The review which only affect Passport Application fees made in Nigeria, now set a new fee thresholds for 32-page with 5-year validity at N100,000 and 64-page with 10-year validity at N200,000.

Meanwhile, Nigerian Passport Application fees made by Nigerians in diaspora remain unchanged at $150 for 32-page with 5-year validity and $230 for 64-page with 10-year validity.

The Service reiterates its commitment to balancing quality service delivery with the need to ensure Passport services are accessible to all Nigerians.`;

const SLA_2026_TEXT = `SERVICE LEVEL AGREEMENT NIGERIA IMMIGRATION SERVICE, REVISED EDITION, APRIL 2026.

STANDARD PASSPORT (RENEWAL/REISSUE) requirements: NIN slip; Birth Certificate or Declaration of Age (from High Court); Local Government or Indigene Certificate; International Civil Aviation Organization (ICAO) compliant passport photograph; Current Passport (in case of reissue).

Applicants are to visit www.passport.gov.ng to apply.

Re-issue: 21 days after Successful Enrolment

32 Pages 5- Years Validity is N100,000/$150

64 Pages 10-Year Validity is N200,000/$230

Correction of Data Administrative Charges is N30,000

All Prices are Exclusive of Bank Charges

RENEWAL/REISSUE APPLICATION: Complete passport application online, upload the required documents, passport datapage, make payment and book appointment.

Submit your payment and appointment slips in person at the passport office you selected during the online application, on your scheduled appointment date.

Nigerians in the Diaspora are to submit application at the nearest Nigeria Embassy/High Commission or Consulate.

Note: Applicants are required to appear with their passport booklet at chosen immigration office for photograph and biometric data capturing.

CONTACTLESS BIOMETRIC (AVAILABLE FOR NIGERIANS IN DIASPORA ONLY): 32 Pages 5 Years Validity $130 Contactless Biometric Service $100; 64 Pages 10 Years Validity $230 Contactless Biometric Service $100. All Prices are Exclusive of Bank ChargeS.`;

export function makeNigeriaOfficialSources(): RetrievedSource[] {
  return [
    makeSource(
      'S1',
      RENEWAL_PAGE_TEXT,
      'https://immigration.gov.ng/info-center/renewal-of-passport/',
      {
        title: 'Renewal of Passport - Nigeria Immigration Service',
        publisher: 'Nigeria Immigration Service',
        authority: 'official',
        retrievedAt: '2026-10-24T00:00:00.000Z',
      },
    ),
    makeSource('S2', PORTAL_TEXT, 'https://passport.immigration.gov.ng/', {
      title: 'Nigerian Immigration Services | Passport',
      publisher: 'Nigeria Immigration Service',
      authority: 'official',
      retrievedAt: '2026-10-24T00:00:00.000Z',
    }),
    makeSource(
      'S3',
      FEE_PRESS_RELEASE_TEXT,
      'https://immigration.gov.ng/nigeria-immigration-service-announces-upward-review-of-nigerian-standard-passport-fees/',
      {
        title:
          'NIGERIA IMMIGRATION SERVICE ANNOUNCES UPWARD REVIEW OF NIGERIAN STANDARD PASSPORT FEES.',
        publisher: 'Nigeria Immigration Service',
        authority: 'official',
        retrievedAt: '2026-10-24T00:00:00.000Z',
      },
    ),
    makeSource(
      'S4',
      SLA_2026_TEXT,
      'https://immigration.gov.ng/wp-content/uploads/2026/04/SERVICE-LEVEL-AGREEMENT-2026_.pdf',
      {
        title: 'Service Level Agreement, Nigeria Immigration Service (Revised Edition, April 2026)',
        publisher: 'Nigeria Immigration Service',
        authority: 'official',
        retrievedAt: '2026-10-24T00:00:00.000Z',
      },
    ),
  ];
}

export function makeNigeriaOfficialInput(overrides: Partial<PlanRequest> = {}): PlanRequest {
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
    answers: [],
    ...overrides,
  };
}

export const nigeriaOfficialReceipt: RuntimeReceipt = {
  mode: 'live',
  provider: 'nebius',
  model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  responseId: 'fixture-nigeria-official-2026-not-a-live-call',
  latencyMs: 1,
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  retrieval: { tavilyCalls: 0, directFetches: 4, tavilyRequestIds: [] },
};

export function makeNigeriaOfficialModelPlan(): ModelPlan {
  return {
    title: 'Domestic Nigerian passport renewal (official 2026 sources)',
    steps: [
      {
        id: 'portal-nin',
        title: 'Start the renewal and verify your NIN',
        instruction:
          'Open the renewal/re-issue application on the official portal and verify your NIN, entering your date of birth for the second-level checks.',
        completionCriteria: 'The renewal application is started and the NIN is verified.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote: 'From the application portal dashboard, click on “Apply for Renewal/Reissue”',
          },
          {
            sourceId: 'S1',
            quote: 'Verify your NIN (enter your date of birth for second-level checks)',
          },
        ],
        dueDate: null,
        dependsOn: [],
      },
      {
        id: 'booklet-32',
        title: 'Choose the 32-page 5-year booklet',
        instruction:
          'Select the processing center and choose the 32-page, 5-year validity booklet for the domestic renewal.',
        completionCriteria: 'A processing centre and the 32-page 5-year booklet are selected.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote: 'Select your processing center and booklet size (32 pages or 64 pages)',
          },
          {
            sourceId: 'S4',
            quote: '32 Pages 5- Years Validity is N100,000/$150',
          },
        ],
        dueDate: null,
        dependsOn: ['portal-nin'],
      },
      {
        id: 'photo',
        title: 'Upload an ICAO-compliant picture',
        instruction:
          'Upload an ICAO compliant picture, using the portal photo compliance check first if needed.',
        completionCriteria: 'An ICAO-compliant picture is uploaded and accepted.',
        claimedStatus: 'supported',
        evidence: [
          { sourceId: 'S1', quote: 'Upload your ICAO compliant picture' },
          { sourceId: 'S2', quote: 'Test Photo Upload' },
        ],
        dueDate: null,
        dependsOn: ['portal-nin'],
      },
      {
        id: 'fee-32',
        title: 'Pay the official domestic service fee excluding bank charges',
        instruction:
          'Pay the published domestic 32-page 5-year renewal service fee of N100,000 through the portal; the published price excludes bank charges, which are settled separately.',
        completionCriteria:
          'The official service fee is paid and the separate bank-charge line item is identifiable.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S3',
            quote:
              'The review which only affect Passport Application fees made in Nigeria, now set a new fee thresholds for 32-page with 5-year validity at N100,000 and 64-page with 10-year validity at N200,000.',
          },
          { sourceId: 'S4', quote: 'All Prices are Exclusive of Bank Charges' },
        ],
        dueDate: null,
        dependsOn: ['booklet-32'],
      },
      {
        id: 'fee-64',
        title: 'Alternative: the 64-page 10-year booklet fee',
        instruction:
          'If choosing the 64-page 10-year booklet instead, pay its published domestic service fee of N200,000 through the portal.',
        completionCriteria:
          'The correct 64-page 10-year service fee is paid when that booklet is chosen.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S4',
            quote: '64 Pages 10-Year Validity is N200,000/$230',
          },
        ],
        dueDate: null,
        dependsOn: ['booklet-32'],
      },
      {
        id: 'submit-biometrics',
        title: 'Submit online, book and attend in-person biometric capture',
        instruction:
          'Review and submit the online application, make payment, book the biometric enrollment appointment, and appear in person at the chosen immigration office for biometric data capture with the passport booklet and slips.',
        completionCriteria:
          'The application is submitted online and in-person biometric capture is completed at the chosen office.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Review and submit your application. Then proceed to make payment and book an appointment for biometric enrollment',
          },
          {
            sourceId: 'S1',
            quote:
              'Note: Applicants are required to appear at chosen Immigration office for biometric data capture.',
          },
          {
            sourceId: 'S4',
            quote:
              'Note: Applicants are required to appear with their passport booklet at chosen immigration office for photograph and biometric data capturing.',
          },
        ],
        dueDate: null,
        dependsOn: ['fee-32'],
      },
      {
        id: 'usd-scope-trap',
        title: 'Trap: pay the diaspora dollar figure for a domestic 32-page renewal',
        instruction:
          'Pay USD 230 as the renewal fee for the domestic 32-page 5-year booklet while staying in Nigeria.',
        completionCriteria: 'This incorrect dollar payment must not be accepted as supported.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S4',
            quote: '64 Pages 10-Year Validity is N200,000/$230',
          },
        ],
        dueDate: null,
        dependsOn: ['fee-32'],
      },
      {
        id: 'bank-charges-trap',
        title: 'Trap: claim the service fee includes bank charges',
        instruction:
          'Pay NGN 100,000 including bank charges for the domestic 32-page 5-year renewal.',
        completionCriteria: 'This included-charges claim must not be accepted as supported.',
        claimedStatus: 'supported',
        evidence: [{ sourceId: 'S4', quote: 'All Prices are Exclusive of Bank Charges' }],
        dueDate: null,
        dependsOn: ['fee-32'],
      },
      {
        id: 'fabricated-no-visit-trap',
        title: 'Trap: complete the renewal without any office visit',
        instruction:
          'Complete the entire renewal online without visiting an immigration office or attending biometric capture.',
        completionCriteria: 'This unsupported no-visit claim must not be accepted.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Renewals can be completed entirely online with no immigration office visit or biometric appointment.',
          },
        ],
        dueDate: null,
        dependsOn: ['submit-biometrics'],
      },
    ],
    conflicts: [
      {
        topic: 'Domestic naira fees versus diaspora dollar fees',
        detail:
          'Official sources scope the N100,000/N200,000 figures to applications made in Nigeria and the $150/$230 figures to Nigerians in the diaspora; the scopes must not be merged.',
        stepIds: ['usd-scope-trap'],
        evidence: [
          {
            sourceId: 'S3',
            quote:
              'Meanwhile, Nigerian Passport Application fees made by Nigerians in diaspora remain unchanged at $150 for 32-page with 5-year validity and $230 for 64-page with 10-year validity.',
          },
        ],
      },
    ],
    unresolvedQuestions: [
      {
        id: 'bank-charge-amount',
        question:
          'What exact naira amount will the payment provider charge as bank charges on top of the N100,000 service fee?',
        reason:
          'All four official sources state prices exclude bank charges, but none publishes the current provider charge amount for a domestic renewal.',
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
