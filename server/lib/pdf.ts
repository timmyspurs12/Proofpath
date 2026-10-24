// Bounded, fail-closed PDF text extraction for official documents.
//
// Design constraints (serverless function, 60s budget):
// - pure-JavaScript parsing via unpdf/pdfjs; no native modules, no canvas,
//   no worker threads, and PDF JavaScript is never executed
// - hard caps on bytes, page count, extracted characters and wall time
// - any failure (encrypted, malformed, unsupported, timeout) becomes a typed
//   SOURCE_PDF_UNREADABLE error so the retrieval pipeline can record the
//   limitation and backfill with an HTML source instead of failing the plan
import { AppError } from './errors';

export const MAX_PDF_BYTES = 10_000_000;
export const MAX_PDF_PAGES = 25;
export const MAX_PDF_CHARACTERS = 30_000;
const PDF_PARSE_TIMEOUT_MS = 12_000;

export interface PdfExtraction {
  text: string;
  pageCount: number;
  title: string | null;
}

function withParseTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new AppError(422, 'SOURCE_PDF_UNREADABLE', 'PDF parsing timed out.', false)),
      PDF_PARSE_TIMEOUT_MS,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfExtraction> {
  if (bytes.length < 5 || Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') {
    throw new AppError(
      422,
      'SOURCE_PDF_UNREADABLE',
      'The document did not contain a valid PDF header.',
      false,
    );
  }
  try {
    // Dynamic import keeps the heavy parser off the HTML/text hot path and
    // out of bundles that never retrieve a PDF.
    const { getDocumentProxy, getMeta } = await import('unpdf');
    const document = await withParseTimeout(Promise.resolve(getDocumentProxy(bytes)));
    const pageCount = document.numPages as number;
    const pagesToRead = Math.min(pageCount, MAX_PDF_PAGES);
    const pageTexts = await withParseTimeout(
      Promise.all(
        Array.from({ length: pagesToRead }, async (_, index) => {
          const page = await document.getPage(index + 1);
          const content = await page.getTextContent();
          return content.items
            .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
            .join('');
        }),
      ),
    );
    const text = pageTexts.join('\n').slice(0, MAX_PDF_CHARACTERS).trim();
    if (text.length < 40) {
      throw new AppError(
        422,
        'SOURCE_PDF_UNREADABLE',
        'The PDF contained no extractable text (it may be a scanned image).',
        false,
      );
    }
    let title: string | null = null;
    try {
      const meta = await withParseTimeout(Promise.resolve(getMeta(bytes)));
      const candidate =
        meta.info && typeof meta.info.Title === 'string' ? meta.info.Title.trim() : '';
      title = candidate ? candidate.slice(0, 300) : null;
    } catch {
      title = null;
    }
    return { text, pageCount, title };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      422,
      'SOURCE_PDF_UNREADABLE',
      'The PDF could not be parsed; an official HTML source is used instead when available.',
      false,
    );
  }
}
