"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env, features } from "@/lib/env";
import { audit } from "@/lib/security/audit";
import {
  RateLimitedError,
  checkRateLimit,
  clientIp,
} from "@/lib/security/rate-limit";
import { passwordResetEmail, sendEmail, verificationEmail } from "@/lib/email";
import { createSession, destroyAllSessions, destroySession } from "./session";
import {
  fakeVerify,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "./password";
import { consumeToken, issueToken } from "./tokens";
import { isEmailAllowedToSignUp } from "./allowlist";

export type FormState = { error?: string; success?: string };

const registerSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(255),
  password: z.string().min(1, "Enter a password"),
  acceptTerms: z.literal("on", {
    message: "You must accept the terms and privacy policy",
  }),
});

export async function registerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    acceptTerms: formData.get("acceptTerms"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form and try again",
    };
  }

  const passwordProblems = validatePassword(parsed.data.password);
  if (passwordProblems.length > 0) {
    return { error: passwordProblems[0] };
  }

  try {
    await checkRateLimit("register", await clientIp());
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { error: "Too many accounts created from here. Try again later." };
    }
    throw error;
  }

  const { name, email, password } = parsed.data;

  // Closed registration. Checked before anything is created, and phrased so it
  // does not reveal which addresses are on the list.
  if (!isEmailAllowedToSignUp(email, env().ALLOWED_SIGNUP_EMAILS)) {
    await audit({
      action: "user.register_refused",
      metadata: { reason: "not_on_allowlist" },
    });
    return {
      error:
        "This application is invite-only. That email address cannot create an account.",
    };
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Registering with an address that already has an account must not confirm
    // that fact, so the response is identical either way.
    await sendEmail({
      to: email,
      subject: "Someone tried to register with your email address",
      text: `Hello,

Someone tried to create an AI Contract Hunter account with this email address, but one already exists.

If it was you, sign in instead - or reset your password if you have forgotten it.
`,
    });
    redirect(afterRegistration());
  }

  const isFirstUser = (await prisma.user.count()) === 0;

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      acceptedTermsAt: new Date(),
      aiProcessingConsentAt: new Date(),
      // The first account to register becomes the administrator.
      role: isFirstUser ? "ADMIN" : "USER",
    },
  });

  await prisma.profile.create({ data: { userId: user.id } });

  const token = await issueToken(user.id, "EMAIL_VERIFICATION");
  const link = `${env().APP_URL}/verify-email?token=${token}`;
  await sendEmail({ to: email, ...verificationEmail(name, link) });

  await audit({ action: "user.register", userId: user.id });

  redirect(afterRegistration());
}

/**
 * Where registration lands. Without email configured there is no message to
 * check, so the user goes straight to sign in. Both outcomes - new account or
 * existing one - land on the same page, so it still does not reveal whether an
 * address was already registered.
 */
function afterRegistration(): string {
  return features.email() ? "/register/check-email" : "/login?registered=1";
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export async function loginAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter your email address and password" };
  }

  const { email, password } = parsed.data;

  try {
    // Limited per address and per source, so an attacker hammering one IP
    // cannot lock every account, and vice versa.
    await checkRateLimit("login", email);
    await checkRateLimit("login", await clientIp());
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return {
        error: `Too many sign-in attempts. Try again in ${Math.ceil(
          error.retryAfterSeconds / 60,
        )} minutes.`,
      };
    }
    throw error;
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Spend the same time as a real check so timing cannot reveal accounts.
    await fakeVerify();
    await audit({ action: "user.login_failed", metadata: { reason: "no_account" } });
    return { error: "Those details are not correct" };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await audit({
      action: "user.login_failed",
      userId: user.id,
      metadata: { reason: "bad_password" },
    });
    return { error: "Those details are not correct" };
  }

  if (user.disabledAt) {
    return { error: "This account has been disabled. Contact the administrator." };
  }

  await createSession(user.id);
  await audit({ action: "user.login", userId: user.id });

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function requestPasswordResetAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter a valid email address" };

  try {
    await checkRateLimit("passwordReset", parsed.data.email);
    await checkRateLimit("passwordReset", await clientIp());
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return { error: "Too many requests. Try again later." };
    }
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (user && !user.disabledAt) {
    const token = await issueToken(user.id, "PASSWORD_RESET");
    const link = `${env().APP_URL}/reset-password?token=${token}`;
    await sendEmail({ to: user.email, ...passwordResetEmail(user.name, link) });
    await audit({ action: "user.password_reset_requested", userId: user.id });
  }

  // Always the same answer, whether or not the address exists.
  return {
    success:
      "If that address has an account, a reset link is on its way. Check your inbox.",
  };
}

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1, "Enter a new password"),
});

export async function resetPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: "Enter a new password" };

  const problems = validatePassword(parsed.data.password);
  if (problems.length > 0) return { error: problems[0] };

  const userId = await consumeToken(parsed.data.token, "PASSWORD_RESET");
  if (!userId) {
    return { error: "That reset link is invalid or has expired. Request a new one." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });

  // Anyone signed in with the old password is signed out.
  await destroyAllSessions(userId);
  await audit({ action: "user.password_reset_completed", userId });

  redirect("/login?reset=1");
}

export async function verifyEmailAction(token: string): Promise<boolean> {
  const userId = await consumeToken(token, "EMAIL_VERIFICATION");
  if (!userId) return false;

  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: new Date() },
  });
  await audit({ action: "user.email_verified", userId });
  return true;
}
