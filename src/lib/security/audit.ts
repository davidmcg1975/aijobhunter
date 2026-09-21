import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Audit actions. Keep this list closed so log analysis stays reliable and
 * nobody invents an action name that quietly carries a payload.
 */
export type AuditAction =
  | "user.register"
  | "user.register_refused"
  | "user.login"
  | "user.login_failed"
  | "user.logout"
  | "user.email_verified"
  | "user.password_reset_requested"
  | "user.password_reset_completed"
  | "user.password_changed"
  | "user.deleted"
  | "user.data_exported"
  | "credentials.saved"
  | "credentials.removed"
  | "ai.provider_changed"
  | "cv.uploaded"
  | "cv.deleted"
  | "cv.tailored"
  | "cv.exported"
  | "profile.updated"
  | "job.analysed"
  | "job.description_added"
  | "job.matched"
  | "application.created"
  | "application.status_changed"
  | "application.deleted"
  | "coverletter.generated"
  | "admin.user_disabled"
  | "admin.user_enabled"
  | "admin.user_deleted"
  | "admin.viewed_users";

/**
 * Values that must never reach the audit log, even by accident.
 * See docs/security.md - we log that a CV was uploaded, never its contents.
 */
const FORBIDDEN_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "tokenHash",
  "apiKey",
  "app_key",
  "appKey",
  "secret",
  "authorization",
  "cvText",
  "extractedText",
  "content",
]);

function scrub(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    // Never store long free text - it is almost certainly user content.
    if (typeof value === "string" && value.length > 500) {
      out[key] = `${value.slice(0, 200)}...[truncated]`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export async function audit(params: {
  action: AuditAction;
  userId?: string | null;
  actorId?: string | null;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const hdrs = await headers();
    ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    userAgent = hdrs.get("user-agent")?.slice(0, 300) ?? null;
  } catch {
    // Called outside a request (background worker) - headers are unavailable.
  }

  await prisma.auditLog
    .create({
      data: {
        action: params.action,
        userId: params.userId ?? null,
        actorId: params.actorId ?? null,
        entity: params.entity ?? null,
        entityId: params.entityId ?? null,
        ip,
        userAgent,
        metadata: params.metadata
          ? (scrub(params.metadata) as Prisma.InputJsonValue)
          : undefined,
      },
    })
    // Auditing must never break the user-facing operation.
    .catch((error) => {
      console.error("[audit] failed to write audit log", {
        action: params.action,
        error: error instanceof Error ? error.message : "unknown",
      });
    });
}
