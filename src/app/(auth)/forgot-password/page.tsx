import { ForgotPasswordForm } from "@/components/auth-forms";
import { features } from "@/lib/env";

export const metadata = { title: "Reset your password" };

// Rendered per request: whether email is configured is runtime configuration.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm emailEnabled={features.email()} />;
}
