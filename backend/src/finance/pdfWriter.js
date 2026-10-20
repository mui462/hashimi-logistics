/**
 * Minimal, dependency-free PDF writer: text only, built-in Helvetica fonts, A4, multiple pages.
 * Every string is reduced to printable Latin-1 and escaped before it enters a content stream, so user-controlled text
 * (descriptions, notes, names) cannot close a string, inject operators or add objects. Output is a Buffer.
 */
const PAGE = { width: 595, height: 842, margin: 50 };

/** Printable ASCII/Latin-1 only: accents are decomposed, anything else becomes "?", controls become spaces. */
export function sanitizePdfText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[^ -~ -ÿ]/g, '?');
}

export const escapePdfString = (text) => sanitizePdfText(text).replace(/[\\()]/g, (char) => `\\${char}`);

const WIDTH_FACTOR = 0.52; // average Helvetica glyph width / font size, used only for wrapping

export function wrapText(text, size, maxWidth) {
  const limit = Math.max(8, Math.floor(maxWidth / (size * WIDTH_FACTOR)));
  const lines = [];
  for (const paragraph of sanitizePdfText(text).split(/\n/)) {
    let line = '';
    for (let word of paragraph.split(' ')) {
      while (word.length > limit) {
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, limit));
        word = word.slice(limit);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > limit) { lines.push(line); line = word; } else { line = candidate; }
    }
    lines.push(line);
  }
  return lines;
}

export class PdfDocument {
  constructor() {
    this.pages = [];
    this.newPage();
  }

  newPage() {
    this.current = [];
    this.pages.push(this.current);
    this.y = PAGE.height - PAGE.margin;
  }

  ensureSpace(height) {
    if (this.y - height < PAGE.margin) this.newPage();
  }

  /** Draws one line at the current y (or an explicit x), then moves down. align: 'left' | 'right' (right edge at x). */
  text(value, { size = 10, bold = false, x = PAGE.margin, align = 'left', advance = true, gap = 4 } = {}) {
    const clean = sanitizePdfText(value);
    this.ensureSpace(size + gap);
    const width = clean.length * size * WIDTH_FACTOR;
    const left = align === 'right' ? x - width : x;
    this.current.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${left.toFixed(2)} ${this.y.toFixed(2)} Td (${escapePdfString(clean)}) Tj ET`);
    if (advance) this.y -= size + gap;
  }

  paragraph(value, { size = 10, bold = false, x = PAGE.margin, width = PAGE.width - PAGE.margin * 2 - (x - PAGE.margin), gap = 3 } = {}) {
    for (const line of wrapText(value, size, width)) this.text(line, { size, bold, x, gap });
  }

  space(points) {
    this.y -= points;
  }

  rule() {
    this.ensureSpace(8);
    this.current.push(`${PAGE.margin} ${this.y.toFixed(2)} m ${PAGE.width - PAGE.margin} ${this.y.toFixed(2)} l S`);
    this.y -= 8;
  }

  toBuffer({ title = 'Document' } = {}) {
    const objects = [];
    const add = (body) => objects.push(body) && objects.length;
    const catalog = add('');
    const pagesRoot = add('');
    const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const info = add(`<< /Title (${escapePdfString(title)}) /Producer (Hashimi Logistics) >>`);
    const pageRefs = [];
    this.pages.forEach((commands, index) => {
      const footer = `BT /F1 8 Tf ${PAGE.margin} 28 Td (Page ${index + 1} of ${this.pages.length}) Tj ET`;
      const stream = `0.5 w\n${commands.join('\n')}\n${footer}`;
      const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
      pageRefs.push(add(`<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`));
    });
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`;
    objects[pagesRoot - 1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;

    let out = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((body, index) => {
      offsets.push(Buffer.byteLength(out, 'latin1'));
      out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  }
}
