import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Re-imports a CV file that is already in the storage directory, running the
 * same extraction the upload form does.
 *
 * Exists because the uploaded file survives a database rebuild but the
 * extracted text does not. Usage:
 *
 *   npm run cv:restore -- <path to file> <account email>
 */
let failed = false;

async function main() {
  const [filePath, email = "demo@example.com"] = process.argv.slice(2);
  if (!filePath) {
    console.error("Usage: npm run cv:restore -- <file> [email]");
    process.exit(1);
  }

  // Imported after the argument check so a usage error does not open the
  // database, and only ever through the shared client - never a second one.
  const { prisma } = await import("../src/lib/db");
  const { extractCvText } = await import("../src/lib/cv/extract");
  const { extractCvStructure } = await import("../src/lib/ai/cv-extraction");

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`No account for ${email}`);

    const data = await readFile(filePath);
    const fileName = path.basename(filePath).replace(/^[0-9a-f-]{36}-/, "");

    console.log(`Extracting text from ${fileName} (${data.byteLength} bytes)...`);
    const { text } = await extractCvText(data, fileName);
    console.log(`  ${text.length} characters extracted`);

    await prisma.cv.updateMany({
      where: { userId: user.id, isMaster: true },
      data: { isMaster: false, kind: "TAILORED" },
    });

    const cv = await prisma.cv.create({
      data: {
        userId: user.id,
        name: "Master CV",
        kind: "MASTER",
        isMaster: true,
        fileName,
        fileMimeType: fileName.endsWith(".pdf")
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSize: data.byteLength,
        extractedText: text,
      },
    });

    if (process.env.ANTHROPIC_API_KEY) {
      console.log("Running AI extraction (this takes about a minute)...");
      const structured = await extractCvStructure({
        cvId: cv.id,
        userId: user.id,
        text,
      });
      const undated = structured.experiences.filter((e) => !e.startDate).length;
      console.log(`  ${structured.experiences.length} roles found, ${undated} without a date`);
      console.log(`  ${structured.technologies.length} technologies, ${structured.industries.length} industries`);
      console.log("\nNot yet applied to the profile - confirm that in the app.");
    } else {
      console.log("ANTHROPIC_API_KEY not set - stored the text only.");
    }

    console.log(`\nMaster CV restored for ${email}.`);
  } finally {
    // Order matters. Disconnect first: PGlite flushes to disk on close, and
    // exiting before that completes truncates the data directory. Then exit
    // explicitly, because PGlite keeps the event loop alive and the process
    // would otherwise hang forever after finishing its work.
    await prisma.$disconnect();
    // Exit explicitly with our own status: PGlite keeps the event loop alive
    // and can set a non-zero exitCode during WASM teardown, which would report
    // a successful run as a failure.
    process.exit(failed ? 1 : 0);
  }
}

main().catch((error) => {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
});
