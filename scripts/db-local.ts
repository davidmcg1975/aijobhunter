import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Deliberately NOT imported from src/lib/db: that module opens a PGlite
// instance at import time, and two instances on one directory in the same
// process corrupt it. This script owns the only connection it makes.
function isEmbeddedDatabase(url: string): boolean {
  return url.startsWith("file:") || url.startsWith("pglite:");
}

function embeddedDataDir(url: string): string {
  const raw = url.replace(/^file:/, "").replace(/^pglite:/, "") || "./.pglite";
  return path.resolve(process.cwd(), raw);
}

/**
 * Creates the schema in the embedded PGlite database.
 *
 * `prisma db push` talks to a real server over the wire and cannot reach an
 * in-process database, so instead we ask Prisma to emit the DDL it would have
 * applied and run that ourselves. The schema is therefore still generated from
 * prisma/schema.prisma - there is no second, hand-maintained copy to drift.
 *
 *   npm run db:local          create the schema
 *   npm run db:local -- --reset   delete the database first
 */
async function main() {
  const url = process.env.DATABASE_URL ?? "";

  if (!isEmbeddedDatabase(url)) {
    console.error(
      `DATABASE_URL is "${url.split("@")[0]}..." which is a real server.\n` +
        `Use "npm run db:push" for that. This script is only for the embedded\n` +
        `database (DATABASE_URL="file:./.pglite").`,
    );
    process.exit(1);
  }

  const dir = embeddedDataDir(url);

  if (process.argv.includes("--reset") && existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`Removed existing database at ${dir}`);
  }

  console.log("Generating schema SQL from prisma/schema.prisma...");
  // shell: true is required on Windows, where npx is a .cmd and cannot be
  // spawned directly.
  const sql = execFileSync(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      "prisma/schema.prisma",
      "--script",
    ],
    {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      shell: true,
    },
  );

  // Prisma prefixes each statement with a "-- CreateTable" style comment and
  // the CLI writes a "Loaded Prisma config" banner to stdout. Strip both, then
  // split - filtering whole chunks by a leading "--" would drop everything.
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .filter((line) => !line.startsWith("Loaded Prisma config"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (statements.length === 0) {
    console.error("No SQL was generated - check prisma/schema.prisma.");
    process.exit(1);
  }

  console.log(`Applying ${statements.length} statements to ${dir}...`);

  const db = new PGlite(dir);
  await db.waitReady;

  let applied = 0;
  for (const statement of statements) {
    try {
      await db.exec(`${statement};`);
      applied += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Re-running the script over an existing database is expected to hit
      // "already exists"; anything else is a real problem.
      if (/already exists/i.test(message)) continue;
      console.error(`\nFailed on:\n${statement.slice(0, 300)}\n\n${message}`);
      await db.close();
      process.exit(1);
    }
  }

  await applyLocalMigrations(db, applied > 0);

  const tables = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`,
  );

  // Must be awaited. PGlite flushes its WASM filesystem to disk on close, and
  // exiting the process before that completes leaves the data directory
  // truncated - the database then fails to open with a bare "Aborted()".
  await db.close();

  console.log(`\nDone. ${applied} statements applied, ${tables.rows[0]?.count} tables present.`);
  console.log(`\nNext:  npm run db:seed   then   npm run dev`);
  // Deliberately no process.exit() here - see the close() note above.
}

/**
 * Applies hand-written SQL from prisma/migrations-local in filename order.
 *
 * The base schema above is generated from the current schema.prisma, so a
 * freshly created database already contains everything these migrations would
 * add. In that case they are recorded as applied without being run; on an
 * existing database they are run, which is what makes a schema change possible
 * without deleting real data.
 */
async function applyLocalMigrations(
  db: PGlite,
  databaseWasJustCreated: boolean,
): Promise<void> {
  const { readdirSync, readFileSync } = await import("node:fs");

  await db.exec(`
    CREATE TABLE IF NOT EXISTS "_LocalMigration" (
      "name" TEXT PRIMARY KEY,
      "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const dir = path.resolve("prisma", "migrations-local");
  let files: string[] = [];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return; // No migrations directory yet.
  }
  if (files.length === 0) return;

  const done = await db.query<{ name: string }>(
    `SELECT "name" FROM "_LocalMigration"`,
  );
  const alreadyApplied = new Set(done.rows.map((r) => r.name));

  for (const file of files) {
    if (alreadyApplied.has(file)) continue;

    if (databaseWasJustCreated) {
      await db.query(`INSERT INTO "_LocalMigration" ("name") VALUES ($1)`, [file]);
      console.log(`  migration ${file}: already in the base schema, recorded`);
      continue;
    }

    const sql = readFileSync(path.join(dir, file), "utf8");
    try {
      await db.exec(sql);
      await db.query(`INSERT INTO "_LocalMigration" ("name") VALUES ($1)`, [file]);
      console.log(`  migration ${file}: applied`);
    } catch (error) {
      console.error(
        `\nMigration ${file} failed:\n${error instanceof Error ? error.message : error}`,
      );
      await db.close();
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
