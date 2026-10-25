import type { TaskInput } from '../../src/shared/schemas';

// LIVE ACCEPTANCE CASE — Nigerian domestic adult passport renewal.
//
// This file defines the TARGET SCENARIO for `npm run verify:live`. It is the
// only place Nigeria-specific facts are allowed: the universal validation
// engine under server/lib never imports this module. The request carries no
// uploaded document and no frozen excerpts — evidence must be genuinely
// retrieved at run time from the official starting URLs below.

export const NIGERIA_CASE_ID = 'nigeria-domestic-adult-renewal';

// Official starting points, in the order the retrieval pipeline should try
// them. Every URL is an official NIS host; the same four URLs are frozen in
// the offline regression fixture tests/fixtures/nigeria-official-2026.ts.
export const NIGERIA_OFFICIAL_SOURCE_URLS = [
  'https://immigration.gov.ng/info-center/renewal-of-passport/',
  'https://passport.immigration.gov.ng/',
  'https://immigration.gov.ng/nigeria-immigration-service-announces-upward-review-of-nigerian-standard-passport-fees/',
  'https://immigration.gov.ng/wp-content/uploads/2026/04/SERVICE-LEVEL-AGREEMENT-2026_.pdf',
] as const;

export const NIGERIA_OFFICIAL_HOST_SUFFIXES = ['immigration.gov.ng', 'passport.immigration.gov.ng'];

// The previously observed production false-positive classes, expressed as
// case-level EXPECTED RELATIONSHIPS between a trap passage and a plan step.
// These rules live in the acceptance case, never in the universal engine:
//
// - passagePattern: which retrieved wording belongs to this trap class.
// - protectedStepPattern: steps whose substantive subject, route, applicant
//   circumstance or location this material does NOT govern. A contradiction
//   from matching material that downgrades one of these steps is a
//   false-positive recurrence and fails acceptance.
// - applicableStepPattern: steps for which a contradiction from matching
//   material is genuinely applicable (same subject, route, circumstance and
//   location). A legitimate prohibition must remain detectable, so these
//   contradictions are recorded as valid, never as false positives.
//
// Applicability is tested before protection so an instruction that truly
// asserts the prohibited route or amount (for example a step claiming an
// included bank charge or a fully online biometric completion) is still
// correctly downgraded.
export interface TrapClassDefinition {
  id: string;
  label: string;
  // Matched against the diagnostic sentence/clause, or — for currency
  // diagnostics that carry no sentence — the retrieved source text.
  passagePattern: RegExp;
  // Sentence-less currency-section diagnostics (for example an
  // ungrounded-currency record) cite a whole source, so matching them with
  // the broad passagePattern would fan one record out to every trap class
  // whose wording appears anywhere in that source. Only classes that supply
  // this narrower pattern can adopt a sentence-less diagnostic, and the
  // pattern must describe that class's currency-specific wording.
  currencyPassagePattern?: RegExp;
  // Steps this trap material must not be allowed to contradict.
  protectedStepPattern: RegExp;
  // Steps on which a contradiction from this material is a genuine,
  // same-subject/same-route prohibition.
  applicableStepPattern: RegExp;
}

export const NIGERIA_TRAP_CLASSES: TrapClassDefinition[] = [
  {
    id: 'printed-photo-vs-unrelated-steps',
    label: 'Printed-photo requirements versus portal, NIN, upload or payment steps',
    passagePattern: /photograph|photo/i,
    protectedStepPattern:
      /portal|nin|identity number|identity verification|upload|supporting documents?|picture|booklet|fee|payment|pay\b/i,
    applicableStepPattern: /photograph|photo/i,
  },
  {
    id: 'consular-internet-vs-domestic-online',
    label: 'Consular internet/printing limitations versus domestic online instructions',
    passagePattern: /internet|printing facilit/i,
    protectedStepPattern: /portal|online|domestic|nin|upload|submit|fee|payment/i,
    applicableStepPattern: /consular|embassy|consulate|internet|printing facilit/i,
  },
  {
    id: 'age-specific-vs-adult-applicant',
    label: 'Age/guardian-specific requirements versus an adult applicant NIN or biometric steps',
    passagePattern: /under\s+\d+|\bminor|guardian|age declaration/i,
    protectedStepPattern: /nin|identity|biometric|enrol|enroll|capture|portal|upload/i,
    applicableStepPattern: /under\s*\d+|minor|guardian|age declaration/i,
  },
  {
    id: 'foreign-consulate-cutoff-vs-domestic-submission',
    label: 'Foreign-consulate application cutoffs versus domestic submission',
    passagePattern: /cut\s?-?off|after the published|consulate|embassy|high commission/i,
    protectedStepPattern: /submit|submission|domestic|portal|online/i,
    applicableStepPattern: /embassy|consulate|consular|high commission/i,
  },
  {
    id: 'domestic-ngn-vs-diaspora-usd-fees',
    label: 'Domestic naira fees versus diaspora dollar fees',
    passagePattern: /diaspora|abroad|consular|consulate|embassy|high commission|\$|USD|fee/i,
    protectedStepPattern: /domestic|ngn|naira|service fee/,
    applicableStepPattern: /USD|\$|diaspora|abroad|consular|embassy|consulate/,
  },
  {
    id: 'bank-charges-excluded-vs-included',
    label: 'Bank charges excluded versus a claim that charges are included',
    passagePattern: /bank (?:charges?|fees?)/i,
    // The bare-N ungrounded-currency record carries no sentence; it is only
    // about the bank-charges wording, so only this class may adopt it.
    currencyPassagePattern: /bank (?:charges?|fees?)/i,
    protectedStepPattern: /exclud|separate|settled separately|before bank charges/,
    applicableStepPattern: /including bank charges|bank charges included|charges are included/,
  },
  {
    id: 'online-submission-vs-in-person-biometrics',
    label: 'Online submission versus mandatory in-person biometric attendance',
    passagePattern: /biometric|enrolment|enrollment|capture|in person/i,
    protectedStepPattern: /biometric|capture|enrol|enroll|appear in person|attend/i,
    applicableStepPattern:
      /fully online|entirely online|without visiting|without attending|no office visit|no biometric|without an office/,
  },
];

export function buildNigeriaTaskInput(): TaskInput {
  return {
    task: 'Renew an expired Nigerian adult passport domestically.',
    jurisdiction: 'Nigeria',
    category: 'Travel & identity documents',
    details:
      'Adult applicant applying inside Nigeria on the domestic route: complete the application online through the official portal, pay the official domestic service fee with any bank charges treated separately, and attend in-person biometric capture at the chosen immigration office.',
    sourceUrls: [...NIGERIA_OFFICIAL_SOURCE_URLS],
    // Explicitly null: no preloaded document or frozen excerpt may masquerade
    // as freshly retrieved evidence in the live acceptance run.
    document: null,
  };
}
