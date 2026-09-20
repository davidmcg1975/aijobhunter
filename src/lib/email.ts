import "server-only";
import { env, features } from "@/lib/env";

/**
 * Transactional email. When SMTP is not configured (local development, and the
 * first deployment before a mail provider is set up) the message is logged to
 * the server console instead, so verification and reset flows remain testable.
 *
 * Only the link is logged - never the recipient's other details.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail(message: EmailMessage): Promise<void> {
  const config = env();

  if (!features.email()) {
    console.warn(
      [
        "",
        "─".repeat(70),
        "  EMAIL NOT SENT - SMTP_URL is not configured.",
        `  To:      ${message.to}`,
        `  Subject: ${message.subject}`,
        "",
        message.text,
        "─".repeat(70),
        "",
      ].join("\n"),
    );
    return;
  }

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(config.SMTP_URL);

  await transport.sendMail({
    from: config.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

export function verificationEmail(name: string, link: string): Omit<EmailMessage, "to"> {
  return {
    subject: "Confirm your email address",
    text: `Hello ${name},

Please confirm your email address to finish setting up your AI Contract Hunter account:

${link}

This link expires in 24 hours. If you did not create an account, ignore this email.
`,
  };
}

export function passwordResetEmail(name: string, link: string): Omit<EmailMessage, "to"> {
  return {
    subject: "Reset your password",
    text: `Hello ${name},

Someone asked to reset the password for your AI Contract Hunter account. If it was you, use this link:

${link}

This link expires in one hour and can only be used once.

If it was not you, ignore this email - your password has not been changed.
`,
  };
}
