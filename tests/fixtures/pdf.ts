// Minimal valid single-font PDF generator for deterministic tests. Produces
// real %PDF bytes that pdfjs can parse — not a mock of the parser. Fixture
// documents only; never used to fabricate evidence in production code.
export function makePdf(lines: string[]): Uint8Array {
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  );
  const escape = (value: string) => value.replace(/[()\\]/g, '\\$&');
  // pdf.js 6 truncates a single rendered line at ~100 characters, so word-wrap
  // long fixture lines into separate visual lines. The retrieval normalizer
  // collapses the line breaks, so a passage stays a single quotable string.
  const wrap = (value: string, width = 90): string[] => {
    const words = value.split(' ');
    const wrapped: string[] = [];
    let current = '';
    for (const word of words) {
      if (current && current.length + word.length + 1 > width) {
        wrapped.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) wrapped.push(current);
    return wrapped.length ? wrapped : [''];
  };
  // Explicit callback: flatMap would otherwise pass the array index as the
  // wrap width, collapsing every line to one word per visual line.
  const visualLines = lines.flatMap((line) => wrap(line));
  const stream = visualLines
    .map((line, index) => `BT /F1 12 Tf 72 ${720 - index * 18} Td (${escape(line)}) Tj ET`)
    .join('\n');
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}
