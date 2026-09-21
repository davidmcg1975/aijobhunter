/**
 * Shapes shared by everything that accepts a user's own credentials for an
 * external service. Pure - no database, no environment - so it is unit tested
 * and safe to import from anywhere on the server.
 */

/** One value a user must supply, e.g. Adzuna's "App ID". */
export type CredentialField = {
  name: string;
  label: string;
  /** Checked on save, so a pasted value with the wrong shape is caught early. */
  pattern?: RegExp;
  /** Shown when `pattern` does not match. */
  patternMessage?: string;
};

export type Credentials = Record<string, string>;

/** Longer than any real key, short enough that nobody pastes a document. */
const MAX_LENGTH = 300;

export type CredentialValidation =
  | { ok: true; values: Credentials }
  | { ok: false; error: string };

/**
 * Every field is required: a half-configured provider would fail at search
 * time with a far less helpful message than it gets here.
 */
export function validateCredentialValues(
  fields: CredentialField[],
  input: Record<string, unknown>,
): CredentialValidation {
  const values: Credentials = {};
  for (const field of fields) {
    const raw = input[field.name];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) return { ok: false, error: `Enter the ${field.label}.` };
    if (value.length > MAX_LENGTH) {
      return { ok: false, error: `The ${field.label} is too long to be a real key.` };
    }
    // Keys never contain whitespace; this catches a copy that picked up a
    // label or a line break along with the key.
    if (/\s/.test(value)) {
      return { ok: false, error: `The ${field.label} should not contain spaces.` };
    }
    if (field.pattern && !field.pattern.test(value)) {
      return {
        ok: false,
        error: field.patternMessage ?? `That does not look like a valid ${field.label}.`,
      };
    }
    values[field.name] = value;
  }
  return { ok: true, values };
}

/**
 * The last four characters of the most secret field, so a user can tell which
 * key is saved without the key ever being shown again. Nothing for a value too
 * short for four characters to be safe to reveal.
 */
export function credentialHint(fields: CredentialField[], values: Credentials): string {
  const last = fields[fields.length - 1];
  const value = last ? values[last.name] ?? "" : "";
  return value.length >= 12 ? value.slice(-4) : "";
}
