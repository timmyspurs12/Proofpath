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

export function authorityForHostname(hostname: string): Source['authority'] {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (
    host === 'gov' ||
    host.endsWith('.gov') ||
    /(^|\.)gov\.[a-z]{2,3}$/.test(host) ||
    host === 'edu' ||
    host.endsWith('.edu') ||
    host === 'int' ||
    host.endsWith('.int')
  ) {
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

export async function retrieveSources(options: RetrieveOptions) {
  const warnings: string[] = [];
  const sources: RetrievedSource[] = [];
  if (options.document) sources.push(makeUploadedSource(options.document, 'S1'));

  let tavilyCalls = 0;
  let tavilyRequestIds: string[] = [];
  let discoveredUrls: string[] = [];
  if (options.tavily.configured && options.directUrls.length + sources.length < MAX_SOURCES) {
    tavilyCalls = 1;
    const query =
      options.searchQueries[0] ?? `${options.goal} ${options.jurisdiction} official requirements`;
    try {
      const discovery = await options.tavily.discover(`${query} ${options.jurisdiction} official`);
      discoveredUrls = discovery.urls;
      tavilyRequestIds = discovery.requestIds;
    } catch (error) {
      warnings.push(
        error instanceof AppError
          ? error.message
          : 'Tavily discovery failed; direct sources were used.',
      );
    }
  }

  const candidates = [
    ...options.directUrls.map((url) => ({ url, retrieval: 'direct' as const })),
    ...discoveredUrls.map((url) => ({ url, retrieval: 'tavily' as const })),
  ];
  const unique = candidates.filter(
    (candidate, index) => candidates.findIndex((other) => other.url === candidate.url) === index,
  );
  const remaining = Math.max(0, MAX_SOURCES - sources.length);
  const selected = unique.slice(0, remaining);
  if (unique.length > remaining)
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

  const results = await Promise.allSettled(
    selected.map((candidate, index) =>
      fetchSource(candidate.url, `S${sources.length + index + 1}`, candidate.retrieval),
    ),
  );
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sources.push(result.value);
    } else {
      const hostname = (() => {
        try {
          return new URL(selected[index].url).hostname;
        } catch {
          return 'A source';
        }
      })();
      const reason = result.reason instanceof AppError ? result.reason.message : 'retrieval failed';
      warnings.push(`${hostname}: ${reason}`);
    }
  });

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
  const directFetches = selected.length;
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
