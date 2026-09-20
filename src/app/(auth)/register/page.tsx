import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth/session";
import { isSignupRestricted } from "@/lib/auth/allowlist";
import { env } from "@/lib/env";

export const metadata = { title: "Create an account" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <RegisterForm inviteOnly={isSignupRestricted(env().ALLOWED_SIGNUP_EMAILS)} />;
}
