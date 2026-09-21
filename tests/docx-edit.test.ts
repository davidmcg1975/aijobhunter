import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  Document,
  Packer,
  Paragraph,
  Tab,
  Table,
  TableCell,
  TableRow,
  TextRun,
  AlignmentType,
} from "docx";
import { applyDocxEdits, DocxEditError, readDocxParagraphs } from "@/lib/cv/docx-edit";

const SUMMARY =
  "Experienced test lead with a background in regulated financial services, delivering manual and automated testing for customer-facing platforms.";

async function sampleCv(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: "PROFILE", bold: true })] }),
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [new TextRun({ text: SUMMARY, font: "Georgia", size: 22 })],
          }),
          new Paragraph({
            children: [new TextRun("Senior Test Lead"), new TextRun({ children: [new Tab(), "2019 - 2023"] })],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun("Led a team of six testers across quarterly releases.")],
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun("Maintained the regression pack for the mobile banking app.")],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Automation:", bold: true }),
              new TextRun(" Selenium and Postman suites run nightly in Jenkins."),
            ],
          }),
          new Paragraph({ children: [new TextRun("Barclays Bank")] }),
          new Paragraph({ children: [new TextRun("Joined in March 2019 to rebuild the test function.")] }),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function documentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("word/document.xml")!.async("string");
}

function find(paragraphs: Awaited<ReturnType<typeof readDocxParagraphs>>, start: string) {
  const p = paragraphs.find((x) => x.text.startsWith(start));
  if (!p) throw new Error(`no paragraph starting "${start}"`);
  return p;
}

describe("readDocxParagraphs", () => {
  it("locks headings, dated lines, layout lines and employer lines; leaves prose editable", async () => {
    const ps = await readDocxParagraphs(await sampleCv(), ["Barclays Bank"]);

    expect(find(ps, "PROFILE")).toMatchObject({ locked: true, lockReason: "heading" });
    expect(find(ps, "Senior Test Lead").locked).toBe(true);
    expect(find(ps, "Barclays Bank")).toMatchObject({
      locked: true,
      lockReason: "names an employer, job title or qualification",
    });
    expect(find(ps, "Joined in March 2019")).toMatchObject({ locked: true, lockReason: "contains a date" });

    expect(find(ps, "Experienced test lead").locked).toBe(false);
    expect(find(ps, "Led a team").locked).toBe(false);
    expect(find(ps, "Automation:").locked).toBe(false);
  });

  it("does not lock a long bullet merely for mentioning a locked phrase", async () => {
    const ps = await readDocxParagraphs(await sampleCv(), ["test lead"]);
    // The summary mentions "test lead" but is long prose, not the title line.
    expect(find(ps, "Experienced test lead").locked).toBe(false);
  });

  it("rejects something that is not a Word document", async () => {
    await expect(readDocxParagraphs(Buffer.from("not a docx"))).rejects.toThrow(DocxEditError);
  });
});

describe("applyDocxEdits", () => {
  it("rewrites a paragraph and keeps its paragraph and run formatting", async () => {
    const original = await sampleCv();
    const ps = await readDocxParagraphs(original);
    const summary = find(ps, "Experienced test lead");
    const text = "Test lead in regulated financial services, strongest in API and regression testing.";

    const result = await applyDocxEdits(original, {
      rewrites: [{ paragraph: summary.index, text }],
      remove: [],
    });

    expect(result.rewritten).toEqual([summary.index]);
    const after = await readDocxParagraphs(result.buffer);
    expect(after.map((p) => p.text)).toContain(text);
    expect(after.map((p) => p.text)).not.toContain(SUMMARY);

    const xml = await documentXml(result.buffer);
    const paragraphXml = xml.slice(xml.lastIndexOf("<w:p>", xml.indexOf(text)), xml.indexOf(text));
    expect(paragraphXml).toContain('w:val="both"'); // justified, as before
    expect(paragraphXml).toContain("Georgia"); // the run's font, as before
    expect(paragraphXml).toContain('w:val="22"'); // and its size
  });

  it("keeps a differently formatted lead-in label", async () => {
    const original = await sampleCv();
    const label = find(await readDocxParagraphs(original), "Automation:");

    const result = await applyDocxEdits(original, {
      rewrites: [{ paragraph: label.index, text: "Automation: Postman API suites run nightly in Jenkins." }],
      remove: [],
    });

    const xml = await documentXml(result.buffer);
    // The bold label run survives intact, and the new text follows in its own run.
    expect(xml).toMatch(/<w:b\/>[\s\S]*?Automation:<\/w:t>[\s\S]*? Postman API suites run nightly in Jenkins\.<\/w:t>/);
  });

  it("refuses edits to locked paragraphs, whatever the model returns", async () => {
    const original = await sampleCv();
    const ps = await readDocxParagraphs(original, ["Barclays Bank"]);
    const dated = find(ps, "Senior Test Lead");
    const employer = find(ps, "Barclays Bank");

    const result = await applyDocxEdits(
      original,
      {
        rewrites: [
          { paragraph: dated.index, text: "Head of Quality 2015 - 2023" },
          { paragraph: employer.index, text: "HSBC" },
        ],
        remove: [],
      },
      ["Barclays Bank"],
    );

    expect(result.rewritten).toEqual([]);
    expect(result.rejected.map((r) => r.paragraph).sort()).toEqual(
      [dated.index, employer.index].sort(),
    );
    const texts = (await readDocxParagraphs(result.buffer)).map((p) => p.text);
    expect(texts).toContain("Barclays Bank");
    expect(texts.join("\n")).not.toContain("Head of Quality");
  });

  it("removes a paragraph", async () => {
    const original = await sampleCv();
    const bullet = find(await readDocxParagraphs(original), "Maintained the regression pack");

    const result = await applyDocxEdits(original, { rewrites: [], remove: [bullet.index] });

    expect(result.removed).toEqual([bullet.index]);
    const texts = (await readDocxParagraphs(result.buffer)).map((p) => p.text);
    expect(texts.some((t) => t.startsWith("Maintained the regression pack"))).toBe(false);
    expect(texts.some((t) => t.startsWith("Led a team"))).toBe(true);
  });

  it("caps removals at half the editable paragraphs", async () => {
    const original = await sampleCv();
    const editable = (await readDocxParagraphs(original)).filter((p) => !p.locked);

    const result = await applyDocxEdits(original, {
      rewrites: [],
      remove: editable.map((p) => p.index),
    });

    expect(result.removed.length).toBe(Math.floor(editable.length / 2));
    expect(result.rejected.filter((r) => r.reason === "too many removals").length).toBe(
      editable.length - Math.floor(editable.length / 2),
    );
  });

  it("refuses nonsense: unknown paragraphs, empty text, runaway length, duplicates", async () => {
    const original = await sampleCv();
    const bullet = find(await readDocxParagraphs(original), "Led a team");

    const result = await applyDocxEdits(original, {
      rewrites: [
        { paragraph: 9999, text: "Nope" },
        { paragraph: bullet.index, text: "   " },
        { paragraph: bullet.index, text: "x".repeat(2000) },
      ],
      remove: [-1],
    });

    expect(result.rewritten).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.rejected.map((r) => r.reason)).toEqual(
      expect.arrayContaining(["no such paragraph", "empty text", "rewritten twice"]),
    );
  });

  it("collapses line breaks and tabs in model text, so the paragraph stays one paragraph", async () => {
    const original = await sampleCv();
    const bullet = find(await readDocxParagraphs(original), "Led a team");

    const result = await applyDocxEdits(original, {
      rewrites: [{ paragraph: bullet.index, text: "Led six testers\nacross\tquarterly releases." }],
      remove: [],
    });

    const texts = (await readDocxParagraphs(result.buffer)).map((p) => p.text);
    expect(texts).toContain("Led six testers across quarterly releases.");
  });

  it("never deletes the only paragraph in a table cell, which Word requires", async () => {
    const doc = new Document({
      sections: [
        {
          children: [
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Only paragraph in this cell.")] }),
                    new TableCell({ children: [new Paragraph("Another cell's only paragraph.")] }),
                  ],
                }),
              ],
            }),
          ],
        },
      ],
    });
    const original = Buffer.from(await Packer.toBuffer(doc));
    const cell = find(await readDocxParagraphs(original), "Only paragraph");

    const result = await applyDocxEdits(original, { rewrites: [], remove: [cell.index] });

    expect(result.removed).toEqual([]);
    expect(result.rejected[0]?.reason).toBe("only paragraph in a table cell");
  });

  it("leaves headers, footers and every other part of the file untouched", async () => {
    const original = await sampleCv();
    const bullet = find(await readDocxParagraphs(original), "Led a team");
    const result = await applyDocxEdits(original, {
      rewrites: [{ paragraph: bullet.index, text: "Led six testers." }],
      remove: [],
    });

    const before = await JSZip.loadAsync(original);
    const after = await JSZip.loadAsync(result.buffer);
    expect(Object.keys(after.files).sort()).toEqual(Object.keys(before.files).sort());
    for (const name of Object.keys(before.files)) {
      if (name === "word/document.xml" || before.files[name]!.dir) continue;
      expect(await after.file(name)!.async("string")).toBe(await before.file(name)!.async("string"));
    }
  });
});
