import "server-only";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { Role, User } from "@prisma/client";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "ach_session";
export const CSRF_COOKIE = "ach_csrf";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const SESSION_REFRESH_MS = 1000 * 60 * 60 * 24; // extend at most daily

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: Date | null;
};

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}

/**
 * Issues a new session. The raw token only ever exists in the response cookie;
 * the database stores its SHA-256 hash, so a database dump cannot be replayed.
 */
export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const csrf = newToken();
  const hdrs = await headers();

  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: hdrs.get("user-agent")?.slice(0, 500) ?? null,
    },
  });

  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";

  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  // Double-submit CSRF token: readable by our own scripts, compared against
  // the value posted back in the form/header.
  jar.set(CSRF_COOKIE, csrf, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/**
 * Resolves the signed-in user, or null. Cached per request so that a page
 * rendering several server components only hits the database once.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.disabledAt) return null;

  // Sliding expiry, written at most once a day to avoid a write per request.
  if (Date.now() - session.lastUsedAt.getTime() > SESSION_REFRESH_MS) {
    await prisma.session
      .update({
        where: { id: session.id },
        data: {
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      })
      .catch(() => {});
  }

  return toSessionUser(session.user);
});

/** Throws a redirect-worthy error if nobody is signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ForbiddenError();
  return user;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Not permitted");
    this.name = "ForbiddenError";
  }
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: sha256(token) } })
      .catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}

/** Signs every other device out - used after a password change. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * Double-submit CSRF check. Cookie value must equal the submitted value.
 * Next.js server actions already carry origin checks; this covers our
 * route handlers that accept form posts.
 */
export async function assertCsrf(submitted: string | null | undefined) {
  const jar = await cookies();
  const expected = jar.get(CSRF_COOKIE)?.value;
  if (!expected || !submitted) throw new ForbiddenError();

  const a = Buffer.from(expected);
  const b = Buffer.from(submitted);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ForbiddenError();
  }
}

export async function getCsrfToken(): Promise<string> {
  const jar = await cookies();
  return jar.get(CSRF_COOKIE)?.value ?? "";
}
