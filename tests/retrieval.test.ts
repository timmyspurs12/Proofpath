import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SOURCE_FETCH_TIMEOUT_MS,
  authorityForHostname,
  fetchSource,
  hashText,
  isPrivateAddress,
  makeUploadedSource,
  rankCandidateUrls,
  retrieveSources,
  verifySourceList,
} from '../server/lib/retrieval';
import type { TavilyClient } from '../server/lib/tavily';

const originalFetch = globalThis.fetch;
afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe('source network boundaries', () => {
  it('recognizes private, loopback and mapped addresses', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.0.0.4')).toBe(true);
    expect(isPrivateAddress('169.254.1.1')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('::ffff:7f00:1')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });

  it('does not trust a deceptive hostname as an official domain', () => {
    expect(authorityForHostname('www.gov.uk')).toBe('official');
    expect(authorityForHostname('service.gov.ng')).toBe('official');
    expect(authorityForHostname('agency.gov')).toBe('official');
    expect(authorityForHostname('gov.uk.evil.example')).toBe('secondary');
    expect(authorityForHostname('notgov.uk')).toBe('secondary');
  });

  it('recognizes generic government registry labels from any jurisdiction without a country table', () => {
    // Registry-label patterns, not country-specific entries: a previously
    // unconfigured jurisdiction is recognized purely on hostname structure.
    expect(authorityForHostname('www.service-public.gouv.fr')).toBe('official');
    expect(authorityForHostname('www.canada.ca')).toBe('secondary');
    expect(authorityForHostname('www.cic.gc.ca')).toBe('official');
    expect(authorityForHostname('www.nta.go.jp')).toBe('official');
    expect(authorityForHostname('www.govt.nz')).toBe('official');
    expect(authorityForHostname('ec.europa.eu')).toBe('official');
    expect(authorityForHostname('europa.eu.evil.example')).toBe('secondary');
    // An ordinary .de ministry host that follows no registry label stays
    // secondary and degrades honestly via the no-official-source warning.
    expect(authorityForHostname('www.auswaertiges-amt.de')).toBe('secondary');
  });

  it('rejects a local URL before any network request', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    await expect(fetchSource('http://127.0.0.1/admin', 'S1')).rejects.toMatchObject({
      code: 'UNSAFE_SOURCE_URL',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('revalidates redirects and blocks a redirect to localhost', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }),
      );
    globalThis.fetch = fetchMock;
    await expect(fetchSource('https://8.8.8.8/source', 'S1')).rejects.toMatchObject({
      code: 'UNSAFE_SOURCE_URL',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retrieves bounded readable text and derives metadata', async () => {
    const html =
      '<html><head><title>Official fixture</title><meta property="og:site_name" content="Fixture Office"><meta property="article:published_time" content="2020-01-01"></head><body><main><h1>Renew a document</h1><p>The fee is £102 and this passage is long enough to be a useful retrieved source.</p><script>ignore this</script></main></body></html>';
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );
    const result = await fetchSource('https://8.8.8.8/guide', 'S1');
    expect(result.text).toContain('The fee is £102');
    expect(result.text).not.toContain('ignore this');
    expect(result.source.title).toBe('Official fixture');
    expect(result.source.publisher).toBe('Fixture Office');
    expect(result.source.stale).toBe(true);
    expect(result.source.contentHash).toBe(hashText(result.text));
  });

  it('rejects unsupported files, unreadable PDFs and oversized responses', async () => {
    // PDFs are supported now; an invalid PDF body fails closed as unreadable.
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('%PDF', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
      );
    await expect(fetchSource('https://8.8.8.8/file.pdf', 'S1')).rejects.toMatchObject({
      code: 'SOURCE_PDF_UNREADABLE',
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('binary', {
        status: 200,
        headers: { 'Content-Type': 'application/zip' },
      }),
    );
    await expect(fetchSource('https://8.8.8.8/archive', 'S1')).rejects.toMatchObject({
      code: 'SOURCE_UNSUPPORTED_TYPE',
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('large', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', 'Content-Length': '750001' },
      }),
    );
    await expect(fetchSource('https://8.8.8.8/large', 'S1')).rejects.toMatchObject({
      code: 'SOURCE_TOO_LARGE',
    });
  });
});

describe('uploads and explicit rechecks', () => {
  it('hashes the exact bounded upload snapshot and has no remote URL', () => {
    const result = makeUploadedSource(
      { name: 'notice.txt', text: '  A useful uploaded passage.\n\n\nWith another line.  ' },
      'S1',
    );
    expect(result.source.url).toBeNull();
    expect(result.source.authority).toBe('user');
    expect(result.source.contentHash).toBe(hashText(result.text));
    expect(result.text).not.toContain('\n\n\n');
  });

  it('marks uploads not-checkable without fabricating a recheck', async () => {
    const [check] = await verifySourceList([
      { id: 'S1', url: null, contentHash: hashText('fixture') },
    ]);
    expect(check.status).toBe('not-checkable');
    expect(check.currentHash).toBeNull();
  });

  it('compares the current source hash only when the user requests it', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('The updated source passage is long enough to retrieve successfully.', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    const [check] = await verifySourceList([
      { id: 'S1', url: 'https://8.8.8.8/guide', contentHash: hashText('old') },
    ]);
    expect(check.status).toBe('changed');
    expect(check.currentHash).not.toBe(hashText('old'));
  });
});

describe('candidate ranking and targeted discovery', () => {
  it('ranks official-host URLs ahead of secondary publishers, preserving order within a tier', () => {
    const ranked = rankCandidateUrls([
      'https://blog.example.co.uk/one',
      'https://www.gov.uk/official',
      'https://agency.gov/guide',
      'https://blog.example.co.uk/two',
    ]);
    expect(ranked).toEqual([
      'https://www.gov.uk/official',
      'https://agency.gov/guide',
      'https://blog.example.co.uk/one',
      'https://blog.example.co.uk/two',
    ]);
  });

  it('deduplicates repeated URLs and never reorders malformed entries ahead', () => {
    expect(rankCandidateUrls(['https://www.gov.uk/a', 'https://www.gov.uk/a'])).toEqual([
      'https://www.gov.uk/a',
    ]);
    expect(rankCandidateUrls(['not-a-url', 'https://www.gov.uk/a'])).toEqual([
      'https://www.gov.uk/a',
      'not-a-url',
    ]);
  });

  it('runs Tavily discovery for every intake query and warns when no official source is retrieved', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const host = String(url);
      return new Response(
        `Retrieved guidance text from ${host} with enough words to pass the minimum source length check.`,
        { status: 200, headers: { 'content-type': 'text/plain' } },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const queries: string[] = [];
    const tavily = {
      configured: true,
      discover: vi.fn(async (query: string) => {
        queries.push(query);
        return query.includes('track')
          ? { urls: ['https://8.8.8.8/tracking'], requestIds: ['req-track'], calls: 1 }
          : { urls: ['https://9.9.9.9/basics'], requestIds: ['req-basics'], calls: 1 };
      }),
    };

    const result = await retrieveSources({
      directUrls: [],
      searchQueries: ['renew passport online', 'track passport application'],
      goal: 'Renew a passport online',
      jurisdiction: 'United Kingdom',
      document: null,
      tavily: tavily as unknown as TavilyClient,
    });

    expect(tavily.discover).toHaveBeenCalledTimes(2);
    expect(queries).toHaveLength(2);
    expect(result.tavilyCalls).toBe(2);
    expect(result.tavilyRequestIds).toEqual(['req-basics', 'req-track']);
    expect(result.sources).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      result.warnings.some((warning) =>
        warning.includes('No official-domain source was retrieved'),
      ),
    ).toBe(true);
  });

  it('backfills the six-source budget with the next ranked candidate when a fetch fails', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes('8.8.8.8/broken')) {
        return new Response('fault', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        });
      }
      return new Response(
        `Retrieved guidance text from ${target} with enough words to pass the minimum source length check.`,
        { status: 200, headers: { 'content-type': 'text/plain' } },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const discovered = [
      'https://9.9.9.9/one',
      'https://9.9.9.9/two',
      'https://9.9.9.9/three',
      'https://9.9.9.9/four',
      'https://9.9.9.9/five',
      'https://9.9.9.9/six',
    ];
    const tavily = {
      configured: true,
      discover: vi.fn(async () => ({
        urls: discovered,
        requestIds: ['req-backfill'],
        calls: 1,
      })),
    };

    const result = await retrieveSources({
      directUrls: ['https://8.8.8.8/broken'],
      searchQueries: ['permit guidance'],
      goal: 'Complete a permit application',
      jurisdiction: 'Kenya',
      document: null,
      tavily: tavily as unknown as TavilyClient,
    });

    // The failed direct source is replaced, not silently counted as a source.
    expect(result.sources).toHaveLength(6);
    expect(result.sources.some((entry) => entry.source.url?.includes('broken'))).toBe(false);
    expect(result.warnings.some((warning) => warning.includes('8.8.8.8'))).toBe(true);
    // Eight fetch attempts: six in the initial batch (the direct 500 gets
    // one bounded retry), plus one queue backfill for the failed direct slot.
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(result.directFetches).toBe(8);
  });

  it('scopes discovery queries without a jurisdiction suffix when none was supplied', async () => {
    const fetchMock = vi.fn(
      async (url: string) =>
        new Response(
          `Retrieved guidance text from ${String(url)} with enough words to pass the source check.`,
          { status: 200, headers: { 'content-type': 'text/plain' } },
        ),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const queries: string[] = [];
    const tavily = {
      configured: true,
      discover: vi.fn(async (query: string) => {
        queries.push(query);
        return { urls: ['https://9.9.9.9/basics'], requestIds: ['req-x'], calls: 1 };
      }),
    };

    await retrieveSources({
      directUrls: [],
      searchQueries: ['register a business'],
      goal: 'Register a small business',
      jurisdiction: '',
      document: null,
      tavily: tavily as unknown as TavilyClient,
    });

    expect(queries[0]).toBe('register a business official');
    expect(queries[0]).not.toMatch(/\s{2,}/);
  });
});

// Regression coverage for slow official origins: measured NIS document
// responses took up to 24.1s in October 2026, which the previous 8-second
// budget could never accommodate. Fake timers keep the suite instant.
describe('source fetch timeout budget', () => {
  const slowHtml =
    '<html><body><main><h1>Slow official document</h1><p>This passage is deliberately long enough to clear the forty-character readability minimum after extraction completes.</p></main></body></html>';

  // Mimics a real slow server: resolves after a mocked delay, and rejects
  // with an AbortError when the caller's AbortController fires first.
  const slowFetch = (delayMs: number | null) =>
    vi.fn().mockImplementation(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
          if (delayMs !== null) {
            setTimeout(
              () =>
                resolve(
                  new Response(slowHtml, {
                    status: 200,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                  }),
                ),
              delayMs,
            );
          }
        }),
    );

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports a thirty-second budget so slow government pages stay readable', () => {
    expect(SOURCE_FETCH_TIMEOUT_MS).toBe(30_000);
  });

  it('accepts an official origin that responds in fifteen seconds', async () => {
    globalThis.fetch = slowFetch(15_000);
    const resultPromise = fetchSource('https://8.8.8.8/slow-official-page', 'S1');
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await resultPromise;
    expect(result.text).toContain('Slow official document');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('fails closed as SOURCE_TIMEOUT when the origin never responds in budget', async () => {
    globalThis.fetch = slowFetch(null);
    const rejection = expect(
      fetchSource('https://8.8.8.8/hung-official-page', 'S1'),
    ).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT', status: 504 });
    await vi.advanceTimersByTimeAsync(SOURCE_FETCH_TIMEOUT_MS + 1_000);
    await rejection;
  });
});

// Regression coverage for transient failures on user-supplied direct URLs:
// the same official origin was observed failing with SOURCE_FETCH_FAILED on
// one attempt and succeeding on the next within the same session.
describe('direct-source bounded retry', () => {
  const readableHtml =
    '<html><body><main><h1>Official guidance</h1><p>This passage contains enough words to clear the forty-character readability minimum for source extraction.</p></main></body></html>';
  const aborted = () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
  };
  const baseOptions = {
    directUrls: ['https://8.8.8.8/official-renewal-page'],
    searchQueries: [],
    goal: 'Renew an official document',
    jurisdiction: 'Nigeria',
    document: null,
    tavily: { configured: false, discover: vi.fn() } as unknown as TavilyClient,
  };

  it('retries once after an aborted connection and then retrieves the source', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(aborted())
      .mockResolvedValueOnce(
        new Response(readableHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      );
    const result = await retrieveSources(baseOptions);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(result.sources).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.includes('bounded retry'))).toBe(true);
  });

  it('retries once after a 503 response and then retrieves the source', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(readableHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      );
    const result = await retrieveSources(baseOptions);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(result.sources).toHaveLength(1);
  });

  it('does not retry a content-level failure such as an empty source', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('short', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
    );
    await expect(retrieveSources(baseOptions)).rejects.toMatchObject({
      code: 'NO_USABLE_SOURCES',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not apply the direct retry path to Tavily-discovered candidates', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('fault', { status: 500 }));
    const tavily = {
      configured: true,
      discover: vi.fn(async () => ({
        urls: ['https://9.9.9.9/discovered-page'],
        requestIds: ['req-retry-scope'],
        calls: 1,
      })),
    } as unknown as TavilyClient;
    await expect(retrieveSources({ ...baseOptions, directUrls: [], tavily })).rejects.toMatchObject(
      { code: 'NO_USABLE_SOURCES' },
    );
    // One fetch attempt only: no direct retry, and the backfill queue is empty.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the single bounded retry also fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(aborted());
    await expect(retrieveSources(baseOptions)).rejects.toMatchObject({
      code: 'NO_USABLE_SOURCES',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
