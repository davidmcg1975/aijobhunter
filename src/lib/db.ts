import path from "node:path";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

// The package is ESM ("type": "module"), so a synchronous require needs this.
const require = createRequire(import.meta.url);

/**
 * Prisma 7 connects through a driver adapter rather than a schema-level url,
 * so the connection string stays in the server environment only.
 *
 * Two drivers are supported, chosen by the shape of DATABASE_URL:
 *
 *   file:./.pglite        -> PGlite, a real PostgreSQL compiled to WebAssembly
 *                            that runs in-process. No server to install and no
 *                            account to create, which makes first-run trivial.
 *   postgresql://...      -> node-postgres, for Neon/Supabase/any real server.
 *
 * The application code is identical either way: PGlite is PostgreSQL, not a
 * substitute for it, so behaviour does not diverge between local and deployed.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function isEmbeddedDatabase(url = process.env.DATABASE_URL ?? ""): boolean {
  return url.startsWith("file:") || url.startsWith("pglite:");
}

/**
 * Filesystem path PGlite persists to, derived from the URL.
 *
 * Always absolute: Next.js server code does not reliably run with the project
 * root as its working directory, and PGlite rejects a relative path with
 * "File URL path must be absolute".
 */
export function embeddedDataDir(url = process.env.DATABASE_URL ?? ""): string {
  const raw = url.replace(/^file:/, "").replace(/^pglite:/, "") || "./.pglite";
  return path.resolve(process.cwd(), raw);
}

/**
 * PGlite is an in-process database with no server, so two Node processes
 * opening the same directory each get their own copy and the last one to
 * flush silently discards the other's writes.
 *
 * That is data loss with no error, and it is easy to trigger: run
 * `npm run db:seed` or `npm run jobs:fetch` while `npm run dev` is running.
 * This turns it into a refusal with an explanation.
 *
 * A real PostgreSQL server has none of this problem - the lock applies only to
 * the embedded driver.
 */
function acquireEmbeddedLock(dataDir: string): void {
  const fs = require("node:fs") as typeof import("node:fs");
  const lockPath = path.join(dataDir, ".owner.lock");

  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {
    // Directory already exists, or PGlite will fail informatively later.
  }

  // The check is deliberately one-directional. The web server always takes the
  // lock and never refuses: it may run as several processes, and a server
  // killed rather than stopped leaves a stale lock behind, so refusing here
  // would break the app for a condition it cannot resolve. CLI scripts do
  // refuse - that is the case where a second writer causes data loss, and
  // where the fix ("stop the dev server") is obvious and actionable.
  const isWebServer = Boolean(process.env.NEXT_RUNTIME);

  if (!isWebServer && fs.existsSync(lockPath)) {
    const holder = Number(fs.readFileSync(lockPath, "utf8").trim());
    if (Number.isFinite(holder) && holder !== process.pid && isProcessAlive(holder)) {
      throw new Error(
        `The embedded database at ${dataDir} looks like it is already open ` +
          `in process ${holder}.\n\n` +
          `PGlite allows one process at a time - a second one silently ` +
          `discards the first one's writes.\n` +
          `Stop the dev server, then run this again.\n\n` +
          `If nothing else is running, the lock is stale: delete\n` +
          `${lockPath}\n\n` +
          `To run scripts and the dev server together, use a real PostgreSQL ` +
          `server and set DATABASE_URL to its connection string.`,
      );
    }
  }

  fs.writeFileSync(lockPath, String(process.pid), "utf8");

  const release = () => {
    try {
      if (
        fs.existsSync(lockPath) &&
        fs.readFileSync(lockPath, "utf8").trim() === String(process.pid)
      ) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      // Best effort - a stale lock is detected by the liveness check above.
    }
  };

  process.once("exit", release);

  // Close the database before exiting, not just release the lock. PGlite
  // flushes its WASM filesystem to disk on close; a process that dies without
  // closing leaves the data directory truncated, and the next open fails with
  // a bare "Aborted()". Ctrl-C is normal usage, so this path has to be clean.
  const shutdown = async (code: number) => {
    try {
      const client = globalForPrisma.prisma;
      if (client) await client.$disconnect();
    } catch {
      // Nothing useful to do while exiting.
    }
    release();
    process.exit(code);
  };

  process.once("SIGINT", () => void shutdown(130));
  process.once("SIGTERM", () => void shutdown(143));
}

function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 performs the permission/existence check without signalling.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set - see .env.example");
  }

  if (isEmbeddedDatabase(connectionString)) {
    const dataDir = embeddedDataDir(connectionString);
    acquireEmbeddedLock(dataDir);

    // Required synchronously here, because the Prisma client must be
    // constructed with its adapter and this module is imported at module scope.
    const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
    const { PrismaPGlite } = require("pglite-prisma-adapter") as {
      PrismaPGlite: new (client: unknown) => never;
    };
    const pglite = new PGlite(dataDir);
    return new PrismaClient({
      adapter: new PrismaPGlite(pglite),
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }

  const { PrismaPg } = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");

  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      // Serverless Postgres suspends when idle and its pooler drops idle
      // connections. With the pg defaults we keep handing Prisma sockets the
      // server has already closed, which surfaces as
      // "Server has closed the connection." on an ordinary query.
      //
      // Expiring our own connections well before the server does means we
      // open a fresh one instead of reusing a dead one.
      idleTimeoutMillis: 10_000,
      // Generous, because the first request after the compute has scaled to
      // zero has to wait for it to wake.
      connectionTimeoutMillis: 20_000,
      max: 10,
      keepAlive: true,
    }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  return withConnectionRetry(client);
}

/** Transient connection failures - safe to retry, unlike a real query error. */
function isTransientConnectionError(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  if (code && ["P1001", "P1002", "P1017"].includes(code)) return true;

  const message = error instanceof Error ? error.message : String(error);
  return /closed the connection|Connection terminated|ECONNRESET|socket hang up|Timed out fetching a new connection/i.test(
    message,
  );
}

/**
 * Retries a query once when the connection died underneath it.
 *
 * Scale-to-zero makes this routine rather than exceptional: the first request
 * after a quiet spell can land on a connection the server has already dropped,
 * and the user sees a crash for what is really a cold start. The retry is
 * deliberately narrow - only connection-level failures, only one attempt, with
 * a short pause for the compute to wake. A genuine query error still throws
 * immediately.
 */
function withConnectionRetry(client: PrismaClient): PrismaClient {
  return client.$extends({
    name: "retry-transient-connection-errors",
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (!isTransientConnectionError(error)) throw error;

          console.warn(
            "[db] connection lost, retrying once (the database may be waking up)",
          );
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          return query(args);
        }
      },
    },
  }) as unknown as PrismaClient;
}

/**
 * Connects on first use, not on import.
 *
 * This matters beyond tidiness. With an embedded database, constructing the
 * client opens PGlite and takes the directory lock, so an eager module-level
 * client meant that merely *importing* anything in this project - a job source
 * adapter, a pure helper that happens to sit beside one - opened a database.
 * That is how a second PGlite instance got opened in one process and corrupted
 * the data directory, and it is also what made adapters impossible to unit
 * test. Nothing connects now until a query is actually issued.
 */
function resolveClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = resolveClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return property in resolveClient();
  },
});
