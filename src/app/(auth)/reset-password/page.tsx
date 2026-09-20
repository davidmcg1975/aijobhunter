import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="card" style={{ padding: "1.5rem" }}>
        <div className="alert alert-error">
          That reset link is incomplete. Request a new one.
        </div>
        <Link href="/forgot-password" className="btn" style={{ marginTop: "1rem" }}>
          Request a new link
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
