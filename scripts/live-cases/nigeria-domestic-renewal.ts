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

// The previously observed production false-positive classes. Each entry is a
// best-effort, case-specific probe over the generic engine's diagnostic
// records: a trap is "exercised" only when a genuinely retrieved passage that
// the engine actually evaluated matches. Missing live passages are recorded
// as not exercised, never simulated.
export interface TrapClassDefinition {
  id: string;
  label: string;
  // Matched against the diagnostic sentence and, when present, clause text.
  passagePattern: RegExp;
}

export const NIGERIA_TRAP_CLASSES: TrapClassDefinition[] = [
  {
    id: 'printed-photo-vs-unrelated-steps',
    label: 'Printed-photo requirements versus portal, NIN, upload or payment steps',
    passagePattern: /photograph|photo/i,
  },
  {
    id: 'consular-internet-vs-domestic-online',
    label: 'Consular internet/printing limitations versus domestic online instructions',
    passagePattern: /internet|printing facilit/i,
  },
  {
    id: 'age-specific-vs-adult-applicant',
    label: 'Age/guardian-specific requirements versus an adult applicant',
    passagePattern: /under\s+\d+|\bminor|guardian|age declaration/i,
  },
  {
    id: 'foreign-consulate-cutoff-vs-domestic-submission',
    label: 'Foreign-consulate application cutoffs versus domestic submission',
    passagePattern: /cut\s?-?off|after the published|consulate|embassy|high commission/i,
  },
  {
    id: 'domestic-ngn-vs-diaspora-usd-fees',
    label: 'Domestic naira fees versus diaspora dollar fees',
    passagePattern: /diaspora|abroad|consular|embassy|\$|USD|fee/i,
  },
  {
    id: 'bank-charges-excluded-vs-included',
    label: 'Bank charges excluded versus a claim that charges are included',
    passagePattern: /bank (?:charges?|fees?)/i,
  },
  {
    id: 'online-submission-vs-in-person-biometrics',
    label: 'Online submission versus mandatory in-person biometric attendance',
    passagePattern: /biometric|enrolment|enrollment|capture|in person/i,
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
