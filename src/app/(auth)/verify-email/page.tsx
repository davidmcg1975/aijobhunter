import Link from "next/link";
import { verifyEmailAction } from "@/lib/auth/actions";

export const metadata = { title: "Confirm your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const verified = token ? await verifyEmailAction(token) : false;

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      {verified ? (
        <>
          <div className="alert alert-success">
            Your email address is confirmed.
          </div>
          <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: "1rem" }}>
            Go to your dashboard
          </Link>
        </>
      ) : (
        <>
          <div className="alert alert-error">
            That confirmation link is invalid, expired, or has already been used.
          </div>
          <p className="muted" style={{ fontSize: "0.87rem" }}>
            You can request a new link from your settings once signed in.
          </p>
          <Link href="/login" className="btn" style={{ marginTop: "0.5rem" }}>
            Go to sign in
          </Link>
        </>
      )}
    </div>
  );
}
