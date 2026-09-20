import Link from "next/link";

export const metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <h2 style={{ margin: "0 0 0.8rem", fontSize: "1.1rem" }}>Check your email</h2>
      <p className="muted">
        If that address was available, we have sent a link to confirm it. The
        link expires in 24 hours.
      </p>
      <p className="muted" style={{ fontSize: "0.87rem" }}>
        You can sign in straight away - confirming your address unlocks email
        alerts and reminders.
      </p>
      <Link href="/login" className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
        Go to sign in
      </Link>
    </div>
  );
}
