import Link from "next/link";
import { scoreColour } from "@/lib/format";

export function Container({
  children,
  width = 1200,
}: {
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div style={{ maxWidth: width, margin: "0 auto", padding: "1.5rem 1rem 4rem" }}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "1rem",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: "1.4rem",
      }}
    >
      <div>
        <h1 className="page-title">{title}</h1>
        {description && (
          <p className="muted" style={{ margin: "0.3rem 0 0", maxWidth: "60ch" }}>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number | string;
  href?: string;
}) {
  const body = (
    <div className="card" style={{ padding: "1rem 1.1rem", height: "100%" }}>
      <div
        style={{ fontSize: "1.9rem", fontWeight: 700, letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      <div className="muted" style={{ fontSize: "0.84rem", marginTop: "0.15rem" }}>
        {label}
      </div>
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      {body}
    </Link>
  );
}

export function MatchScore({
  score,
  size = "md",
  underEvidenced = false,
}: {
  score: number;
  size?: "sm" | "md" | "lg";
  /** Too little of the advert could be assessed for the number to mean anything. */
  underEvidenced?: boolean;
}) {
  const fontSize = size === "lg" ? "1.6rem" : size === "sm" ? "0.85rem" : "1.05rem";

  if (underEvidenced) {
    return (
      <span
        className="muted"
        style={{
          fontWeight: 600,
          fontSize: size === "lg" ? "1.05rem" : "0.85rem",
          whiteSpace: "nowrap",
        }}
        title="Analyse this advert, or paste its full text, for a real score."
      >
        Not enough to score
      </span>
    );
  }

  return (
    <span
      style={{
        color: scoreColour(score),
        fontWeight: 700,
        fontSize,
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
      }}
    >
      {score}%<span style={{ fontSize: "0.7em", fontWeight: 600 }}> match</span>
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{ padding: "2.5rem 1.5rem", textAlign: "center" }}
    >
      <p style={{ fontWeight: 620, margin: 0, fontSize: "1.02rem" }}>{title}</p>
      <p
        className="muted"
        style={{ margin: "0.5rem auto 1rem", maxWidth: "48ch" }}
      >
        {description}
      </p>
      {action}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "0.9rem" }}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Grid({
  children,
  min = 220,
  gap = "1rem",
}: {
  children: React.ReactNode;
  min?: number;
  gap?: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`,
        gap,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Evidence levels are shown with distinct wording throughout: "not evidenced"
 * is never rendered as a deficiency, because a CV omission is not a skills gap.
 */
export function EvidenceMark({ level }: { level: string }) {
  if (level === "CONFIRMED") {
    return <span style={{ color: "var(--success)", fontWeight: 700 }}>✓</span>;
  }
  if (level === "INFERRED") {
    return <span style={{ color: "var(--warning)", fontWeight: 700 }}>~</span>;
  }
  return <span style={{ color: "var(--text-subtle)", fontWeight: 700 }}>?</span>;
}
