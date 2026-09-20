import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * CVs are personal data. They are stored under a per-user prefix and are only
 * ever read through a function that takes the userId, so a mistaken key cannot
 * return another user's document.
 */

export type StoredFile = {
  key: string;
  size: number;
};

function assertOwnedKey(key: string, userId: string): void {
  if (!key.startsWith(`users/${userId}/`)) {
    throw new Error("Refusing to access a file outside the user's own prefix");
  }
}

function buildKey(userId: string, filename: string): string {
  const safe = path
    .basename(filename)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-100);
  return `users/${userId}/${randomUUID()}-${safe}`;
}

export async function putFile(
  userId: string,
  filename: string,
  data: Buffer,
): Promise<StoredFile> {
  const key = buildKey(userId, filename);
  const config = env();

  if (config.STORAGE_DRIVER === "vercel-blob") {
    const { put } = await import("@vercel/blob");
    await put(key, data, {
      access: "public",
      addRandomSuffix: false,
      token: config.BLOB_READ_WRITE_TOKEN,
    });
    return { key, size: data.byteLength };
  }

  const full = path.join(config.STORAGE_LOCAL_DIR, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return { key, size: data.byteLength };
}

export async function getFile(userId: string, key: string): Promise<Buffer> {
  assertOwnedKey(key, userId);
  const config = env();

  if (config.STORAGE_DRIVER === "vercel-blob") {
    const { head } = await import("@vercel/blob");
    const meta = await head(key, { token: config.BLOB_READ_WRITE_TOKEN });
    const response = await fetch(meta.url);
    if (!response.ok) throw new Error("Stored file could not be read");
    return Buffer.from(await response.arrayBuffer());
  }

  return readFile(path.join(config.STORAGE_LOCAL_DIR, key));
}

export async function deleteFile(userId: string, key: string): Promise<void> {
  assertOwnedKey(key, userId);
  const config = env();

  if (config.STORAGE_DRIVER === "vercel-blob") {
    const { del } = await import("@vercel/blob");
    await del(key, { token: config.BLOB_READ_WRITE_TOKEN }).catch(() => {});
    return;
  }

  await unlink(path.join(config.STORAGE_LOCAL_DIR, key)).catch(() => {});
}
