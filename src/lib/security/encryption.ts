import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for secrets a user gives us - their own API keys.
 *
 * AES-256-GCM, with the key derived from AUTH_SECRET rather than a second
 * environment variable: one fewer thing to configure, and a key that is never
 * stored anywhere. The consequence is deliberate and documented - rotating
 * AUTH_SECRET makes saved keys unreadable, and users are asked to enter them
 * again rather than the app failing.
 *
 * Pure (the secret is a parameter) so it can be unit tested.
 */

const VERSION = "v1";
const IV_BYTES = 12;

export class DecryptionError extends Error {
  constructor() {
    super("The stored value could not be decrypted");
    this.name = "DecryptionError";
  }
}

function deriveKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", secret, "ai-contract-hunter", "api-credentials:v1", 32),
  );
}

/**
 * `context` is bound in as additional authenticated data. Passing
 * `userId:provider` means a ciphertext copied onto another user's row, or
 * another provider's, fails to decrypt instead of quietly working.
 */
export function encryptSecret(plaintext: string, secret: string, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, body].map((part) =>
    typeof part === "string" ? part : part.toString("base64url"),
  ).join(".");
}

export function decryptSecret(payload: string, secret: string, context: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new DecryptionError();
  try {
    const [, iv, tag, body] = parts.map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv!);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag!);
    return Buffer.concat([decipher.update(body!), decipher.final()]).toString("utf8");
  } catch {
    throw new DecryptionError();
  }
}
