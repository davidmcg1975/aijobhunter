import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

/**
 * Tailors a CV by editing the user's own Word document in place, so the
 * result keeps their fonts, bullets, spacing, header and footer - it is their
 * CV with some sentences changed, not a new document in our house style.
 *
 * The model never sees or produces XML. It sees numbered paragraphs and
 * returns text for some of them; this module decides which paragraphs may be
 * touched and writes the text back into the existing runs.
 *
 * What may change is decided HERE, in code, not by the prompt: anything
 * carrying a date, an employer, a job title or a qualification is locked, as
 * is anything whose structure a text swap could damage (tabs, links, fields,
 * text boxes, images, tracked changes). The prompt asks for the same thing;
 * this makes it true regardless of what the model returns.
 *
 * Pure: bytes in, bytes out. Only word/document.xml is changed - headers and
 * footers, which usually hold the name and contact details, are left alone.
 */

export type DocxParagraph = {
  index: number;
  text: string;
  locked: boolean;
  /** Why it is locked - for tests and debugging, never shown to the model. */
  lockReason?: string;
};

export type DocxEdits = {
  rewrites: Array<{ paragraph: number; text: string }>;
  remove: number[];
};

export type AppliedEdits = {
  buffer: Buffer;
  rewritten: number[];
  removed: number[];
  /** Edits the model asked for that were refused, and why. */
  rejected: Array<{ paragraph: number; reason: string }>;
};

export class DocxEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocxEditError";
  }
}

/** Elements whose presence means a plain text swap could break the paragraph. */
const STRUCTURAL = [
  "w:hyperlink",
  "w:fldChar",
  "w:fldSimple",
  "w:instrText",
  "w:drawing",
  "w:pict",
  "w:object",
  "w:sdt",
  "w:txbxContent",
  "w:ins",
  "w:del",
  "w:moveFrom",
  "w:moveTo",
  "w:smartTag",
  "w:customXml",
  "mc:AlternateContent",
  // Tabs and breaks lay out "Job title <tab> 2019 - 2023" style lines.
  "w:tab",
  "w:br",
  "w:cr",
];

const MONTHS =
  "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";

const DATE_PATTERN = new RegExp(
  [
    "\\b(19[5-9]\\d|20[0-4]\\d)\\b", // a year
    `\\b(${MONTHS})\\b\\.?\\s*'?\\d{2}\\b`, // "Mar 21", "March '21"
    "\\b\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}\\b", // 01/03/2021
    "\\bpresent\\b",
  ].join("|"),
  "i",
);

/** Up to this length, a paragraph naming a locked phrase is that fact itself. */
const SHORT_LINE = 100;

/** Text as the model sees it; tabs shown as spacing so layout lines read naturally. */
function paragraphText(p: Element): string {
  let text = "";
  const walk = (node: Node) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeName === "w:t") text += child.textContent ?? "";
      else if (child.nodeName === "w:tab") text += "    ";
      else if (child.nodeName === "w:br" || child.nodeName === "w:cr") text += " / ";
      else if (child.nodeName !== "w:instrText") walk(child);
    }
  };
  walk(p);
  return text.replace(/\s+$/, "");
}

function hasDescendant(el: Element, names: string[]): string | null {
  for (const name of names) {
    if (el.getElementsByTagName(name).length > 0) return name;
  }
  return null;
}

function insideTextBox(el: Element): boolean {
  for (let node = el.parentNode; node; node = node.parentNode) {
    if (node.nodeName === "w:txbxContent") return true;
  }
  return false;
}

/** Runs that hold the paragraph's text, all direct children of it. */
function textRuns(p: Element): Element[] {
  const runs: Element[] = [];
  for (let child = p.firstChild; child; child = child.nextSibling) {
    if (child.nodeName === "w:r" && (child as Element).getElementsByTagName("w:t").length) {
      runs.push(child as Element);
    }
  }
  return runs;
}

function lockReason(p: Element, text: string, lockedPhrases: string[]): string | null {
  if (!text.trim()) return "empty";
  if (p.getElementsByTagName("w:p").length > 0) return "contains other paragraphs";
  if (insideTextBox(p)) return "inside a text box";
  const structural = hasDescendant(p, STRUCTURAL);
  if (structural) return `contains ${structural}`;

  // All of the text must sit in runs directly under the paragraph, or a
  // rewrite would leave stray text behind.
  const direct = textRuns(p)
    .flatMap((r) => Array.from(r.getElementsByTagName("w:t")))
    .map((t) => t.textContent ?? "")
    .join("");
  if (direct !== text) return "text outside simple runs";

  if (DATE_PATTERN.test(text)) return "contains a date";
  const lower = text.toLowerCase();
  // A short line naming an employer, title or qualification IS that fact
  // ("Senior Test Lead", "ISTQB Foundation"). A long bullet that merely
  // mentions one ("acted as test lead for...") is exactly what tailoring
  // should improve, and verifyGrounding still checks it afterwards.
  const phrase = lockedPhrases.find((ph) => ph.length >= 3 && lower.includes(ph.toLowerCase()));
  if (phrase && text.length <= SHORT_LINE) return "names an employer, job title or qualification";
  // Section headings: short and in capitals.
  if (text.length <= 40 && text === text.toUpperCase() && /[A-Z]/.test(text)) return "heading";
  return null;
}

async function loadDocument(buffer: Buffer) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocxEditError("The CV file is not a readable Word document.");
  }
  const part = zip.file("word/document.xml");
  if (!part) throw new DocxEditError("The CV file is not a readable Word document.");
  const xml = await part.async("string");
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const body = doc.getElementsByTagName("w:body")[0];
  if (!body) throw new DocxEditError("The CV file is not a readable Word document.");
  const paragraphs = Array.from(body.getElementsByTagName("w:p"));
  return { zip, doc, paragraphs };
}

/**
 * Every paragraph with text, numbered in document order, each marked locked
 * or editable. The numbering is what the model's edits refer to.
 */
export async function readDocxParagraphs(
  buffer: Buffer,
  lockedPhrases: string[] = [],
): Promise<DocxParagraph[]> {
  const { paragraphs } = await loadDocument(buffer);
  return describe(paragraphs, lockedPhrases).filter((p) => p.text.trim());
}

function describe(paragraphs: Element[], lockedPhrases: string[]): DocxParagraph[] {
  return paragraphs.map((p, index) => {
    const text = paragraphText(p);
    const reason = lockReason(p, text, lockedPhrases);
    return reason
      ? { index, text, locked: true, lockReason: reason }
      : { index, text, locked: false };
  });
}

/** Word requires every table cell to keep at least one paragraph. */
function lastInCell(p: Element): boolean {
  const parent = p.parentNode;
  if (!parent || parent.nodeName !== "w:tc") return false;
  let count = 0;
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.nodeName === "w:p") count += 1;
  }
  return count <= 1;
}

/** Longer than any real CV paragraph; stops a runaway rewrite. */
const MAX_REWRITE_LENGTH = 1500;

function setText(t: Element, value: string): void {
  while (t.firstChild) t.removeChild(t.firstChild);
  t.appendChild(t.ownerDocument!.createTextNode(value));
  t.setAttribute("xml:space", "preserve");
}

function runFormatting(run: Element): string {
  const rPr = run.getElementsByTagName("w:rPr")[0];
  return rPr ? new XMLSerializer().serializeToString(rPr) : "";
}

/**
 * Writes new text into a paragraph, keeping its paragraph and run formatting.
 *
 * Text goes into the first run, whose formatting it takes on. One exception
 * keeps a common CV pattern intact: a differently formatted lead-in such as a
 * bold "Automation:" followed by plain text. If the new text still starts with
 * that lead-in, the lead-in run is kept and the rest goes into the next run.
 */
function rewriteParagraph(p: Element, value: string): void {
  const runs = textRuns(p);
  if (runs.length === 0) return;

  let keep = 0;
  const first = runs[0]!;
  const firstText = Array.from(first.getElementsByTagName("w:t"))
    .map((t) => t.textContent ?? "")
    .join("");
  if (
    runs.length > 1 &&
    firstText.trim() &&
    value.startsWith(firstText) &&
    runFormatting(first) !== runFormatting(runs[1]!)
  ) {
    keep = 1;
  }

  const target = runs[keep]!;
  const remainder = keep ? value.slice(firstText.length) : value;
  const [firstT, ...otherTs] = Array.from(target.getElementsByTagName("w:t"));
  setText(firstT!, remainder);
  for (const t of otherTs) target.removeChild(t);
  for (const run of runs.slice(keep + 1)) p.removeChild(run);
}

export async function applyDocxEdits(
  buffer: Buffer,
  edits: DocxEdits,
  lockedPhrases: string[] = [],
): Promise<AppliedEdits> {
  const { zip, doc, paragraphs } = await loadDocument(buffer);
  const described = describe(paragraphs, lockedPhrases);
  const editable = new Set(described.filter((p) => !p.locked).map((p) => p.index));
  const rejected: AppliedEdits["rejected"] = [];

  const refuse = (paragraph: number): string | null => {
    const target = described[paragraph];
    if (!target || !target.text.trim()) return "no such paragraph";
    if (target.locked) return `locked (${target.lockReason})`;
    return null;
  };

  // Removal is capped so a tailored CV is still recognisably the same CV;
  // the excess is refused rather than silently applied.
  const maxRemovals = Math.floor(editable.size / 2);
  const removed: number[] = [];
  for (const paragraph of new Set(edits.remove)) {
    const reason = refuse(paragraph) ?? (lastInCell(paragraphs[paragraph]!) ? "only paragraph in a table cell" : null);
    if (reason) rejected.push({ paragraph, reason });
    else if (removed.length >= maxRemovals) {
      rejected.push({ paragraph, reason: "too many removals" });
    } else removed.push(paragraph);
  }

  const rewritten: number[] = [];
  const seen = new Set<number>();
  for (const { paragraph, text } of edits.rewrites) {
    const value = text.replace(/\s+/g, " ").trim();
    const reason =
      refuse(paragraph) ??
      (seen.has(paragraph) ? "rewritten twice" : null) ??
      (removed.includes(paragraph) ? "also removed" : null) ??
      (!value ? "empty text" : null) ??
      (value.length > MAX_REWRITE_LENGTH ? "too long" : null);
    seen.add(paragraph);
    if (reason) {
      rejected.push({ paragraph, reason });
      continue;
    }
    rewriteParagraph(paragraphs[paragraph]!, value);
    rewritten.push(paragraph);
  }

  for (const paragraph of removed) {
    const p = paragraphs[paragraph]!;
    p.parentNode?.removeChild(p);
  }

  const xml = new XMLSerializer().serializeToString(doc);
  zip.file("word/document.xml", xml);
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  return { buffer: out, rewritten, removed, rejected };
}

export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
