import "server-only";

/**
 * CV export.
 *
 * Tailored CVs are held as plain text with simple conventions: an ALL CAPS or
 * short standalone line is a heading, a line starting "- " is a bullet.
 * That is enough structure for both output formats and keeps the AI's job
 * simple, which keeps it honest.
 */

export type CvBlock =
  | { kind: "heading"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string };

const KNOWN_HEADINGS = [
  "profile",
  "summary",
  "professional summary",
  "key skills",
  "skills",
  "core skills",
  "technical skills",
  "experience",
  "employment",
  "employment history",
  "professional experience",
  "career history",
  "qualifications",
  "education",
  "certifications",
  "contact",
  "references",
];

export function parseCvText(text: string): CvBlock[] {
  const blocks: CvBlock[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^[-*•]\s+/.test(line)) {
      blocks.push({ kind: "bullet", text: line.replace(/^[-*•]\s+/, "") });
      continue;
    }

    const withoutColon = line.replace(/:$/, "").trim();
    const isKnown = KNOWN_HEADINGS.includes(withoutColon.toLowerCase());
    const isShoutedShortLine =
      line.length <= 60 && line === line.toUpperCase() && /[A-Z]/.test(line);

    if (isKnown || isShoutedShortLine) {
      blocks.push({ kind: "heading", text: withoutColon });
      continue;
    }

    blocks.push({ kind: "paragraph", text: line });
  }

  return blocks;
}

// --- PDF -------------------------------------------------------------------

/**
 * Built with pdf-lib and the standard fonts: no native dependencies and no
 * headless browser, so it runs unchanged on Vercel.
 */
export async function renderCvPdf(params: {
  name: string;
  text: string;
}): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const pdf = await PDFDocument.create();
  pdf.setTitle(params.name);
  pdf.setProducer("AI Contract Hunter");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const A4: [number, number] = [595.28, 841.89];
  const margin = 56;
  const bodySize = 10.5;
  const headingSize = 12.5;
  const lineHeight = 14;
  const maxWidth = A4[0] - margin * 2;

  let page = pdf.addPage(A4);
  let y = A4[1] - margin;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < margin) {
      page = pdf.addPage(A4);
      y = A4[1] - margin;
    }
  };

  const wrap = (
    text: string,
    font: typeof regular,
    size: number,
    width: number,
  ): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      // A single word longer than the line must still be broken.
      if (font.widthOfTextAtSize(word, size) > width) {
        let chunk = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) > width) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  for (const block of parseCvText(params.text)) {
    if (block.kind === "heading") {
      newPageIfNeeded(lineHeight * 2.5);
      y -= lineHeight * 0.8;
      page.drawText(block.text.toUpperCase(), {
        x: margin,
        y,
        size: headingSize,
        font: bold,
        color: rgb(0.09, 0.12, 0.18),
      });
      y -= 5;
      page.drawLine({
        start: { x: margin, y },
        end: { x: A4[0] - margin, y },
        thickness: 0.75,
        color: rgb(0.75, 0.78, 0.82),
      });
      y -= lineHeight * 0.9;
      continue;
    }

    const indent = block.kind === "bullet" ? 14 : 0;
    const lines = wrap(block.text, regular, bodySize, maxWidth - indent);

    for (const [index, line] of lines.entries()) {
      newPageIfNeeded(lineHeight);
      if (block.kind === "bullet" && index === 0) {
        page.drawText("•", {
          x: margin,
          y,
          size: bodySize,
          font: regular,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
      page.drawText(line, {
        x: margin + indent,
        y,
        size: bodySize,
        font: regular,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= lineHeight;
    }
    y -= 3;
  }

  return pdf.save();
}

// --- DOCX ------------------------------------------------------------------

export async function renderCvDocx(params: {
  name: string;
  text: string;
}): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } =
    await import("docx");

  const children = parseCvText(params.text).map((block) => {
    if (block.kind === "heading") {
      return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: block.text.toUpperCase(), bold: true })],
      });
    }
    if (block.kind === "bullet") {
      return new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: [new TextRun(block.text)],
      });
    }
    return new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 120 },
      children: [new TextRun(block.text)],
    });
  });

  const document = new Document({
    title: params.name,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 21 } },
      },
    },
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(document);
}

/** Safe filename for the Content-Disposition header. */
export function exportFilename(name: string, extension: string): string {
  const safe = name
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "cv";
  return `${safe}.${extension}`;
}
