import { describe, expect, it } from "vitest";
import { decryptSecret, DecryptionError, encryptSecret } from "@/lib/security/encryption";
import {
  credentialHint,
  validateCredentialValues,
  type CredentialField,
} from "@/lib/credentials/fields";
import { allSources } from "@/lib/jobsources/registry";
import { AI_PROVIDERS, AI_PROVIDER_IDS } from "@/lib/ai/credentials";

const SECRET = "a-test-auth-secret-that-is-at-least-32-chars";
const CONTEXT = "user_1:anthropic";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a value", () => {
    const payload = encryptSecret("sk-ant-api03-example", SECRET, CONTEXT);
    expect(decryptSecret(payload, SECRET, CONTEXT)).toBe("sk-ant-api03-example");
  });

  it("does not contain the plaintext", () => {
    const payload = encryptSecret("sk-ant-api03-example", SECRET, CONTEXT);
    expect(payload).not.toContain("sk-ant");
    expect(payload.startsWith("v1.")).toBe(true);
  });

  it("uses a fresh IV, so the same value never encrypts the same way twice", () => {
    const a = encryptSecret("same", SECRET, CONTEXT);
    const b = encryptSecret("same", SECRET, CONTEXT);
    expect(a).not.toBe(b);
  });

  it("refuses to decrypt under a different AUTH_SECRET", () => {
    const payload = encryptSecret("value", SECRET, CONTEXT);
    expect(() => decryptSecret(payload, `${SECRET}-rotated`, CONTEXT)).toThrow(DecryptionError);
  });

  // The isolation property: a row copied onto another user cannot be read.
  it("refuses to decrypt for another user", () => {
    const payload = encryptSecret("value", SECRET, "user_1:anthropic");
    expect(() => decryptSecret(payload, SECRET, "user_2:anthropic")).toThrow(DecryptionError);
  });

  it("refuses to decrypt for another provider", () => {
    const payload = encryptSecret("value", SECRET, "user_1:adzuna");
    expect(() => decryptSecret(payload, SECRET, "user_1:careerjet")).toThrow(DecryptionError);
  });

  it("detects tampering", () => {
    const payload = encryptSecret("value", SECRET, CONTEXT);
    const parts = payload.split(".");
    const body = Buffer.from(parts[3]!, "base64url");
    body[0] = body[0]! ^ 0xff;
    parts[3] = body.toString("base64url");
    expect(() => decryptSecret(parts.join("."), SECRET, CONTEXT)).toThrow(DecryptionError);
  });

  it("rejects malformed payloads rather than crashing", () => {
    for (const bad of ["", "v1", "v2.a.b.c", "v1.a.b", "not.base64.at.all!"]) {
      expect(() => decryptSecret(bad, SECRET, CONTEXT)).toThrow(DecryptionError);
    }
  });
});

const TWO_FIELDS: CredentialField[] = [
  { name: "appId", label: "App ID" },
  { name: "appKey", label: "App Key", pattern: /^[a-f0-9]+$/, patternMessage: "Hex only." },
];

describe("validateCredentialValues", () => {
  it("accepts and trims complete input", () => {
    const result = validateCredentialValues(TWO_FIELDS, {
      appId: "  abc123 ",
      appKey: "deadbeef\n",
    });
    expect(result).toEqual({ ok: true, values: { appId: "abc123", appKey: "deadbeef" } });
  });

  it("requires every field", () => {
    const result = validateCredentialValues(TWO_FIELDS, { appId: "abc123" });
    expect(result).toEqual({ ok: false, error: "Enter the App Key." });
  });

  it("treats a non-string (a missing form field) as empty", () => {
    const result = validateCredentialValues(TWO_FIELDS, { appId: null, appKey: "ab" });
    expect(result.ok).toBe(false);
  });

  it("rejects internal whitespace, which means extra text was copied", () => {
    const result = validateCredentialValues(TWO_FIELDS, { appId: "App ID: abc", appKey: "ab" });
    expect(result).toEqual({ ok: false, error: "The App ID should not contain spaces." });
  });

  it("applies the field's pattern and message", () => {
    const result = validateCredentialValues(TWO_FIELDS, { appId: "abc", appKey: "XYZ" });
    expect(result).toEqual({ ok: false, error: "Hex only." });
  });

  it("rejects absurdly long input", () => {
    const result = validateCredentialValues(TWO_FIELDS, { appId: "a".repeat(301), appKey: "ab" });
    expect(result.ok).toBe(false);
  });
});

describe("credentialHint", () => {
  it("reveals only the last four characters of the last field", () => {
    expect(
      credentialHint(TWO_FIELDS, { appId: "id", appKey: "0123456789abcdef" }),
    ).toBe("cdef");
  });

  it("reveals nothing of a value too short for that to be safe", () => {
    expect(credentialHint(TWO_FIELDS, { appId: "id", appKey: "short" })).toBe("");
  });
});

// Realistic shapes (not real keys) for each provider, so a pattern that is too
// strict is caught here rather than by a user who cannot save a genuine key.
const EXAMPLE_KEYS: Record<string, Record<string, string>> = {
  anthropic: { apiKey: "sk-ant-api03-AbC_dEf-123456789012345678901234567890" },
  openai: { apiKey: "sk-proj-AbC_dEf-123456789012345678901234567890" },
  adzuna: { appId: "1a2b3c4d", appKey: "0123456789abcdef0123456789abcdef" },
  reed: { apiKey: "12345678-abcd-4ef0-9876-0123456789ab" },
  careerjet: { apiKey: "0123456789abcdef0123456789abcdef" },
};

describe("provider credential fields", () => {
  const providers = [
    ...AI_PROVIDER_IDS.map((id) => ({ id, fields: AI_PROVIDERS[id].fields })),
    ...allSources().map((s) => ({ id: s.id, fields: s.credentialFields })),
  ];

  it("has an example for every provider, so a new one cannot skip this test", () => {
    expect(providers.map((p) => p.id).sort()).toEqual(Object.keys(EXAMPLE_KEYS).sort());
  });

  for (const provider of providers) {
    it(`${provider.id} accepts a correctly shaped key`, () => {
      const result = validateCredentialValues(provider.fields, EXAMPLE_KEYS[provider.id]!);
      expect(result.ok).toBe(true);
    });
  }

  it("anthropic rejects something that is not an Anthropic key", () => {
    const result = validateCredentialValues(AI_PROVIDERS.anthropic.fields, {
      apiKey: "0123456789abcdef0123456789abcdef",
    });
    expect(result).toEqual({ ok: false, error: "An Anthropic API key starts with sk-ant-." });
  });
});
