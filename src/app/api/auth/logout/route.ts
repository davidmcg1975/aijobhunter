import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { env } from "@/lib/env";

export async function POST() {
  const user = await getCurrentUser();
  if (user) await audit({ action: "user.logout", userId: user.id });
  await destroySession();
  return NextResponse.redirect(new URL("/login", env().APP_URL), 303);
}
