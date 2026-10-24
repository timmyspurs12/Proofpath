// Generic, deterministic checks that a model step's instruction is actually
// grounded in its retrieved evidence. These checks know nothing about any
// specific domain (passports, visas, permits, ...): they operate on currency
// tokens, clausal negation, and generic application-route vocabulary. They only
// ever reject a claim the model labelled "supported"; they never upgrade one.
// A rejected claim still passes through the caller's full schema validation.
import type { PlanRequest } from '../../src/shared/schemas';
import type { RetrievedSource } from './retrieval';

export type CurrencyCode = 'GBP' | 'USD' | 'EUR';

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
}

const CURRENCY_SYMBOLS: Record<string, CurrencyCode> = {
  '£': 'GBP',
  $: 'USD',
  '€': 'EUR',
};

const NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?`;
const SYMBOL_AMOUNT = new RegExp(String.raw`([£$€])\s?(${NUMBER})`, 'g');
const CODE_BEFORE = new RegExp(String.raw`\b(GBP|USD|EUR)\s?(${NUMBER})\b`, 'g');
const CODE_AFTER = new RegExp(String.raw`(${NUMBER})\s?(GBP|USD|EUR)\b`, 'g');

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
  for (const match of text.matchAll(SYMBOL_AMOUNT)) {
    record(CURRENCY_SYMBOLS[match[1]], match[2], match[0].replace(/\s+/g, ''));
  }
  for (const match of text.matchAll(CODE_BEFORE)) {
    record(match[1] as CurrencyCode, match[2], match[0]);
  }
  for (const match of text.matchAll(CODE_AFTER)) {
    record(match[2] as CurrencyCode, match[1], match[0]);
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

const PAPER_ROUTE_MARKERS =
  /\b(?:paper form|paper application|paper route|by post|postal|in person|check and send|counter)\b/i;
const ONLINE_ROUTE_MARKERS = /\b(?:online|digitally|digital)\b/i;
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
  return {
    online: /\bonline\b|\bdigital(?:ly)?\b/.test(text),
    paper: /\bpaper\b|\bpostal\b|\bby post\b|\bin person\b/.test(text),
  };
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
  const terms = instructionTerms(input.instruction);
  if (terms.length) {
    for (const source of input.sources) {
      for (const sentence of splitSentences(source.text)) {
        const negated = negatedTermsInSentence(sentence, terms);
        if (negated.length) {
          push(
            'negated-requirement',
            `Support withdrawn: a retrieved source negates a requirement stated in this step: “${clipSentence(sentence)}”.`,
            [source.source.id],
          );
        }
      }
    }

    // 3. Requirement tied to a different application route than the requested one.
    if (input.route.online !== input.route.paper) {
      const oppositeMarker = input.route.online ? PAPER_ROUTE_MARKERS : ONLINE_ROUTE_MARKERS;
      for (const source of input.sources) {
        for (const sentence of splitSentences(source.text)) {
          if (
            CONDITION_LEAD.test(sentence) &&
            oppositeMarker.test(sentence) &&
            sentenceMentionsTerm(sentence, terms)
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
