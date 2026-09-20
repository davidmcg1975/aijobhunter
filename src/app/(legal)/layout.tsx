import Link from "next/link";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1rem 4rem" }}>
      <Link href="/" style={{ fontSize: "0.88rem" }}>
        &larr; Back
      </Link>
      <div style={{ marginTop: "1rem", lineHeight: 1.65 }}>{children}</div>
    </main>
  );
}
