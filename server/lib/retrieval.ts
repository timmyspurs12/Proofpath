import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as cheerio from 'cheerio';
import type { DocumentInput } from '../../src/shared/schemas';
import type { Source, SourceCheck } from '../../src/shared/schemas';
import type { RouteContext } from './claim-checks';
import { AppError } from './errors';
import { logEvent } from './logger';
import { MAX_PDF_BYTES, extractPdfText } from './pdf';
import { scopeConflictsWithRoute, textLocationScope } from './route-scope';
import type { TavilyClient } from './tavily';

const MAX_SOURCE_CHARACTERS = 30_000;
const MAX_RESPONSE_BYTES = 750_000;
const MAX_SOURCES = 6;

export interface RetrievedSource {
  source: Source;
  text: string;
}

export function normalizeSourceText(value: string) {
  return value
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hashText(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}

export function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split('%')[0];
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) === 6) {
    if (normalized.includes('.')) {
      const ipv4 = normalized.split(':').pop() ?? '';
      if (isIP(ipv4) === 4) return isPrivateIpv4(ipv4);
    }
    if (normalized.startsWith('::ffff:')) {
      const groups = normalized.slice('::ffff:'.length).split(':');
      if (groups.length === 2 && groups.every((group) => /^[\da-f]{1,4}$/.test(group))) {
        const [high, low] = groups.map((group) => Number.parseInt(group, 16));
        return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
      }
    }
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8')
    );
  }
  return true;
}

async function assertPublicUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    ['localhost', 'localhost.localdomain'].includes(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new AppError(
      400,
      'UNSAFE_SOURCE_URL',
      'Source URLs must be public HTTP(S) addresses without credentials.',
      false,
    );
  }
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new AppError(
        400,
        'UNSAFE_SOURCE_URL',
        'Private or local network sources are not allowed.',
        false,
      );
    }
    return url;
  }
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
      throw new AppError(
        400,
        'UNSAFE_SOURCE_URL',
        'The source resolves to a private or local network address.',
        false,
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      422,
      'SOURCE_DNS_FAILED',
      'The source hostname could not be resolved.',
      false,
    );
  }
  return url;
}

async function readBoundedBody(response: Response, cap = MAX_RESPONSE_BYTES) {
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > cap) {
    throw new AppError(
      413,
      'SOURCE_TOO_LARGE',
      'A source page is too large to process safely.',
      false,
    );
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      throw new AppError(
        413,
        'SOURCE_TOO_LARGE',
        'A source page is too large to process safely.',
        false,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Generic registry-level labels used by governments worldwide. These are
// structural hostname patterns, not a country list: any jurisdiction whose
// official host uses one of these labels is recognized without a code change
// (gov.uk, gouv.fr, go.jp, gc.ca, govt.nz, europa.eu, ...). Hosts that match
// no pattern stay "secondary" and the pipeline warns when no official or
// user-supplied source is present, so an unconfigured jurisdiction degrades
// honestly instead of being mislabelled.
const OFFICIAL_HOST_PATTERNS = [
  /(^|\.)gov$/,
  /(^|\.)gov\.[a-z]{2,3}$/,
  /(^|\.)gouv\.[a-z]{2,3}$/,
  /(^|\.)go\.[a-z]{2,3}$/,
  /(^|\.)gc\.[a-z]{2,3}$/,
  /(^|\.)govt\.[a-z]{2,3}$/,
  /(^|\.)edu$/,
  /(^|\.)int$/,
  /(^|\.)europa\.eu$/,
];

export function authorityForHostname(hostname: string): Source['authority'] {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (OFFICIAL_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return 'official';
  }
  return 'secondary';
}

function isStale(publishedAt: string | null, now = Date.now()) {
  if (!publishedAt) return false;
  const timestamp = Date.parse(publishedAt);
  if (!Number.isFinite(timestamp)) return false;
  return now - timestamp > 548 * 24 * 60 * 60 * 1000;
}

// Elements that are chrome, navigation, or machine data rather than the
// page's substantive content. Removing them before text extraction keeps
// menu/cookie/script words out of the passages the model can later quote.
const HTML_DROP_SELECTOR =
  'script, style, noscript, svg, canvas, iframe, template, nav, header, footer, form, [aria-hidden="true"], [role="navigation"]';
const HTML_BLOCK_SELECTOR =
  'br, p, li, h1, h2, h3, h4, h5, h6, tr, td, th, section, article, div, main, aside, blockquote, dt, dd, figcaption, summary, address';

function extractHtml(raw: string, fallbackTitle: string, fallbackPublisher: string) {
  const $ = cheerio.load(raw);
  $(HTML_DROP_SELECTOR).remove();
  $(HTML_BLOCK_SELECTOR).each((_, element) => {
    $(element).append('\n');
  });
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    fallbackTitle;
  const publisher =
    $('meta[property="og:site_name"]').attr('content')?.trim() ||
    $('meta[name="publisher"]').attr('content')?.trim() ||
    fallbackPublisher;
  const publishedAt =
    $('meta[property="article:published_time"]').attr('content')?.trim() ||
    $('meta[name="date"]').attr('content')?.trim() ||
    $('meta[name="last-modified"]').attr('content')?.trim() ||
    $('time[datetime]').first().attr('datetime')?.trim() ||
    null;
  const main = $('main').first().length
    ? $('main').first()
    : $('[role="main"]').first().length
      ? $('[role="main"]').first()
      : $('article').first().length
        ? $('article').first()
        : $('body');
  return { text: main.text(), title, publisher, publishedAt };
}

function filenameFromUrl(url: URL) {
  const last = url.pathname.split('/').filter(Boolean).pop() ?? '';
  return decodeURIComponent(last.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ')).trim();
}

export async function fetchSource(
  value: string,
  id: string,
  retrieval: Source['retrieval'] = 'direct',
): Promise<RetrievedSource> {
  let url = await assertPublicUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    let response: Response | null = null;
    for (let redirect = 0; redirect < 4; redirect += 1) {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,text/plain,application/xhtml+xml,application/pdf',
          'User-Agent': 'ProofPath/1.0 (+source-verification)',
        },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location || redirect === 3) {
        throw new AppError(
          422,
          'SOURCE_REDIRECT_FAILED',
          'A source redirected too many times.',
          false,
        );
      }
      url = await assertPublicUrl(new URL(location, url).toString());
    }
    if (!response)
      throw new AppError(422, 'SOURCE_FETCH_FAILED', 'The source could not be retrieved.', true);
    if (!response.ok) {
      throw new AppError(
        422,
        'SOURCE_UNAVAILABLE',
        `The source returned HTTP ${response.status}.`,
        response.status >= 500,
      );
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const looksLikePdf =
      contentType.includes('pdf') || /\.pdf(?:$|[?#])/i.test(url.pathname + url.search);
    let title = url.hostname;
    let publisher = url.hostname.replace(/^www\./, '');
    let publishedAt: string | null = null;
    let text: string;

    if (looksLikePdf) {
      // Official announcements are frequently PDFs. Parse bounded bytes with
      // the fail-closed PDF module; on failure the caller records the limit and
      // backfills with another ranked candidate instead of inventing content.
      const bytes = await readBoundedBody(response, MAX_PDF_BYTES);
      const pdf = await extractPdfText(new Uint8Array(bytes));
      text = pdf.text;
      title = pdf.title || filenameFromUrl(url) || title;
    } else {
      if (!/text\/html|text\/plain|application\/xhtml\+xml/.test(contentType)) {
        throw new AppError(
          422,
          'SOURCE_UNSUPPORTED_TYPE',
          'Only public HTML, plain-text, and PDF sources are supported.',
          false,
        );
      }
      const raw = (await readBoundedBody(response)).toString('utf8');
      if (contentType.includes('html') || contentType.includes('xhtml')) {
        const parsed = extractHtml(raw, title, publisher);
        text = parsed.text;
        title = parsed.title;
        publisher = parsed.publisher;
        publishedAt = parsed.publishedAt;
      } else {
        text = raw;
      }
    }
    const normalized = normalizeSourceText(text);
    if (normalized.length < 40) {
      throw new AppError(
        422,
        'SOURCE_EMPTY',
        'The source did not contain enough readable text.',
        false,
      );
    }
    const boundedText = normalized.slice(0, MAX_SOURCE_CHARACTERS);
    const retrievedAt = new Date().toISOString();
    return {
      text: boundedText,
      source: {
        id,
        title: title.slice(0, 300),
        publisher: publisher.slice(0, 200),
        url: url.toString(),
        retrievedAt,
        publishedAt: publishedAt?.slice(0, 100) ?? null,
        authority: authorityForHostname(url.hostname),
        retrieval,
        contentHash: hashText(boundedText),
        excerpt: boundedText.slice(0, 2_800),
        stale: isStale(publishedAt),
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new AppError(
      timedOut ? 504 : 422,
      timedOut ? 'SOURCE_TIMEOUT' : 'SOURCE_FETCH_FAILED',
      timedOut
        ? 'The source did not respond before the timeout.'
        : 'The source could not be retrieved as readable text.',
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function makeUploadedSource(document: DocumentInput, id: string): RetrievedSource {
  const normalized = normalizeSourceText(document.text);
  const boundedText = normalized.slice(0, MAX_SOURCE_CHARACTERS);
  return {
    text: boundedText,
    source: {
      id,
      title: document.name,
      publisher: 'User-provided document',
      url: null,
      retrievedAt: new Date().toISOString(),
      publishedAt: null,
      authority: 'user',
      retrieval: 'upload',
      contentHash: hashText(boundedText),
      excerpt: boundedText.slice(0, 2_800),
      stale: false,
    },
  };
}

interface RetrieveOptions {
  directUrls: string[];
  searchQueries: string[];
  goal: string;
  jurisdiction: string;
  document: DocumentInput | null;
  tavily: TavilyClient;
  // Optional requested-route context used to keep discovered foreign-mission
  // material out of a domestic packet (and vice versa). Direct user-supplied
  // URLs are never scope-filtered: the explicit URL is itself the instruction.
  route?: Pick<RouteContext, 'abroad'>;
}

export interface RankedCandidate {
  url: string;
  title: string | null;
  discovery: 'direct' | 'tavily';
}

export interface RankingContext {
  goal: string;
  searchQueries: string[];
  jurisdiction: string;
}

const RANKING_STOPWORDS = new Set([
  'that',
  'this',
  'with',
  'from',
  'your',
  'yours',
  'need',
  'needs',
  'will',
  'must',
  'should',
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
  'about',
  'into',
  'have',
  'been',
  'being',
]);

function rankingTerms(context: RankingContext): string[] {
  const text = [context.goal, context.jurisdiction, ...context.searchQueries]
    .join(' ')
    .toLowerCase();
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const word of text.match(/[a-z]{4,}/g) ?? []) {
    if (RANKING_STOPWORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    terms.push(word);
  }
  return terms;
}

// Domain-agnostic ranking within the six-source cap: official-host authority
// is the primary tier, relevance to the goal/queries/jurisdiction is the
// secondary score, and user-supplied direct URLs win ties. No country table is
// involved; malformed URLs sink to the bottom instead of throwing. When route
// context is supplied, discovered (never direct) candidates whose URL or title
// advertise the opposite application location are sunk below in-scope
// secondary sources so a foreign-mission page cannot crowd out domestic ones.
export function rankCandidates(
  candidates: RankedCandidate[],
  context: RankingContext,
  route?: Pick<RouteContext, 'abroad'>,
): RankedCandidate[] {
  const unique = candidates.filter(
    (candidate, index) => candidates.findIndex((other) => other.url === candidate.url) === index,
  );
  const terms = rankingTerms(context);
  const scored = unique.map((candidate, index) => {
    let authorityTier = 1;
    let haystack = '';
    try {
      const parsed = new URL(candidate.url);
      authorityTier = authorityForHostname(parsed.hostname) === 'official' ? 0 : 1;
      haystack = `${parsed.hostname} ${parsed.pathname.replace(/[-_/]+/g, ' ')} ${
        candidate.title ?? ''
      }`.toLowerCase();
    } catch {
      authorityTier = 2;
      haystack = candidate.url.toLowerCase();
    }
    const relevance = terms.reduce(
      (score, term) => (haystack.includes(term) ? score + 1 : score),
      0,
    );
    const directBonus = candidate.discovery === 'direct' ? 1 : 0;
    // A route conflict only penalizes search-discovered candidates; an
    // explicit user URL is an instruction and keeps its normal ranking.
    const oppositeRoute =
      route && candidate.discovery === 'tavily'
        ? scopeConflictsWithRoute(textLocationScope(haystack), route)
        : false;
    const routePenalty = oppositeRoute ? 500 : 0;
    const score = relevance * 10 + directBonus - authorityTier * 1000 - routePenalty;
    return { candidate, index, score };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.candidate);
}

// Backwards-compatible URL-only ranking: authority tier first, stable
// discovery order within a tier.
export function rankCandidateUrls(urls: string[]): string[] {
  return rankCandidates(
    urls.map((url) => ({ url, title: null, discovery: 'tavily' as const })),
    { goal: '', searchQueries: [], jurisdiction: '' },
  ).map((candidate) => candidate.url);
}

export interface RetrievalLedger {
  discovered: number;
  fetched: number;
  parsed: number;
  selected: string[];
  excluded: Array<{ host: string; reason: string }>;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown source';
  }
}

export async function retrieveSources(options: RetrieveOptions) {
  const warnings: string[] = [];
  const sources: RetrievedSource[] = [];
  if (options.document) sources.push(makeUploadedSource(options.document, 'S1'));

  let tavilyCalls = 0;
  let tavilyRequestIds: string[] = [];
  const candidates: RankedCandidate[] = options.directUrls.map((url) => ({
    url,
    title: null,
    discovery: 'direct' as const,
  }));
  const seenUrls = new Set(options.directUrls);
  const hasCapacity = () => candidates.length + sources.length < MAX_SOURCES;
  if (options.tavily.configured && hasCapacity()) {
    // Intake may supply up to two targeted queries. Running each one gives
    // unresolved instructions (for example submission or tracking guidance)
    // a real retrieval attempt instead of silently using only the first query.
    const jurisdiction = options.jurisdiction.trim();
    const scoped = (query: string) =>
      jurisdiction ? `${query} ${jurisdiction} official` : `${query} official`;
    const queries = options.searchQueries.length
      ? options.searchQueries.slice(0, 2)
      : [
          jurisdiction
            ? `${options.goal} ${jurisdiction} official requirements`
            : `${options.goal} official requirements`,
        ];
    for (const query of queries) {
      if (!hasCapacity()) break;
      try {
        const discovery = await options.tavily.discover(scoped(query));
        tavilyCalls += 1;
        tavilyRequestIds.push(...discovery.requestIds);
        const results = discovery.results ?? discovery.urls.map((url) => ({ url, title: null }));
        for (const result of results) {
          if (seenUrls.has(result.url)) continue;
          seenUrls.add(result.url);
          candidates.push({
            url: result.url,
            title: result.title,
            discovery: 'tavily',
          });
        }
      } catch (error) {
        warnings.push(
          error instanceof AppError
            ? error.message
            : 'Tavily discovery failed; direct sources were used.',
        );
      }
    }
    tavilyRequestIds = tavilyRequestIds.slice(0, 2);
  }

  const ranked = rankCandidates(
    candidates,
    {
      goal: options.goal,
      searchQueries: options.searchQueries,
      jurisdiction: options.jurisdiction,
    },
    options.route,
  );
  const remaining = Math.max(0, MAX_SOURCES - sources.length);
  // The queue holds ranked candidates beyond the first batch so that a failed
  // fetch can be replaced by the next-ranked official or secondary source
  // instead of silently consuming part of the six-source budget.
  const queue = ranked.map((candidate) => ({ ...candidate }));
  const selected = queue.splice(0, remaining);
  const ledger: RetrievalLedger = {
    discovered: ranked.length,
    fetched: 0,
    parsed: 0,
    selected: selected.map((candidate) => hostOf(candidate.url)),
    excluded: [],
  };
  // Every discovered candidate outside the six-source cap is reported with a
  // reason rather than dropped silently.
  for (const candidate of queue) {
    ledger.excluded.push({
      host: hostOf(candidate.url),
      reason:
        'Excluded by the six-source retrieval cap after higher-ranked candidates were selected.',
    });
  }

  if (!sources.length && !selected.length) {
    throw new AppError(
      422,
      'SOURCES_REQUIRED',
      options.tavily.configured
        ? 'No usable sources were discovered. Add at least one official source URL or upload a text document.'
        : 'Add at least one official source URL or upload a text document. ProofPath does not invent requirements from model memory.',
      false,
    );
  }

  const describeFailure = (url: string, reason: unknown) => {
    const host = hostOf(url);
    const detail = reason instanceof AppError ? reason.message : 'retrieval failed';
    warnings.push(`${host}: ${detail}`);
    ledger.excluded.push({ host, reason: detail });
  };

  // Post-fetch scope gate. Only search-discovered candidates are eligible:
  // an explicit user URL is itself an instruction, and direct official
  // documents can legitimately contain a paragraph about the other route
  // (their individual sentences are handled by the contradiction scope gates).
  const scopeExcluded = (candidate: RankedCandidate, fetched: RetrievedSource): boolean => {
    if (!options.route || candidate.discovery !== 'tavily') return false;
    return scopeConflictsWithRoute(textLocationScope(fetched.text), options.route);
  };
  const describeScopeExclusion = (url: string) => {
    const host = hostOf(url);
    const reason = options.route?.abroad
      ? 'Excluded: the discovered source is scoped to domestic processing, which this overseas request did not select.'
      : 'Excluded: the discovered source is scoped to overseas/consular processing, which this domestic request did not select.';
    warnings.push(`${host}: ${reason}`);
    ledger.excluded.push({ host, reason });
  };

  const results = await Promise.allSettled(
    selected.map((candidate, index) =>
      fetchSource(candidate.url, `S${sources.length + index + 1}`, candidate.discovery),
    ),
  );
  ledger.fetched = selected.length;
  let failureCount = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      if (scopeExcluded(selected[index], result.value)) {
        failureCount += 1;
        describeScopeExclusion(selected[index].url);
        return;
      }
      sources.push(result.value);
      ledger.parsed += 1;
    } else {
      failureCount += 1;
      describeFailure(selected[index].url, result.reason);
    }
  });

  // Bounded backfill after a failed batch candidate: at most two extra,
  // sequential attempts, always inside the six-source cap and the function's
  // overall latency budget. IDs start beyond the initial batch to stay unique
  // before the contiguous re-assignment below.
  let backfills = 0;
  for (let attempt = 0; attempt < failureCount && backfills < 2; attempt += 1) {
    if (sources.length >= MAX_SOURCES) break;
    const candidate = queue.shift();
    if (!candidate) break;
    const id = `S${sources.length + selected.length + backfills + 1}`;
    ledger.fetched += 1;
    try {
      const fetched = await fetchSource(candidate.url, id, candidate.discovery);
      if (scopeExcluded(candidate, fetched)) {
        describeScopeExclusion(candidate.url);
      } else {
        sources.push(fetched);
        ledger.parsed += 1;
        ledger.selected.push(hostOf(candidate.url));
      }
    } catch (error) {
      describeFailure(candidate.url, error);
    }
    backfills += 1;
  }
  // A backfilled candidate was selected for the ledger even if its fetch failed.
  ledger.selected = [...new Set(ledger.selected)];

  if (!sources.length) {
    throw new AppError(
      422,
      'NO_USABLE_SOURCES',
      'None of the sources could be read. Add a readable official page, PDF, or text document.',
      false,
      warnings,
    );
  }

  // Reassign contiguous IDs after failed fetches; model and evidence gate only see these IDs.
  sources.forEach((entry, index) => {
    entry.source.id = `S${index + 1}`;
  });
  if (
    sources.length &&
    !sources.some(
      (entry) => entry.source.authority === 'official' || entry.source.authority === 'user',
    )
  ) {
    warnings.push(
      'No official-domain source was retrieved; secondary publisher guidance cannot override official requirements. Add an official source URL to establish supported requirements.',
    );
  }
  const directFetches = selected.length + backfills;
  logEvent('source_retrieval', {
    sources: sources.length,
    direct_fetches: directFetches,
    tavily_calls: tavilyCalls,
    warnings: warnings.length,
  });
  // Sanitized ledger: hosts, counts and reasons only — never source contents.
  logEvent('retrieval_ledger', {
    discovered: ledger.discovered,
    fetched: ledger.fetched,
    parsed: ledger.parsed,
    selected: JSON.stringify(ledger.selected),
    excluded: JSON.stringify(ledger.excluded.slice(0, 8)),
  });
  return { sources, warnings, tavilyCalls, tavilyRequestIds, directFetches, ledger };
}

export async function verifySourceList(
  input: Array<{ id: string; url: string | null; contentHash: string }>,
): Promise<SourceCheck[]> {
  const checkedAt = new Date().toISOString();
  return Promise.all(
    input.map(async (entry) => {
      if (!entry.url) {
        return {
          sourceId: entry.id,
          status: 'not-checkable' as const,
          checkedAt,
          detail: 'Uploaded documents have no remote URL to recheck.',
          currentHash: null,
        };
      }
      try {
        const current = await fetchSource(entry.url, entry.id);
        const unchanged = current.source.contentHash === entry.contentHash;
        return {
          sourceId: entry.id,
          status: unchanged ? ('unchanged' as const) : ('changed' as const),
          checkedAt: current.source.retrievedAt,
          detail: unchanged
            ? 'Source is available and its normalized text is unchanged.'
            : 'Source text changed. Review the original page before relying on this plan.',
          currentHash: current.source.contentHash,
        };
      } catch (error) {
        return {
          sourceId: entry.id,
          status: 'unavailable' as const,
          checkedAt,
          detail: error instanceof AppError ? error.message : 'Source is unavailable.',
          currentHash: null,
        };
      }
    }),
  );
}
