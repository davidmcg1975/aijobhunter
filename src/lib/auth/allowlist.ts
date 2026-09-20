/**
 * Who is allowed to create an account.
 *
 * This application holds CVs and full employment histories. It is intended for
 * a named handful of people, not the public, so registration is closed by
 * default in any deployment that sets ALLOWED_SIGNUP_EMAILS.
 *
 * Pure so it can be unit tested; the caller supplies the configured list.
 */

/** Parses the configured list. Case and surrounding whitespace are ignored. */
export function parseAllowedEmails(configured: string): string[] {
  return configured
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * True when this address may register.
 *
 * An empty list means the allowlist is switched off. That is deliberate - it
 * keeps local development frictionless - but it means the deployment checklist
 * must set it, so `isSignupRestricted()` exists for the UI to say which mode
 * it is in rather than leaving it ambiguous.
 */
export function isEmailAllowedToSignUp(
  email: string,
  configured: string,
): boolean {
  const allowed = parseAllowedEmails(configured);
  if (allowed.length === 0) return true;
  return allowed.includes(email.trim().toLowerCase());
}

export function isSignupRestricted(configured: string): boolean {
  return parseAllowedEmails(configured).length > 0;
}
