import bcrypt from "bcryptjs";

/**
 * Cost 12 is the current sensible default for interactive logins:
 * roughly 200-300ms on typical server hardware.
 */
const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Burns roughly the same time as a real verification so that a missing account
 * and a wrong password cannot be told apart by response timing.
 */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.9EFRcVbLPPnGdQnPZ9YQGxvGkFbNqOu";

export async function fakeVerify(): Promise<void> {
  await bcrypt.compare("not-a-real-password", DUMMY_HASH);
}

export type PasswordProblem = string;

/**
 * Deliberately simple rules: length does more for real-world security than
 * character-class requirements, which mostly push people towards "Passw0rd!".
 */
export function validatePassword(plain: string): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  if (plain.length < 12) {
    problems.push("Password must be at least 12 characters long");
  }
  if (plain.length > 200) {
    problems.push("Password must be 200 characters or fewer");
  }
  const common = [
    "password",
    "12345678",
    "qwertyuiop",
    "letmein",
    "welcome1",
    "contractor",
  ];
  if (common.some((c) => plain.toLowerCase().includes(c))) {
    problems.push("Password contains an easily guessed word");
  }
  return problems;
}
