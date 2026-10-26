import type { PlanRequest, RuntimeReceipt } from '../../src/shared/schemas';
import type { ModelPlan } from '../../server/lib/evidence';
import { makeNigeriaOfficialInput, makeNigeriaOfficialSources } from './nigeria-official-2026';
import type { RetrievedSource } from '../../server/lib/retrieval';

// Regression fixture modeled on the genuine live run whose receipt was
// chatcmpl-2aff50c9-9aa7-4db7-9f6b-311fe50e44fe (live Nebius inference
// succeeded in ~7.2s): eleven plan steps, nine validated as supported, seven
// model citations rejected by the evidence gate. The three evidence gaps that
// remained after that run are reproduced here deterministically:
//
//  1. A fee question stayed open even though the retrieved official passages
//     publish the domestic 32-page 5-year figure (N100,000), the bank-charge
//     exclusion and the diaspora-only USD scope.
//  2. The appointment-booking step was downgraded because every model quote
//     failed exact-passage validation: a regional spelling change
//     ("enrolment" vs the source's "enrollment"), a stitched/paraphrased
//     passage, and a source id that was never retrieved.
//  3. A collection/notification claim had no supporting passage, while the
//     21-day reissue timeline is a separately citable service standard.
//
// S1-S4 are the same frozen 2026-10-24 verbatim NIS excerpts reused from
// nigeria-official-2026 (no network calls). The receipt below is explicitly
// fixture data, not a live call; the universal engine contains no
// Nigeria-specific knowledge and every country fact lives in this file.

export function makeNigeriaLiveRegressionSources(): RetrievedSource[] {
  return makeNigeriaOfficialSources();
}

export function makeNigeriaLiveRegressionInput(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return makeNigeriaOfficialInput(overrides);
}

export const nigeriaLiveRegressionReceipt: RuntimeReceipt = {
  mode: 'live',
  provider: 'nebius',
  model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  responseId: 'fixture-nigeria-live-regression-2026-10-not-a-live-call',
  latencyMs: 7_200,
  usage: { inputTokens: 4_600, outputTokens: 2_100, totalTokens: 6_700 },
  retrieval: { tavilyCalls: 0, directFetches: 4, tavilyRequestIds: [] },
};

// Eleven model-claimed steps. Every accepted citation is a verbatim passage
// of S1-S4; the seven deliberately invalid ones mirror the observed live
// failure classes and must be rejected without loosening exact matching.
export function makeNigeriaLiveRegressionModelPlan(): ModelPlan {
  return {
    title: 'Domestic Nigerian passport renewal — live-run regression plan',
    steps: [
      {
        id: 'portal-start',
        title: 'Start a Renewal/Reissue application on the official portal',
        instruction:
          'From the application portal dashboard, start an Apply for Renewal/Reissue application on the official Nigerian Immigration Services portal.',
        completionCriteria: 'A renewal/reissue application is open on the official portal.',
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
        id: 'nin-passport-details',
        title: 'Verify your NIN and supply current passport details',
        instruction:
          'Verify your NIN with the date-of-birth second-level check, then provide current passport details and review the comparison against NIN data.',
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
        dependsOn: ['portal-start'],
      },
      {
        id: 'centre-booklet-photo',
        title: 'Choose processing centre and booklet, then upload the picture',
        instruction:
          'Select the processing centre and the 32-page 5-year booklet, and upload an ICAO compliant picture.',
        completionCriteria: 'Centre and booklet are selected and an ICAO picture is uploaded.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote: 'Select your processing center and booklet size (32 pages or 64 pages)',
          },
          { sourceId: 'S1', quote: 'Upload your ICAO compliant picture' },
        ],
        dueDate: null,
        dependsOn: ['nin-passport-details'],
      },
      {
        id: 'supporting-documents',
        title: 'Upload the renewal/reissue supporting documents',
        instruction:
          'Upload the supporting documents the standard renewal/reissue requires: NIN slip, birth certificate or declaration of age, local government or indigene certificate, ICAO photograph, and the current passport.',
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
          'Review the complete application and submit it through the portal before payment and appointment booking.',
        completionCriteria: 'The application is reviewed and submitted.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote:
              'Review and submit your application. Then proceed to make payment and book an appointment for biometric enrollment',
          },
          // Invalid citation 1/7: a confirmation procedure that appears in no
          // retrieved source. The valid sibling citation keeps the step
          // supported, and the rejected quote retains its provenance.
          {
            sourceId: 'S1',
            quote:
              'Submit the application and wait for an emailed confirmation of your appointment date.',
          },
        ],
        dueDate: null,
        dependsOn: ['supporting-documents'],
      },
      {
        id: 'pay-domestic-fee',
        title: 'Pay the N100,000 domestic service fee with bank charges excluded',
        instruction:
          'Pay the published domestic 32-page 5-year renewal service fee of N100,000 through the portal; the published price excludes bank charges, which are settled separately.',
        completionCriteria:
          'The N100,000 service fee is paid and bank charges remain a separate line item.',
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
        dependsOn: ['review-submit'],
      },
      {
        id: 'book-biometric-appointment',
        title: 'Book the biometric appointment after submission and payment',
        instruction:
          'After submission and payment, book the biometric enrollment appointment through the portal.',
        completionCriteria: 'A biometric appointment is booked through the portal.',
        claimedStatus: 'supported',
        evidence: [
          // Invalid citations 2-4/7. The official booking passages exist in
          // the packet (S1 step-5 quote and S4 RENEWAL/REISSUE sentence), but
          // none of these quotes reproduces one exactly:
          //  - regional spelling change ("enrolment" vs source "enrollment");
          //  - a stitched/paraphrased SLA sentence with clauses removed;
          //  - a source id (S8) that was never retrieved.
          {
            sourceId: 'S1',
            quote: 'Then proceed to make payment and book an appointment for biometric enrolment',
          },
          {
            sourceId: 'S4',
            quote:
              'Complete passport application online, make payment and book an appointment for biometric enrolment.',
          },
          {
            sourceId: 'S8',
            quote: 'Book your biometric appointment after successful payment.',
          },
        ],
        dueDate: null,
        dependsOn: ['pay-domestic-fee'],
      },
      {
        id: 'attend-biometric-capture',
        title: 'Attend in-person biometric capture with booklet and slips',
        instruction:
          'On the scheduled appointment date, submit the payment and appointment slips in person at the selected passport office and appear with the passport booklet for photograph and biometric data capturing.',
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
        dependsOn: ['book-biometric-appointment'],
      },
      {
        id: 'track-and-timeline',
        title: 'Track the application against the published service timeline',
        instruction:
          'Use the portal Application Status/Print Receipt service to track the application. Treat 21 days after successful enrolment as the published re-issue service timeline: a service standard, not a guaranteed delivery or collection date.',
        completionCriteria:
          'The application is trackable on the portal and expectations follow the published 21-day service timeline without treating it as a guarantee.',
        claimedStatus: 'supported',
        evidence: [
          { sourceId: 'S2', quote: 'Application Status/Print Receipt' },
          { sourceId: 'S4', quote: 'Re-issue: 21 days after Successful Enrolment' },
          // Invalid citation 5/7: the sources never tie the 21-day standard to
          // a "produced/ready for collection" status or a collection promise.
          {
            sourceId: 'S2',
            quote: 'Passports are marked produced and ready for collection after 21 days.',
          },
        ],
        dueDate: null,
        dependsOn: ['attend-biometric-capture'],
      },
      {
        id: 'passport-collection',
        title: 'Collect the renewed passport after readiness notification',
        instruction:
          'Wait for notification and collect the renewed passport by the method the service confirms at the chosen immigration office.',
        completionCriteria: 'The renewed passport is collected following an official notice.',
        claimedStatus: 'supported',
        evidence: [
          // Invalid citations 6-7/7: no retrieved source describes a
          // collection method or readiness notification mechanism, so neither
          // passage exists and the claim must stay unverifiable.
          {
            sourceId: 'S1',
            quote:
              'Collect your renewed passport in person at the immigration office when you receive a notification.',
          },
          {
            sourceId: 'S2',
            quote:
              'The portal sends a message when the passport is ready for courier delivery to your address.',
          },
        ],
        dueDate: null,
        dependsOn: ['attend-biometric-capture'],
      },
      {
        id: 'contact-next-of-kin',
        title: 'Provide contact address, next of kin and a valid email',
        instruction:
          'Provide the contact address and next of kin information and ensure a valid email address is on file for further communication.',
        completionCriteria: 'Contact details, next of kin and a valid email are recorded.',
        claimedStatus: 'supported',
        evidence: [
          {
            sourceId: 'S1',
            quote: 'Provide your contact address and next of kin information',
          },
          {
            sourceId: 'S1',
            quote:
              'Review your personal details (these are your NIMC record). Ensure you provide a valid email address for further communication',
          },
        ],
        dueDate: null,
        dependsOn: ['review-submit'],
      },
    ],
    conflicts: [],
    unresolvedQuestions: [
      // Answered by the retrieved official fee passages: the gate must remove
      // this rather than leave the domestic fee question open.
      {
        id: 'domestic-service-fee',
        question: 'What is the official service fee for the domestic 32-page 5-year renewal?',
        reason:
          'The plan needs the exact published service fee for the selected booklet and validity.',
      },
      // Genuinely open: no source publishes the provider's bank-charge amount.
      {
        id: 'bank-charge-amount',
        question:
          'What exact naira amount will the payment provider charge as bank charges on top of the N100,000 service fee?',
        reason:
          'All four official sources state prices exclude bank charges, but none publishes the current provider charge amount for a domestic renewal.',
      },
      // Genuinely open: live appointment dates are not in any frozen source.
      {
        id: 'centre-availability',
        question:
          'Which biometric appointment dates are currently available at the chosen processing centre?',
        reason:
          'The portal exposes a centre-availability check, but no retrieved source contains live appointment dates.',
      },
      // Genuinely open: collection/notification is described by no retrieved
      // official source, so the method must remain explicitly unresolved.
      {
        id: 'collection-notification',
        question:
          'How will the renewed passport be collected, and what notification mechanism tells the applicant it is ready?',
        reason:
          'No retrieved source describes a collection method or a readiness notification mechanism for a domestic renewal.',
      },
      // Out of route: a consular question cannot survive a domestic request.
      {
        id: 'overseas-mission-question',
        question:
          'Which consular section at an overseas mission should diaspora applicants book through when renewing from abroad?',
        reason:
          'A retrieved foreign-mission route exists, but this is a domestic application with no embassy or consulate involved.',
      },
    ],
  };
}
