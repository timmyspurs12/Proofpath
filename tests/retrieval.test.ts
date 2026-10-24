import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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

  it('rejects unsupported files and oversized responses', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('%PDF', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
      );
    await expect(fetchSource('https://8.8.8.8/file', 'S1')).rejects.toMatchObject({
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
});
