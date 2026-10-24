import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPdfText, MAX_PDF_BYTES } from '../server/lib/pdf';
import { fetchSource, retrieveSources } from '../server/lib/retrieval';
import { normalizeQuote } from '../server/lib/evidence';
import type { TavilyClient } from '../server/lib/tavily';
import { makePdf } from './fixtures/pdf';

const FEE_PASSAGE =
  'The standard domestic 32-page 5-year adult passport renewal fee is NGN 100,000, excluding bank charges.';

const originalFetch = globalThis.fetch;
afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe('PDF text extraction', () => {
  it('extracts exact passages and page counts from a real PDF', async () => {
    const pdf = makePdf([
      'Nigeria Immigration Service passport fee announcement',
      'The standard domestic 32-page 5-year adult passport renewal fee is NGN 100,000, excluding bank charges.',
    ]);
    const result = await extractPdfText(pdf);
    expect(result.pageCount).toBe(1);
    // The passage wraps across visual PDF lines; citation validation must
    // still find it. Assert via the same whitespace-collapsing matcher the
    // engine uses for exact-passage checks (normalizeSourceText intentionally
    // keeps paragraph newlines for prompting).
    expect(normalizeQuote(result.text)).toContain(normalizeQuote(FEE_PASSAGE));
  });

  it('fails closed on non-PDF bytes instead of inventing text', async () => {
    await expect(
      extractPdfText(new Uint8Array(Buffer.from('<!doctype html><p>not a pdf</p>'))),
    ).rejects.toMatchObject({ code: 'SOURCE_PDF_UNREADABLE' });
  });

  it('fails closed on a structurally invalid PDF body', async () => {
    const broken = new Uint8Array(Buffer.from('%PDF-1.4\nthis is not a valid document structure'));
    await expect(extractPdfText(broken)).rejects.toMatchObject({
      code: 'SOURCE_PDF_UNREADABLE',
    });
  });

  it('rejects an empty-text PDF as unreadable', async () => {
    const empty = makePdf(['']);
    await expect(extractPdfText(empty)).rejects.toMatchObject({
      code: 'SOURCE_PDF_UNREADABLE',
    });
  });
});

describe('fetchSource PDF handling', () => {
  it('retrieves an official PDF as a quotable source with provenance', async () => {
    const pdf = makePdf([
      'Passport service level agreement',
      'The domestic 32-page 5-year passport fee remains NGN 100,000 excluding bank charges.',
    ]);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(pdf, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      }),
    );
    const result = await fetchSource('https://8.8.8.8/fee-circular.pdf', 'S1');
    expect(result.source.url).toContain('.pdf');
    // Without embedded PDF metadata the title falls back to the humanized
    // URL filename (hyphens become spaces in source titles).
    expect(result.source.title).toBe('fee circular');
    expect(normalizeQuote(result.text)).toContain(
      normalizeQuote(
        'The domestic 32-page 5-year passport fee remains NGN 100,000 excluding bank charges.',
      ),
    );
    expect(result.source.contentHash).toHaveLength(64);
    // Authority stays hostname-derived; the registry-label rule itself is
    // covered in the retrieval tests.
    expect(result.source.authority).toBe('secondary');
  });

  it('treats a .pdf URL without an accurate content type as a PDF', async () => {
    const pdf = makePdf([
      'A long enough official passage that passes the minimum text length check.',
    ]);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(pdf, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );
    const result = await fetchSource('https://9.9.9.9/notice.pdf', 'S1');
    expect(result.text).toContain('official passage');
  });

  it('rejects PDFs above the byte cap', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array(10), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(MAX_PDF_BYTES + 1),
        },
      }),
    );
    await expect(fetchSource('https://8.8.8.8/huge.pdf', 'S1')).rejects.toMatchObject({
      code: 'SOURCE_TOO_LARGE',
    });
  });
});

describe('retrieval backfill around inaccessible PDFs', () => {
  it('records the unreadable PDF as excluded and continues with an official HTML source', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const target = String(input);
      if (target.endsWith('/announcement.pdf')) {
        return new Response('fault', {
          status: 500,
          headers: { 'content-type': 'application/pdf' },
        });
      }
      return new Response(
        `<!doctype html><html><body><main><p>Official guidance from ${target} with enough readable text to pass the source length check and exact passages.</p></main></body></html>`,
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    });
    const tavily = {
      configured: true,
      discover: vi.fn(async () => ({
        urls: ['https://9.9.9.9/guide'],
        results: [{ url: 'https://9.9.9.9/guide', title: 'Official guide' }],
        requestIds: ['req-pdf'],
        calls: 1,
      })),
    };
    const result = await retrieveSources({
      directUrls: ['https://8.8.8.8/announcement.pdf'],
      searchQueries: ['passport fee'],
      goal: 'Renew a passport',
      jurisdiction: 'Nigeria',
      document: null,
      tavily: tavily as unknown as TavilyClient,
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].source.url).toContain('/guide');
    expect(result.ledger.excluded.some((entry) => entry.reason.includes('HTTP 500'))).toBe(true);
    expect(result.warnings.join(' ')).toContain('8.8.8.8');
  });
});
