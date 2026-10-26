// Generic, deterministic checks that a model step's instruction is actually
// grounded in its retrieved evidence. These checks know nothing about any
// specific domain, country, or agency: they operate on currency tokens,
// clausal negation, and generic application-route vocabulary. They only ever
// reject a claim the model labelled "supported"; they never upgrade one. A
// rejected claim still passes through the caller's full schema validation.
import type { PlanRequest } from '../../src/shared/schemas';
import type { RetrievedSource } from './retrieval';

export type CurrencyCode = string;

export interface CurrencyClaim {
  currency: CurrencyCode;
  amount: number;
  surface: string;
}

export type ClaimContradictionKind =
  | 'currency-mismatch'
  | 'ungrounded-currency'
  | 'negated-requirement'
  | 'conditional-route'
  | 'fee-context-mismatch';

// Machine-readable reason codes. Decisive codes reuse the finding kinds;
// skipped-* codes explain why an evaluated passage could not downgrade a step.
export type ContradictionReasonCode =
  | ClaimContradictionKind
  | 'currency-claim-grounded'
  | 'skipped-scope-route'
  | 'skipped-scope-location'
  | 'skipped-applicant-circumstance'
  | 'skipped-no-negation-cue'
  | 'skipped-generic-term-only'
  | 'skipped-clause-subject-mismatch'
  | 'skipped-money-clause'
  | 'skipped-no-distinctive-term';

export interface ContradictionDiagnostic {
  instructionId: string | null;
  sourceId: string;
  sentence: string;
  clause: string | null;
  requestedRoute: RouteContext;
  sentenceRoutes: Array<Exclude<keyof RouteContext, 'abroad'>>;
  locationScope: 'domestic' | 'abroad' | 'unspecified';
  negationCues: string[];
  negatedTerms: string[];
  alignedTerms: string[];
  subjectActionAligned: boolean | null;
  routeAligned: boolean | null;
  circumstanceAligned: boolean | null;
  decision: 'contradiction' | 'not_contradiction';
  reasonCode: ContradictionReasonCode;
  findingKind: ClaimContradictionKind | null;
}

// Generic scope qualifiers attached to a published fee. Vocabulary describes
// transaction circumstances (where, which document, for how long, surcharges),
// never a specific country or agency.
export interface FeeQualifiers {
  location: 'domestic' | 'abroad' | null;
  bookletPages: number | null;
  validityYears: number | null;
  bankCharges: 'excluded' | 'included' | null;
}

const ABROAD_SCOPE =
  /\b(?:abroad|overseas|diaspora|consular|consulate|embassy|high commission|diplomatic mission)\b/i;
const DOMESTIC_SCOPE =
  /\b(?:domestic|in-country|within (?:the )?country|inside (?:the )?country|home country)\b/i;
const BOOKLET_SCOPE = /(\d{1,3})\s?-\s?page\b|\b(\d{1,3})\s?page booklet\b/i;
// Domain-neutral validity phrasing only: the universality guard forbids
// naming any document type in the core engine.
const VALIDITY_SCOPE = /(\d{1,2})\s?-\s?year\b|\b(\d{1,2})\s?years? validity\b/i;
const BANK_CHARGES = /bank (?:charges?|fees?)/i;

export function extractFeeQualifiers(text: string): FeeQualifiers {
  const location = ABROAD_SCOPE.test(text)
    ? 'abroad'
    : DOMESTIC_SCOPE.test(text)
      ? 'domestic'
      : null;
  const bookletMatch = text.match(BOOKLET_SCOPE);
  const bookletPages = bookletMatch ? Number(bookletMatch[1] ?? bookletMatch[2]) : null;
  const validityMatch = text.match(VALIDITY_SCOPE);
  const validityYears = validityMatch ? Number(validityMatch[1] ?? validityMatch[2]) : null;
  let bankCharges: FeeQualifiers['bankCharges'] = null;
  if (BANK_CHARGES.test(text)) {
    // Case-insensitive: covers both stems — "exclude/excludes/excluded/
    // excluding" and "exclusive of", the wording official fee schedules use.
    if (/\bexclu[sd]\w*/i.test(text)) bankCharges = 'excluded';
    else if (/\binclud\w+|plus|in addition to\b/i.test(text)) bankCharges = 'included';
  }
  return { location, bookletPages, validityYears, bankCharges };
}

function qualifierConflicts(claimed: FeeQualifiers, published: FeeQualifiers): string[] {
  const conflicts: string[] = [];
  if (claimed.location && published.location && claimed.location !== published.location) {
    conflicts.push(
      `the instruction is scoped to a ${claimed.location} application but the passage scopes this figure to an ${published.location} application`,
    );
  }
  if (
    claimed.bookletPages !== null &&
    published.bookletPages !== null &&
    claimed.bookletPages !== published.bookletPages
  ) {
    conflicts.push(
      `the instruction assumes a ${claimed.bookletPages}-page booklet but the passage attaches this figure to a ${published.bookletPages}-page booklet`,
    );
  }
  if (
    claimed.validityYears !== null &&
    published.validityYears !== null &&
    claimed.validityYears !== published.validityYears
  ) {
    conflicts.push(
      `the instruction assumes a ${claimed.validityYears}-year validity but the passage attaches this figure to a ${published.validityYears}-year validity`,
    );
  }
  if (claimed.bankCharges === 'included' && published.bankCharges === 'excluded') {
    conflicts.push(
      'the instruction treats bank charges as included while the passage states the fee excludes bank charges',
    );
  }
  return conflicts;
}

// Monetary head nouns. A question containing one of these is a fee question;
// the same vocabulary gates clause alignment elsewhere in this module.
const QUESTION_MONEY_TERMS = new Set([
  'fee',
  'fees',
  'charge',
  'charges',
  'payment',
  'cost',
  'price',
  'prices',
  'refund',
  'tariff',
  'duty',
]);

// Location/channel words decide applicability through the route and location
// gates, so they must not also act as distinctive subject terms when deciding
// whether a source sentence answers a fee question.
const QUESTION_SCOPE_TERMS = new Set([
  'domestic',
  'abroad',
  'overseas',
  'diaspora',
  'online',
  'digital',
  'digitally',
  'paper',
  'postal',
  'mail',
  'counter',
]);

// Decides whether an unresolved fee question is already answered by a
// retrieved source, using only generic monetary notation, fee qualifiers,
// route scope and vocabulary overlap. It never constructs an answer or reads
// model memory: a question is only resolved when an in-scope source sentence
// publishes a matching amount. The check is deliberately fail-closed:
// - non-monetary questions (timelines, availability, procedures) never qualify;
// - bank-charge questions never qualify, because "exclusive of bank charges"
//   wording states a pricing policy, not the provider's charge amount;
// - every distinctive, non-generic term of the question must occur in the
//   candidate sentence, so a question about a service variant the sources do
//   not mention stays unresolved;
// - opposite-location sentences are excluded for the requested route;
// - official sources are preferred whenever any official candidate matches.
export function currencyQuestionAnswered(
  question: { question: string; reason: string },
  sources: RetrievedSource[],
  route: RouteContext,
): boolean {
  const text = `${question.question} ${question.reason}`;
  if (!MONEY_CLAUSE_PATTERN.test(text)) return false;
  if (BANK_CHARGES.test(text)) return false;
  // A fee question scoped to the opposite application location cannot be
  // answered by this route's evidence, mirroring the out-of-route question
  // filter. Unspecified location stays eligible and is decided on scope.
  const questionLocation = locationScopeOf(text);
  if (questionLocation === 'abroad' && !route.abroad) return false;
  if (questionLocation === 'domestic' && route.abroad) return false;

  const questionCurrencies = new Set(extractCurrencyClaims(text).map((claim) => claim.currency));
  const questionQualifiers = extractFeeQualifiers(text);
  // Distinctive subject terms come from the question itself, never from its
  // reason text: the reason is meta-commentary about why the model asked and
  // routinely contains words ("plan", "selected", "needed") that no official
  // passage would echo. Scope, currency and qualifier context still use both
  // fields above.
  const requiredTerms = instructionTerms(question.question).filter(
    (term) =>
      !GENERIC_PROCESS_TERMS.has(term) &&
      !ROUTE_TERMS.has(term) &&
      !QUESTION_SCOPE_TERMS.has(term) &&
      !QUESTION_MONEY_TERMS.has(term),
  );

  const matches: Array<{ official: boolean }> = [];
  for (const source of sources) {
    for (const sentence of splitSentences(source.text)) {
      const sentenceClaims = extractCurrencyClaims(sentence);
      if (!sentenceClaims.length) continue;
      const locationScope = locationScopeOf(sentence);
      if (!route.abroad && locationScope === 'abroad') continue;
      if (route.abroad && locationScope === 'domestic') continue;
      if (
        questionCurrencies.size &&
        !sentenceClaims.some((claim) => questionCurrencies.has(claim.currency))
      ) {
        continue;
      }
      if (qualifierConflicts(questionQualifiers, extractFeeQualifiers(sentence)).length) continue;
      if (!requiredTerms.every((term) => termAppears(term, instructionTerms(sentence)))) continue;
      matches.push({ official: source.source.authority === 'official' });
    }
  }
  if (!matches.length) return false;
  // Mirror the step-level fee rule: when the retrieval set contains an
  // official source, only an official match can answer the question; a
  // secondary figure cannot override official guidance.
  const officialSourcePresent = sources.some((source) => source.source.authority === 'official');
  return officialSourcePresent ? matches.some((match) => match.official) : true;
}

export interface ClaimContradiction {
  kind: ClaimContradictionKind;
  detail: string;
  sourceIds: string[];
}

export interface RouteContext {
  online: boolean;
  paper: boolean;
  inPerson: boolean;
  consular: boolean;
  abroad: boolean;
}

// Common ISO 4217 codes for administrative fees worldwide. A currency registry
// is domain-neutral supporting data, not a country rule: any amount whose code
// is outside it is simply not treated as money rather than being guessed at.
const ISO_CURRENCIES = [
  'GBP',
  'USD',
  'EUR',
  'NGN',
  'CAD',
  'AUD',
  'JPY',
  'INR',
  'ZAR',
  'KES',
  'GHS',
  'BRL',
  'MXN',
  'CNY',
  'SGD',
  'AED',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'NZD',
  'HKD',
  'EGP',
  'PHP',
  'THB',
  'IDR',
  'MYR',
  'PLN',
  'TRY',
  'KRW',
  'RWF',
  'UGX',
  'TZS',
  'ZMW',
  'BWP',
  'NAD',
  'ETB',
  'MAD',
  'TND',
];
const CURRENCY_ALTERNATION = ISO_CURRENCIES.join('|');

const CURRENCY_SYMBOLS: Record<string, CurrencyCode> = {
  '£': 'GBP',
  $: 'USD',
  '€': 'EUR',
  '₦': 'NGN',
  '₹': 'INR',
  '¥': 'JPY',
  '₩': 'KRW',
};

// Typographic single-letter prefixes some official publishers use instead of
// the currency symbol or ISO code (e.g. "N100,000"). Like the symbol table
// above, this is domain-neutral monetary notation data, not a country rule:
// entries map writing conventions to ISO codes, and any letter absent from
// the table is simply not treated as money.
const CURRENCY_LETTER_PREFIXES: Record<string, CurrencyCode> = {
  N: 'NGN',
};
// Bare prefixes only match money-style grouped amounts on purpose: requiring
// thousands separators keeps identifiers and ordinary tokens such as "S1",
// "A1" or "N95" from being misread as fees.
const PREFIX_NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?`;
const LETTER_PREFIX_AMOUNT = new RegExp(String.raw`(?<![A-Za-z0-9])([A-Z])(${PREFIX_NUMBER})`, 'g');

const NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?`;
// The lookbehind stops the "$" inside "R$100" from being read as US dollars.
const SYMBOL_AMOUNT = new RegExp(String.raw`(?<![A-Za-z])([£$€₦₹¥₩])\s?(${NUMBER})`, 'g');
const BRL_AMOUNT = new RegExp(String.raw`R\$\s?(${NUMBER})`, 'g');
const CODE_BEFORE = new RegExp(String.raw`\b(${CURRENCY_ALTERNATION})\s?(${NUMBER})\b`, 'g');
const CODE_AFTER = new RegExp(String.raw`(${NUMBER})\s?(${CURRENCY_ALTERNATION})\b`, 'g');

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

export function extractCurrencyClaims(text: string): CurrencyClaim[] {
  const claims: CurrencyClaim[] = [];
  const seen = new Set<string>();
  const record = (currency: CurrencyCode, rawAmount: string, surface: string) => {
    const amount = roundAmount(Number(rawAmount.replace(/,/g, '')));
    if (!Number.isFinite(amount)) return;
    const key = `${currency}:${amount}`;
    if (seen.has(key)) return;
    seen.add(key);
    claims.push({ currency, amount, surface });
  };
  for (const match of text.matchAll(BRL_AMOUNT)) {
    record('BRL', match[1], match[0].replace(/\s+/g, ''));
  }
  for (const match of text.matchAll(SYMBOL_AMOUNT)) {
    record(CURRENCY_SYMBOLS[match[1]], match[2], match[0].replace(/\s+/g, ''));
  }
  for (const match of text.matchAll(LETTER_PREFIX_AMOUNT)) {
    const currency = CURRENCY_LETTER_PREFIXES[match[1]];
    if (currency) record(currency, match[2], match[0]);
  }
  for (const match of text.matchAll(CODE_BEFORE)) {
    record(match[1], match[2], match[0]);
  }
  for (const match of text.matchAll(CODE_AFTER)) {
    record(match[2], match[1], match[0]);
  }
  return claims;
}

const STOPWORDS = new Set([
  'that',
  'this',
  'with',
  'from',
  'your',
  'yours',
  'you',
  'for',
  'are',
  'and',
  'the',
  'has',
  'have',
  'will',
  'must',
  'should',
  'into',
  'they',
  'them',
  'then',
  'than',
  'when',
  'where',
  'which',
  'what',
  'who',
  'how',
  'why',
  'can',
  'may',
  'might',
  'their',
  'there',
  'here',
  'been',
  'being',
  'each',
  'any',
  'all',
  'but',
  'via',
  'per',
  'not',
  'cannot',
  "can't",
  'need',
  'needs',
  'before',
  'after',
  'until',
  'about',
  'over',
  'under',
  'same',
  'only',
]);

export function instructionTerms(text: string): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const word of text.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
    if (STOPWORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    terms.push(word);
  }
  return terms;
}

// Process-generic vocabulary that appears in nearly every administrative
// instruction regardless of its subject. Lexical overlap on these words alone
// (for example a source negating "the application" while an instruction talks
// about a different application stage) cannot establish that the same
// requirement is being contradicted. Domain-neutral by construction; the
// universality guard forbids naming any document type or country here.
const GENERIC_PROCESS_TERMS = new Set([
  'application',
  'applications',
  'applicant',
  'applicants',
  'apply',
  'applying',
  'renewal',
  'renew',
  'renewing',
  'process',
  'service',
  'services',
  'request',
  'requested',
  'requests',
  'requirement',
  'requirements',
  'required',
  'require',
  'requires',
  'complete',
  'completed',
  'completing',
  'completion',
  'information',
  'details',
  'guidance',
  'official',
  'current',
  'confirmation',
  'account',
  'access',
  'submit',
  'submission',
  'submitted',
  'submitting',
]);

// Single-token channel/route vocabulary mirrored from ROUTE_MARKER_GROUPS.
// A negated route word only contradicts an instruction when the clause has no
// different substantive subject of its own.
const ROUTE_TERMS = new Set([
  'online',
  'digital',
  'digitally',
  'post',
  'postal',
  'mail',
  'paper',
  'counter',
  'embassy',
  'consulate',
  'consular',
  'mission',
]);

// Returns the instruction terms actually negated by a clause, requiring
// subject/action alignment rather than mere lexical overlap:
// - a negated distinctive content term shared with the instruction aligns;
// - generic process vocabulary never aligns on its own;
// - a route word aligns only when the clause negates the channel itself
//   (its own content terms are all instruction terms), so a clause about
//   photographs or internet facilities cannot negate an unrelated step that
//   happens to mention the same channel.
// Comparison with simple English plural tolerance (form/forms, fee/fees);
// matching stays token-based and never crosses onto another word stem.
function termAppears(term: string, terms: string[]): boolean {
  if (terms.includes(term)) return true;
  const variants = new Set([term.replace(/s$/, ''), `${term}s`, `${term.replace(/s$/, '')}es`]);
  return terms.some((candidate) => variants.has(candidate));
}

interface ClauseAlignment {
  aligned: boolean;
  reasonCode: Extract<
    ContradictionReasonCode,
    | 'negated-requirement'
    | 'skipped-no-negation-cue'
    | 'skipped-generic-term-only'
    | 'skipped-clause-subject-mismatch'
  >;
  negatedTerms: string[];
  alignedTerms: string[];
}

function distinctiveClauseTerms(clause: string): string[] {
  return instructionTerms(clause).filter(
    (term) => !GENERIC_PROCESS_TERMS.has(term) && !ROUTE_TERMS.has(term),
  );
}

// Monetary head nouns used to recognise money clauses. Kept module-level so
// both the money-scope gate and the alignment helper share one vocabulary.
const MONEY_CLAUSE_PATTERN =
  /\b(?:fee|fees|charge|charges|payment|cost|price|refund|tariff|duty)\b/i;

// Auxiliary verbs that form an auxiliary negation with a following "not"
// ("the replacement record will not keep the same reference number"). There
// the pre-cue noun is the subject whose property is negated, so it must
// remain a subject blocker.
const AUXILIARY_VERBS = new Set([
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'am',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'shall',
  'should',
  'can',
  'could',
  'may',
  'might',
  'must',
  'need',
]);

// Distinctive clause vocabulary that pivots the negation onto a different
// subject than the instruction. Terms before a modal/imperative prohibition
// cue ("applicants from abroad cannot complete...", "Minors cannot attend...")
// name the entity or circumstance the rule applies to; the location and
// applicant-circumstance scope gates already evaluate them, so they cannot
// make the clause about another subject. An auxiliary negation
// ("your new credential will not keep the same number") instead negates a
// property of its pre-cue subject, which therefore stays a blocker. A
// non-shared distinctive term inside the negated predicate is always such a
// pivot: "do not book travel" cannot negate a biometric appointment even
// though both instructions use the verb "book".
function clauseSubjectBlockers(clause: string, terms: string[]): string[] {
  const tokens = clause.toLowerCase().match(/[a-z']+/g) ?? [];
  const firstCue = tokens.findIndex((token) => NEGATION_CUES.has(token));
  if (firstCue < 0) return [];
  const preceding = firstCue > 0 ? tokens[firstCue - 1] : null;
  const auxiliaryNegation =
    tokens[firstCue] === 'not' && preceding !== null && AUXILIARY_VERBS.has(preceding);
  const blockers: string[] = [];
  tokens.forEach((token, index) => {
    if (token.length < 4) return;
    if (
      STOPWORDS.has(token) ||
      GENERIC_PROCESS_TERMS.has(token) ||
      ROUTE_TERMS.has(token) ||
      NEGATION_CUES.has(token)
    ) {
      return;
    }
    if (termAppears(token, terms) || blockers.includes(token)) return;
    const beforeCue = index < firstCue;
    if (beforeCue) {
      if (!auxiliaryNegation) return;
      if (firstCue - index > NEGATION_WINDOW) return;
    } else if (index - firstCue > NEGATION_WINDOW) {
      return;
    }
    blockers.push(token);
  });
  return blockers;
}

// Decides whether a negated clause concerns the same subject/action as the
// instruction. Generic process vocabulary can never establish alignment on
// its own, and a single shared term is insufficient when the negated
// predicate pivots onto a different substantive subject (for example
// "do not book travel" cannot negate "book a biometric appointment"). A
// channel negation with no distinctive predicate pivot of its own
// ("applications cannot be completed by post") remains decisive against an
// instruction using that channel. When moneyClaim is set, a negated monetary
// head noun in the clause counts as a content hit: instructionTerms only keeps
// tokens of four or more letters, so the three-letter word "fee" would
// otherwise be invisible even though the instruction explicitly makes a fee
// claim.
function evaluateClauseAlignment(
  clause: string,
  terms: string[],
  moneyClaim: boolean,
): ClauseAlignment {
  const negatedTerms = negatedTermsInSentence(clause, terms);
  if (moneyClaim && MONEY_CLAUSE_PATTERN.test(clause) && negationCuesIn(clause).length) {
    const tokens = clause.toLowerCase().match(/[a-z']+/g) ?? [];
    const cueIndexes = tokens
      .map((token, index) => (NEGATION_CUES.has(token) ? index : -1))
      .filter((index) => index >= 0);
    tokens.forEach((token, index) => {
      if (!MONEY_CLAUSE_PATTERN.test(token) || negatedTerms.includes(token)) return;
      const cued = cueIndexes.some((cueIndex) => Math.abs(index - cueIndex) <= NEGATION_WINDOW);
      if (cued) negatedTerms.push(token);
    });
  }
  if (!negatedTerms.length) {
    return {
      aligned: false,
      // A cue with no aligned instruction term means the clause negates a
      // different subject; only a clause carrying no cue at all is a no-cue.
      reasonCode: negationCuesIn(clause).length
        ? 'skipped-clause-subject-mismatch'
        : 'skipped-no-negation-cue',
      negatedTerms: [],
      alignedTerms: [],
    };
  }
  const contentHits = negatedTerms.filter(
    (term) => !GENERIC_PROCESS_TERMS.has(term) && !ROUTE_TERMS.has(term),
  );
  const routeHits = negatedTerms.filter((term) => ROUTE_TERMS.has(term));
  if (contentHits.length >= 2) {
    return {
      aligned: true,
      reasonCode: 'negated-requirement',
      negatedTerms,
      alignedTerms: contentHits,
    };
  }
  if (contentHits.length === 1) {
    if (!clauseSubjectBlockers(clause, terms).length) {
      return {
        aligned: true,
        reasonCode: 'negated-requirement',
        negatedTerms,
        alignedTerms: contentHits,
      };
    }
    return {
      aligned: false,
      reasonCode: 'skipped-clause-subject-mismatch',
      negatedTerms,
      alignedTerms: contentHits,
    };
  }
  if (!routeHits.length) {
    return {
      aligned: false,
      reasonCode: 'skipped-generic-term-only',
      negatedTerms,
      alignedTerms: [],
    };
  }
  // Route-only overlap: a negated channel word only contradicts an
  // instruction when the clause has no different substantive subject of its
  // own ("applications cannot be completed by post"). Pre-cue subjects count
  // here, because no shared content term established that the clause concerns
  // this step's subject at all.
  if (distinctiveClauseTerms(clause).every((term) => termAppears(term, terms))) {
    return {
      aligned: true,
      reasonCode: 'negated-requirement',
      negatedTerms,
      alignedTerms: routeHits,
    };
  }
  return {
    aligned: false,
    reasonCode: 'skipped-clause-subject-mismatch',
    negatedTerms,
    alignedTerms: routeHits,
  };
}

function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8);
}

const NEGATION_CUES = new Set([
  'not',
  'no',
  'never',
  'without',
  'cannot',
  "can't",
  "don't",
  "doesn't",
  "didn't",
  "won't",
  "mustn't",
  "shouldn't",
  "needn't",
  'instead',
  'rather',
]);
const NEGATION_WINDOW = 8;

function negatedTermsInSentence(sentence: string, terms: string[]): string[] {
  const tokens = sentence.toLowerCase().match(/[a-z']+/g) ?? [];
  const cueIndexes = tokens
    .map((token, index) => (NEGATION_CUES.has(token) ? index : -1))
    .filter((index) => index >= 0);
  if (!cueIndexes.length) return [];
  const hit: string[] = [];
  for (const term of terms) {
    const positions = tokens
      .map((token, index) => (token === term ? index : -1))
      .filter((index) => index >= 0);
    if (!positions.length) continue;
    // Symmetric window over every occurrence: covers both imperative negation
    // ("do not post the form") and copular negation where the subject comes
    // first ("the fee is not required"). A repeated term counts if ANY of its
    // occurrences sits inside the window around a cue. The scope, circumstance
    // and alignment gates downstream decide whether the negated word actually
    // concerns the instruction.
    const cued = positions.some((position) =>
      cueIndexes.some((cueIndex) => Math.abs(position - cueIndex) <= NEGATION_WINDOW),
    );
    if (cued && !hit.includes(term)) hit.push(term);
  }
  return hit;
}

function negationCuesIn(text: string): string[] {
  const tokens = new Set(text.toLowerCase().match(/[a-z']+/g) ?? []);
  return [...NEGATION_CUES].filter((cue) => tokens.has(cue));
}

// Generic transaction-route vocabulary. Groups describe how a process is
// transacted for any jurisdiction; they deliberately contain no agency or
// country names.
const ROUTE_MARKER_GROUPS: Array<{
  key: Exclude<keyof RouteContext, 'abroad'>;
  pattern: RegExp;
}> = [
  { key: 'online', pattern: /\b(?:online|digitally|digital)\b/i },
  {
    key: 'paper',
    pattern:
      /\b(?:paper forms?|paper applications?|paper route|by post|postal|by mail|check and send)\b/i,
  },
  {
    key: 'inPerson',
    pattern: /\b(?:in person|in-person|walk-?in|counter|office visit)\b/i,
  },
  {
    key: 'consular',
    pattern: /\b(?:embassy|consulate|consular|high commission|diplomatic mission)\b/i,
  },
];
const ABROAD_MARKERS = /\b(?:abroad|overseas|from outside|living outside)\b/i;
const CONDITION_LEAD = /\b(?:if|when|where|unless)\b/i;

// Consular and out-of-jurisdiction contexts, including a bare mission mention
// and diaspora wording. Kept domain-neutral: no agency, city or country names.
const ABROAD_CONTEXT =
  /\b(?:abroad|overseas|diaspora|consular|consulate|embassy|high commission|diplomatic mission|mission|from outside|living outside)\b/i;

// Applicant-circumstance vocabulary inside a conditional clause. A requirement
// negated only for a different applicant category (a minor, a guardian-led
// application) cannot contradict an instruction whose applicant is outside
// that category.
const AGE_CIRCUMSTANCE =
  /\bunder\s+\d{1,3}\b|\baged?\s+\d{1,3}\b|\b\d{1,3}\s+years?\s+(?:old|and under|or under)\b|\bminor(?:s)?\b|\bjuvenile\b|\binfants?\b/i;
const DEPENDENT_CIRCUMSTANCE = /\bguardians?\b|\bparental\b|\bparents?\b|\bchild(?:ren)?\b/i;

type Circumstance = 'age' | 'dependent';

// Applicant-circumstance detection does not require an "if/when/unless" lead:
// official pages also phrase category rules as noun subjects ("Applicants
// under 16 do not...", "Minors cannot..."). The gate only skips a passage when
// the instruction's own applicant does not share the named circumstance.
function sentenceCircumstance(sentence: string): Circumstance | null {
  if (AGE_CIRCUMSTANCE.test(sentence)) return 'age';
  if (DEPENDENT_CIRCUMSTANCE.test(sentence)) return 'dependent';
  return null;
}

function instructionCoversCircumstance(instruction: string, circumstance: Circumstance): boolean {
  return circumstance === 'age'
    ? AGE_CIRCUMSTANCE.test(instruction)
    : DEPENDENT_CIRCUMSTANCE.test(instruction);
}

function locationScopeOf(sentence: string): 'domestic' | 'abroad' | 'unspecified' {
  if (ABROAD_CONTEXT.test(sentence)) return 'abroad';
  if (DOMESTIC_SCOPE.test(sentence)) return 'domestic';
  return 'unspecified';
}

// Sentence-level scope gate evaluated BEFORE clauses are split, so route and
// location context in one clause cannot be lost by punctuation in the next.
// A passage is out of scope when every transaction route it names differs
// from the requested routes, or when its location context (domestic versus
// abroad/consular) is the opposite of the request's. A passage naming no
// scope at all remains eligible and is decided by term alignment instead.
// Returns the skip reason code, or null when the sentence is in scope.
function sentenceScopeSkipReason(
  sentence: string,
  route: RouteContext,
  requestedRouteKeys: Set<string>,
): ContradictionReasonCode | null {
  // Location context wins: a consular/diaspora sentence can never negate a
  // domestic instruction (and vice versa), even when it also names a channel
  // that the request uses.
  if (!route.abroad && ABROAD_CONTEXT.test(sentence)) return 'skipped-scope-location';
  if (route.abroad && DOMESTIC_SCOPE.test(sentence)) return 'skipped-scope-location';
  const sentenceRoutes = routesMentionedInSentence(sentence);
  if (
    requestedRouteKeys.size &&
    sentenceRoutes.size &&
    [...sentenceRoutes].every((key) => !requestedRouteKeys.has(key))
  ) {
    return 'skipped-scope-route';
  }
  return null;
}

function sentenceMentionsTerm(sentence: string, terms: string[]) {
  const lower = sentence.toLowerCase();
  return terms.some((term) => new RegExp(`\\b${term}\\b`).test(lower));
}

function clipSentence(sentence: string, max = 160) {
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

export function routeContextFromInput(
  input: Pick<PlanRequest, 'task' | 'details' | 'goal'>,
): RouteContext {
  const text = `${input.task} ${input.details} ${input.goal}`.toLowerCase();
  const context: RouteContext = {
    online: false,
    paper: false,
    inPerson: false,
    consular: false,
    abroad: ABROAD_MARKERS.test(text),
  };
  for (const group of ROUTE_MARKER_GROUPS) {
    context[group.key] = group.pattern.test(text);
  }
  return context;
}

function routesMentionedInSentence(sentence: string) {
  return new Set(
    ROUTE_MARKER_GROUPS.filter((group) => group.pattern.test(sentence)).map((group) => group.key),
  );
}

// Single-token channel words, mirroring ROUTE_TERMS, so instructions whose
// wording inflects beyond the marker phrases ("Post paper forms") still
// declare the channel they actually use. Domain-neutral vocabulary only.
const TOKEN_ROUTE_KEYS: Record<string, Exclude<keyof RouteContext, 'abroad'>> = {
  online: 'online',
  digital: 'online',
  digitally: 'online',
  post: 'paper',
  postal: 'paper',
  mail: 'paper',
  paper: 'paper',
  counter: 'inPerson',
  embassy: 'consular',
  consulate: 'consular',
  consular: 'consular',
  mission: 'consular',
};

function routesInText(text: string): Set<Exclude<keyof RouteContext, 'abroad'>> {
  const found = routesMentionedInSentence(text);
  for (const token of text.toLowerCase().match(/[a-z']+/g) ?? []) {
    const key = TOKEN_ROUTE_KEYS[token];
    if (key) found.add(key);
  }
  return found;
}

export interface InstructionContradictionInput {
  instruction: string;
  sources: RetrievedSource[];
  citedSourceIds: string[];
  route: RouteContext;
  // Stable model step id carried onto each diagnostic record.
  instructionId?: string | null;
  // Optional sink. When omitted the detector runs exactly as before and no
  // diagnostic objects are allocated.
  diagnostics?: ContradictionDiagnostic[];
}

// Bounded opt-in audit trail across all steps of one validation call. The
// detector itself never allocates these records unless a sink is supplied.
const MAX_DIAGNOSTICS = 500;

export function findInstructionContradictions(
  input: InstructionContradictionInput,
): ClaimContradiction[] {
  const contradictions: ClaimContradiction[] = [];
  const diagnostics = input.diagnostics ?? null;
  const record = (
    partial: Omit<ContradictionDiagnostic, 'instructionId' | 'requestedRoute'>,
  ): void => {
    if (!diagnostics || diagnostics.length >= MAX_DIAGNOSTICS) return;
    diagnostics.push({
      instructionId: input.instructionId ?? null,
      requestedRoute: input.route,
      ...partial,
    });
  };
  const push = (kind: ClaimContradictionKind, detail: string, sourceIds: string[]) => {
    const uniqueIds = [...new Set(sourceIds)];
    if (!contradictions.some((entry) => entry.kind === kind && entry.detail === detail)) {
      contradictions.push({ kind, detail, sourceIds: uniqueIds });
    }
  };
  const recordCurrency = (
    decision: ContradictionDiagnostic['decision'],
    reasonCode: ContradictionReasonCode,
    findingKind: ClaimContradictionKind | null,
    entry: { sourceId: string; sentence: string } | null,
  ): void => {
    record({
      sourceId: entry?.sourceId ?? input.citedSourceIds[0] ?? 'unknown',
      sentence: entry?.sentence ?? '',
      clause: null,
      sentenceRoutes: [],
      locationScope: 'unspecified',
      negationCues: [],
      negatedTerms: [],
      alignedTerms: [],
      subjectActionAligned: null,
      routeAligned: null,
      circumstanceAligned: null,
      decision,
      reasonCode,
      findingKind,
    });
  };

  // 1. Currency claims must match an amount that actually appears in evidence.
  const claims = extractCurrencyClaims(input.instruction);
  if (claims.length) {
    interface ObservedAmount {
      amount: number;
      surface: string;
      sourceId: string;
      official: boolean;
      sentence: string;
      qualifiers: FeeQualifiers;
    }
    const sourceAmounts = new Map<CurrencyCode, ObservedAmount[]>();
    for (const source of input.sources) {
      for (const sentence of splitSentences(source.text)) {
        for (const claim of extractCurrencyClaims(sentence)) {
          const list = sourceAmounts.get(claim.currency) ?? [];
          list.push({
            amount: claim.amount,
            surface: claim.surface,
            sourceId: source.source.id,
            official: source.source.authority === 'official',
            sentence,
            qualifiers: extractFeeQualifiers(sentence),
          });
          sourceAmounts.set(claim.currency, list);
        }
      }
    }
    const claimedQualifiers = extractFeeQualifiers(input.instruction);
    for (const claim of claims) {
      const observed = sourceAmounts.get(claim.currency) ?? [];
      if (!observed.length) {
        push(
          'ungrounded-currency',
          `Support withdrawn: the ${claim.surface} amount in the instruction appears in no retrieved source.`,
          input.citedSourceIds,
        );
        recordCurrency('contradiction', 'ungrounded-currency', 'ungrounded-currency', null);
        continue;
      }
      // Official evidence is the reference whenever it names an amount: a
      // secondary publisher cannot ground a figure official guidance contradicts.
      const officialObserved = observed.filter((entry) => entry.official);
      const reference = officialObserved.length ? officialObserved : observed;
      const matching = reference.filter((entry) => entry.amount === claim.amount);
      if (!matching.length) {
        const surfaces = [...new Set(reference.map((entry) => entry.surface))].slice(0, 3);
        const detail = officialObserved.length
          ? `Support withdrawn: the instruction's ${claim.surface} claim is contradicted by official evidence (${surfaces.join(', ')} found instead).`
          : `Support withdrawn: the instruction's ${claim.surface} claim does not match any amount in retrieved evidence (${surfaces.join(', ')} found instead).`;
        push(
          'currency-mismatch',
          detail,
          reference.map((entry) => entry.sourceId),
        );
        recordCurrency(
          'contradiction',
          'currency-mismatch',
          'currency-mismatch',
          reference[0] ?? null,
        );
        continue;
      }
      // Same figure, wrong scope: an amount can be real yet inapplicable.
      // Reject only when every passage publishing that figure conflicts with
      // a qualifier the instruction itself states; one compatible passage is
      // enough to ground it.
      const incompatible = matching.filter(
        (entry) => qualifierConflicts(claimedQualifiers, entry.qualifiers).length > 0,
      );
      let contextMismatch = false;
      if (incompatible.length === matching.length) {
        contextMismatch = true;
        const reasons = [
          ...new Set(
            matching.flatMap((entry) => qualifierConflicts(claimedQualifiers, entry.qualifiers)),
          ),
        ];
        push(
          'fee-context-mismatch',
          `Support withdrawn: the ${claim.surface} figure appears in evidence but its scope does not match the instruction — ${reasons.join('; ')}.`,
          [...new Set(incompatible.map((entry) => entry.sourceId))],
        );
        recordCurrency(
          'contradiction',
          'fee-context-mismatch',
          'fee-context-mismatch',
          incompatible[0] ?? null,
        );
      }
      // A document-wide pricing condition governs every fee in that source
      // even when it is published in a separate sentence (for example "All
      // Prices are Exclusive of Bank Charges"). An instruction that folds
      // such charges into the fee conflicts with the policy itself, so a
      // compatible amount passage in another sentence cannot ground it.
      if (!contextMismatch && claimedQualifiers.bankCharges === 'included') {
        const officialPolicySources = input.sources.filter(
          (entry) => entry.source.authority === 'official',
        );
        const policyPool = officialPolicySources.length ? officialPolicySources : input.sources;
        const exclusiveSource = policyPool.find(
          (entry) => extractFeeQualifiers(entry.text).bankCharges === 'excluded',
        );
        if (exclusiveSource) {
          contextMismatch = true;
          push(
            'fee-context-mismatch',
            `Support withdrawn: the ${claim.surface} figure appears in evidence, but a retrieved source states all prices exclude bank charges while the instruction treats them as included.`,
            [exclusiveSource.source.id],
          );
          recordCurrency('contradiction', 'fee-context-mismatch', 'fee-context-mismatch', null);
        }
      }
      if (!contextMismatch) {
        recordCurrency('not_contradiction', 'currency-claim-grounded', null, matching[0] ?? null);
      }
    }
  }

  // 2. Explicit negation of an instruction requirement inside evidence.
  //    Negation is evaluated per clause so an affirmative remedy after a
  //    semicolon cannot contradict an unrelated instruction, and sentences
  //    describing a different application route or applicant location than
  //    the requested one are not treated as contradicting it.
  const terms = instructionTerms(input.instruction);
  if (terms.length) {
    const instructionMentionsMoney =
      MONEY_CLAUSE_PATTERN.test(input.instruction) || claims.length > 0;
    const requestedRouteKeys = new Set(
      ROUTE_MARKER_GROUPS.map((group) => group.key).filter((key) => input.route[key]),
    );
    for (const source of input.sources) {
      for (const sentence of splitSentences(source.text)) {
        const sentenceRoutes = [...routesMentionedInSentence(sentence)];
        const locationScope = locationScopeOf(sentence);
        // Scope first: a consular/diaspora passage or an incompatible route
        // cannot negate a domestic instruction (and vice versa), regardless of
        // which later clause carries the negation cue.
        const scopeReason = sentenceScopeSkipReason(sentence, input.route, requestedRouteKeys);
        if (scopeReason) {
          if (negationCuesIn(sentence).length) {
            record({
              sourceId: source.source.id,
              sentence,
              clause: null,
              sentenceRoutes,
              locationScope,
              negationCues: negationCuesIn(sentence),
              negatedTerms: [],
              alignedTerms: [],
              subjectActionAligned: null,
              routeAligned: false,
              circumstanceAligned: true,
              decision: 'not_contradiction',
              reasonCode: scopeReason,
              findingKind: null,
            });
          }
          continue;
        }
        // A negation scoped to a different applicant circumstance (for
        // example an age or guardian condition the instruction never
        // mentions) describes another application type, not this one.
        const circumstance = sentenceCircumstance(sentence);
        const circumstanceAligned =
          !circumstance || instructionCoversCircumstance(input.instruction, circumstance);
        if (circumstance && !circumstanceAligned) {
          record({
            sourceId: source.source.id,
            sentence,
            clause: null,
            sentenceRoutes,
            locationScope,
            negationCues: negationCuesIn(sentence),
            negatedTerms: [],
            alignedTerms: [],
            subjectActionAligned: null,
            routeAligned: true,
            circumstanceAligned: false,
            decision: 'not_contradiction',
            reasonCode: 'skipped-applicant-circumstance',
            findingKind: null,
          });
          continue;
        }
        // Only sentences carrying a negation cue can produce a negation
        // finding; evaluate each clause independently for the record.
        if (!negationCuesIn(sentence).length) continue;
        const clauses = sentence
          .split(/[;:,](?=\s)/)
          .map((clause) => clause.trim())
          .filter((clause) => clause.length >= 5);
        for (const clause of clauses) {
          const alignment = evaluateClauseAlignment(clause, terms, instructionMentionsMoney);
          // A clause negating a fee cannot contradict an instruction that
          // makes no monetary claim at all.
          if (MONEY_CLAUSE_PATTERN.test(clause) && !instructionMentionsMoney) {
            record({
              sourceId: source.source.id,
              sentence,
              clause,
              sentenceRoutes,
              locationScope,
              negationCues: negationCuesIn(clause),
              negatedTerms: alignment.negatedTerms,
              alignedTerms: alignment.alignedTerms,
              subjectActionAligned: false,
              routeAligned: true,
              circumstanceAligned: true,
              decision: 'not_contradiction',
              reasonCode: 'skipped-money-clause',
              findingKind: null,
            });
            continue;
          }
          if (!alignment.aligned) {
            record({
              sourceId: source.source.id,
              sentence,
              clause,
              sentenceRoutes,
              locationScope,
              negationCues: negationCuesIn(clause),
              negatedTerms: alignment.negatedTerms,
              alignedTerms: alignment.alignedTerms,
              subjectActionAligned: false,
              routeAligned: true,
              circumstanceAligned: true,
              decision: 'not_contradiction',
              reasonCode: alignment.reasonCode,
              findingKind: null,
            });
            continue;
          }
          // Channel-scoped prohibition: even when the subject aligns, the
          // clause can only contradict an instruction that asserts the same
          // channel ("cannot be completed online" cannot negate an in-person
          // instruction). Sentence-level scope cannot see this because one
          // sentence may name several channels. Token-level route resolution
          // keeps inflected instruction wording ("Post paper forms") in scope.
          const clauseRoutes = routesInText(clause);
          const instructionRoutes = routesInText(input.instruction);
          if (clauseRoutes.size && [...clauseRoutes].every((key) => !instructionRoutes.has(key))) {
            record({
              sourceId: source.source.id,
              sentence,
              clause,
              sentenceRoutes: [...clauseRoutes],
              locationScope,
              negationCues: negationCuesIn(clause),
              negatedTerms: alignment.negatedTerms,
              alignedTerms: alignment.alignedTerms,
              subjectActionAligned: true,
              routeAligned: false,
              circumstanceAligned: true,
              decision: 'not_contradiction',
              reasonCode: 'skipped-scope-route',
              findingKind: null,
            });
            continue;
          }
          push(
            'negated-requirement',
            `Support withdrawn: a retrieved source negates a requirement stated in this step: “${clipSentence(clause)}”.`,
            [source.source.id],
          );
          record({
            sourceId: source.source.id,
            sentence,
            clause,
            sentenceRoutes,
            locationScope,
            negationCues: negationCuesIn(clause),
            negatedTerms: alignment.negatedTerms,
            alignedTerms: alignment.alignedTerms,
            subjectActionAligned: true,
            routeAligned: true,
            circumstanceAligned: true,
            decision: 'contradiction',
            reasonCode: 'negated-requirement',
            findingKind: 'negated-requirement',
          });
        }
      }
    }

    // 3. Requirement tied to a different application route than the requested
    //    one. The sentence must name at least one transaction route, and every
    //    route it names must be absent from the routes the user requested.
    const requestedRoutes = new Set(
      ROUTE_MARKER_GROUPS.map((group) => group.key).filter((key) => input.route[key]),
    );
    if (requestedRoutes.size) {
      // Generic process words cannot establish that the conditional
      // requirement concerns this step's subject; require a distinctive term.
      const distinctiveTerms = terms.filter((term) => !GENERIC_PROCESS_TERMS.has(term));
      for (const source of input.sources) {
        for (const sentence of splitSentences(source.text)) {
          if (!CONDITION_LEAD.test(sentence)) continue;
          if (!sentenceMentionsTerm(sentence, distinctiveTerms)) {
            // Record generic-only overlap so the non-decision is inspectable.
            if (sentenceMentionsTerm(sentence, terms)) {
              record({
                sourceId: source.source.id,
                sentence,
                clause: null,
                sentenceRoutes: [...routesMentionedInSentence(sentence)],
                locationScope: locationScopeOf(sentence),
                negationCues: negationCuesIn(sentence),
                negatedTerms: [],
                alignedTerms: [],
                subjectActionAligned: false,
                routeAligned: true,
                circumstanceAligned: true,
                decision: 'not_contradiction',
                reasonCode: 'skipped-no-distinctive-term',
                findingKind: null,
              });
            }
            continue;
          }
          // A location mismatch (consular/diaspora sentence for a domestic
          // request) is never a conditional-route contradiction; a different
          // transaction route, however, is exactly what this finding reports.
          const locationMismatch =
            (!input.route.abroad && ABROAD_CONTEXT.test(sentence)) ||
            (input.route.abroad && DOMESTIC_SCOPE.test(sentence));
          if (locationMismatch) {
            record({
              sourceId: source.source.id,
              sentence,
              clause: null,
              sentenceRoutes: [...routesMentionedInSentence(sentence)],
              locationScope: locationScopeOf(sentence),
              negationCues: negationCuesIn(sentence),
              negatedTerms: [],
              alignedTerms: [],
              subjectActionAligned: true,
              routeAligned: false,
              circumstanceAligned: true,
              decision: 'not_contradiction',
              reasonCode: 'skipped-scope-location',
              findingKind: null,
            });
            continue;
          }
          const circumstance = sentenceCircumstance(sentence);
          if (circumstance && !instructionCoversCircumstance(input.instruction, circumstance)) {
            record({
              sourceId: source.source.id,
              sentence,
              clause: null,
              sentenceRoutes: [...routesMentionedInSentence(sentence)],
              locationScope: locationScopeOf(sentence),
              negationCues: negationCuesIn(sentence),
              negatedTerms: [],
              alignedTerms: [],
              subjectActionAligned: true,
              routeAligned: true,
              circumstanceAligned: false,
              decision: 'not_contradiction',
              reasonCode: 'skipped-applicant-circumstance',
              findingKind: null,
            });
            continue;
          }
          const routeMismatch =
            sentenceScopeSkipReason(sentence, input.route, requestedRoutes) ===
            'skipped-scope-route';
          // Same-route conditional: no contradiction, nothing to record.
          if (!routeMismatch) continue;
          push(
            'conditional-route',
            'Support withdrawn: a retrieved source makes this requirement conditional on a different application route than the one requested.',
            [source.source.id],
          );
          record({
            sourceId: source.source.id,
            sentence,
            clause: null,
            sentenceRoutes: [...routesMentionedInSentence(sentence)],
            locationScope: locationScopeOf(sentence),
            negationCues: negationCuesIn(sentence),
            negatedTerms: [],
            alignedTerms: distinctiveTerms.filter((term) =>
              new RegExp(`\\b${term}\\b`).test(sentence.toLowerCase()),
            ),
            subjectActionAligned: true,
            routeAligned: false,
            circumstanceAligned: true,
            decision: 'contradiction',
            reasonCode: 'conditional-route',
            findingKind: 'conditional-route',
          });
        }
      }
    }
  }

  return contradictions.slice(0, 4);
}

// Generic jurisdictional-applicability signal using only the user's own
// jurisdiction wording. There is no country table: significant tokens are
// words of at least four letters minus generic state-name vocabulary. When no
// testable token remains (a jurisdiction made only of generic state words)
// the check abstains rather than speculating. It informs a plan-level warning
// only; the evidence gate never downgrades a step on this heuristic alone.
const JURISDICTION_STOPWORDS = new Set([
  'united',
  'republic',
  'kingdom',
  'union',
  'states',
  'state',
  'country',
  'people',
  'democratic',
  'socialist',
  'federal',
  'federation',
  'emirate',
  'emirates',
  'arab',
  'islamic',
  'national',
  'territory',
  'region',
  'province',
]);

export function jurisdictionSignificantTokens(jurisdiction: string): string[] {
  const phrase = jurisdiction.trim().toLowerCase();
  if (phrase.length < 2) return [];
  const tokens = phrase.match(/[a-z]{4,}/g) ?? [];
  return [...new Set(tokens.filter((token) => !JURISDICTION_STOPWORDS.has(token)))];
}

export interface JurisdictionCoverage {
  mentioned: boolean;
  tokens: string[];
}

export function jurisdictionCoverage(
  jurisdiction: string,
  sources: RetrievedSource[],
): JurisdictionCoverage {
  const phrase = jurisdiction.trim().toLowerCase();
  const tokens = jurisdictionSignificantTokens(jurisdiction);
  if (!phrase || !tokens.length) return { mentioned: true, tokens };
  const haystacks = sources.map((entry) => entry.text.toLowerCase());
  const phraseMentioned = haystacks.some((text) => text.includes(phrase));
  const tokenMentioned = tokens.some((token) =>
    haystacks.some((text) => new RegExp(`\\b${token}\\b`).test(text)),
  );
  return { mentioned: phraseMentioned || tokenMentioned, tokens };
}
