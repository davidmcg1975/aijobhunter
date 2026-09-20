import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations must not go through a connection pooler. Neon's pooled
    // endpoint runs PgBouncer in transaction mode, which breaks the session
    // state and advisory locks that DDL relies on. DATABASE_URL_DIRECT is the
    // unpooled endpoint; the app itself uses the pooled one.
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL,
  },
});
