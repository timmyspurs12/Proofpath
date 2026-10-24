import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as cheerio from 'cheerio';
import type { DocumentInput } from '../../src/shared/schemas';
import type { Source, SourceCheck } from '../../src/shared/schemas';
import { AppError } from './errors';
import { logEvent } from './logger';
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

async function readBoundedBody(response: Response) {
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_RESPONSE_BYTES) {
    throw new AppError(
      413,
      'SOURCE_TOO_LARGE',
      'A source page is too large to process safely.',
      false,
    );
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
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
  return Buffer.concat(chunks).toString('utf8');
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
          Accept: 'text/html,text/plain,application/xhtml+xml',
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
    if (!/text\/html|text\/plain|application\/xhtml\+xml/.test(contentType)) {
      throw new AppError(
        422,
        'SOURCE_UNSUPPORTED_TYPE',
        'Only public HTML and plain-text sources are supported. PDF retrieval is not implemented.',
        false,
      );
    }
    const raw = await readBoundedBody(response);
    let title = url.hostname;
    let publisher = url.hostname.replace(/^www\./, '');
    let publishedAt: string | null = null;
    let text = raw;
    if (contentType.includes('html') || contentType.includes('xhtml')) {
      const $ = cheerio.load(raw);
      $('script, style, noscript, svg, canvas, iframe, template').remove();
      $('br, p, li, h1, h2, h3, h4, h5, h6, tr, section, article').each((_, element) => {
        $(element).append('\n');
      });
      title =
        $('meta[property="og:title"]').attr('content')?.trim() ||
        $('title').first().text().trim() ||
        title;
      publisher =
        $('meta[property="og:site_name"]').attr('content')?.trim() ||
        $('meta[name="publisher"]').attr('content')?.trim() ||
        publisher;
      publishedAt =
        $('meta[property="article:published_time"]').attr('content')?.trim() ||
        $('meta[name="date"]').attr('content')?.trim() ||
        $('meta[name="last-modified"]').attr('content')?.trim() ||
        $('time[datetime]').first().attr('datetime')?.trim() ||
        null;
      const main = $('main').first().length
        ? $('main').first()
        : $('article').first().length
          ? $('article').first()
          : $('body');
      text = main.text();
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
}

// Stable, domain-agnostic ranking: official-host candidates come first so the
// six-source retrieval budget cannot be consumed by secondary publishers when
// official guidance is available. Original discovery order is kept within a tier.
export function rankCandidateUrls(urls: string[]): string[] {
  const unique = urls.filter((url, index) => urls.indexOf(url) === index);
  const tier = (url: string) => {
    try {
      return authorityForHostname(new URL(url).hostname) === 'official' ? 0 : 1;
    } catch {
      return 1;
    }
  };
  return unique
    .map((url, index) => ({ url, index, tier: tier(url) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((entry) => entry.url);
}

export async function retrieveSources(options: RetrieveOptions) {
  const warnings: string[] = [];
  const sources: RetrievedSource[] = [];
  if (options.document) sources.push(makeUploadedSource(options.document, 'S1'));

  let tavilyCalls = 0;
  let tavilyRequestIds: string[] = [];
  let discoveredUrls: string[] = [];
  const hasCapacity = () =>
    options.directUrls.length + sources.length + discoveredUrls.length < MAX_SOURCES;
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
        for (const url of discovery.urls) {
          if (!discoveredUrls.includes(url)) discoveredUrls.push(url);
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

  const rankedUrls = rankCandidateUrls([...options.directUrls, ...discoveredUrls]);
  const remaining = Math.max(0, MAX_SOURCES - sources.length);
  // The queue holds ranked candidates beyond the first batch so that a failed
  // fetch can be replaced by the next-ranked official or secondary source
  // instead of silently consuming part of the six-source budget.
  const queue = rankedUrls.map((url) => ({
    url,
    retrieval: options.directUrls.includes(url) ? ('direct' as const) : ('tavily' as const),
  }));
  const selected = queue.splice(0, remaining);
  if (rankedUrls.length > remaining)
    warnings.push(
      'Only the first six sources were used; additional source URLs were not retrieved.',
    );

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
    const hostname = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return 'A source';
      }
    })();
    const detail = reason instanceof AppError ? reason.message : 'retrieval failed';
    warnings.push(`${hostname}: ${detail}`);
  };

  const results = await Promise.allSettled(
    selected.map((candidate, index) =>
      fetchSource(candidate.url, `S${sources.length + index + 1}`, candidate.retrieval),
    ),
  );
  let failureCount = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sources.push(result.value);
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
    try {
      sources.push(await fetchSource(candidate.url, id, candidate.retrieval));
    } catch (error) {
      describeFailure(candidate.url, error);
    }
    backfills += 1;
  }

  if (!sources.length) {
    throw new AppError(
      422,
      'NO_USABLE_SOURCES',
      'None of the sources could be read. Add a readable official page or text document.',
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
  return { sources, warnings, tavilyCalls, tavilyRequestIds, directFetches };
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
