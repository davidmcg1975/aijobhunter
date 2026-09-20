/**
 * Display helpers. UK conventions throughout: £, day rates, DD Mon YYYY.
 * Safe to import from client components - no server-only dependencies.
 */

export function formatRate(
  min: number | null,
  max: number | null,
  period: string,
): string {
  if (min === null && max === null) return "Rate not stated";

  const unit =
    period === "DAY"
      ? "/day"
      : period === "HOUR"
        ? "/hour"
        : period === "YEAR"
          ? "/year"
          : period === "MONTH"
            ? "/month"
            : "";

  const money = (value: number) =>
    period === "YEAR"
      ? `£${Math.round(value).toLocaleString("en-GB")}`
      : `£${Math.round(value).toLocaleString("en-GB")}`;

  if (min !== null && max !== null && min !== max) {
    return `${money(min)}-${money(max)}${unit}`;
  }
  return `${money((min ?? max)!)}${unit}`;
}

export function formatIr35(status: string): string {
  switch (status) {
    case "INSIDE":
      return "Inside IR35";
    case "OUTSIDE":
      return "Outside IR35";
    default:
      return "IR35 not stated";
  }
}

export function formatRemote(remote: string): string {
  switch (remote) {
    case "REMOTE":
      return "Remote";
    case "HYBRID":
      return "Hybrid";
    case "ONSITE":
      return "On-site";
    default:
      return "Not stated";
  }
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "-";
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelative(date: Date | string | null): string {
  if (!date) return "-";
  const value = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((Date.now() - value.getTime()) / 86_400_000);

  if (days < 0) return formatDate(value);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return formatDate(value);
}

export const STATUS_LABELS: Record<string, string> = {
  SAVED: "Saved",
  CONSIDERING: "Considering",
  APPLIED: "Applied",
  RECRUITER_CONTACTED: "Recruiter contacted",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
};

/** The pipeline, in order. Closed statuses are handled separately. */
export const PIPELINE_STATUSES = [
  "SAVED",
  "CONSIDERING",
  "APPLIED",
  "RECRUITER_CONTACTED",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
] as const;

export const CLOSED_STATUSES = ["REJECTED", "WITHDRAWN", "EXPIRED"] as const;

export function scoreColour(score: number): string {
  if (score >= 85) return "var(--success)";
  if (score >= 70) return "var(--accent)";
  if (score >= 50) return "var(--warning)";
  return "var(--text-subtle)";
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length).trimEnd()}...`;
}
