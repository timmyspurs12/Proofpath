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
  'currency-mismatch' | 'ungrounded-currency' | 'negated-requirement' | 'conditional-route';

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
    const termIndex = tokens.findIndex((token) => token === term);
    if (termIndex < 0) continue;
    const cued = cueIndexes.some(
      (cueIndex) => cueIndex < termIndex && termIndex - cueIndex <= NEGATION_WINDOW,
    );
    if (cued && !hit.includes(term)) hit.push(term);
  }
  return hit;
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
      /\b(?:paper form|paper application|paper route|by post|postal|by mail|check and send)\b/i,
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

export interface InstructionContradictionInput {
  instruction: string;
  sources: RetrievedSource[];
  citedSourceIds: string[];
  route: RouteContext;
}

export function findInstructionContradictions(
  input: InstructionContradictionInput,
): ClaimContradiction[] {
  const contradictions: ClaimContradiction[] = [];
  const push = (kind: ClaimContradictionKind, detail: string, sourceIds: string[]) => {
    const uniqueIds = [...new Set(sourceIds)];
    if (!contradictions.some((entry) => entry.kind === kind && entry.detail === detail)) {
      contradictions.push({ kind, detail, sourceIds: uniqueIds });
    }
  };

  // 1. Currency claims must match an amount that actually appears in evidence.
  const claims = extractCurrencyClaims(input.instruction);
  if (claims.length) {
    const sourceAmounts = new Map<
      CurrencyCode,
      { amount: number; surface: string; sourceId: string; official: boolean }[]
    >();
    for (const source of input.sources) {
      for (const claim of extractCurrencyClaims(source.text)) {
        const list = sourceAmounts.get(claim.currency) ?? [];
        list.push({
          amount: claim.amount,
          surface: claim.surface,
          sourceId: source.source.id,
          official: source.source.authority === 'official',
        });
        sourceAmounts.set(claim.currency, list);
      }
    }
    for (const claim of claims) {
      const observed = sourceAmounts.get(claim.currency) ?? [];
      if (!observed.length) {
        push(
          'ungrounded-currency',
          `Support withdrawn: the ${claim.surface} amount in the instruction appears in no retrieved source.`,
          input.citedSourceIds,
        );
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
    const MONEY_CLAUSE = /\b(?:fee|fees|charge|charges|payment|cost|price|refund|tariff|duty)\b/i;
    const instructionMentionsMoney = MONEY_CLAUSE.test(input.instruction) || claims.length > 0;
    const requestedRouteKeys = new Set(
      ROUTE_MARKER_GROUPS.map((group) => group.key).filter((key) => input.route[key]),
    );
    for (const source of input.sources) {
      for (const sentence of splitSentences(source.text)) {
        const sentenceRoutes = routesMentionedInSentence(sentence);
        if (
          requestedRouteKeys.size &&
          sentenceRoutes.size &&
          [...sentenceRoutes].every((key) => !requestedRouteKeys.has(key))
        ) {
          continue;
        }
        if (ABROAD_MARKERS.test(sentence) !== input.route.abroad && sentenceRoutes.size) {
          continue;
        }
        const clauses = sentence
          .split(/[;:,](?=\s)/)
          .map((clause) => clause.trim())
          .filter((clause) => clause.length >= 5);
        for (const clause of clauses) {
          if (!negatedTermsInSentence(clause, terms).length) continue;
          // A clause negating a fee cannot contradict an instruction that
          // makes no monetary claim at all.
          if (MONEY_CLAUSE.test(clause) && !instructionMentionsMoney) continue;
          push(
            'negated-requirement',
            `Support withdrawn: a retrieved source negates a requirement stated in this step: “${clipSentence(clause)}”.`,
            [source.source.id],
          );
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
      for (const source of input.sources) {
        for (const sentence of splitSentences(source.text)) {
          if (!CONDITION_LEAD.test(sentence) || !sentenceMentionsTerm(sentence, terms)) continue;
          const sentenceRoutes = routesMentionedInSentence(sentence);
          if (
            sentenceRoutes.size &&
            [...sentenceRoutes].every((key) => !requestedRoutes.has(key))
          ) {
            push(
              'conditional-route',
              'Support withdrawn: a retrieved source makes this requirement conditional on a different application route than the one requested.',
              [source.source.id],
            );
          }
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
