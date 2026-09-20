import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { Container, Grid, PageHeader, Stat } from "@/components/ui";
import { AdminUserList } from "@/components/admin-panels";
import { sourceStatus } from "@/lib/jobsources/registry";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

/**
 * Administration is deliberately limited to operating the service.
 *
 * There is no route here that returns a user's CV text, profile, applications
 * or generated documents - see docs/security.md. Admins get counts and
 * operational health, not the contents of anyone's job search.
 */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  await audit({ action: "admin.viewed_users", userId: user.id, actorId: user.id });

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    users,
    userCount,
    jobCount,
    analysedCount,
    applicationCount,
    aiSpend,
    aiCalls,
    recentFetches,
    recentErrors,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        emailVerified: true,
        disabledAt: true,
        // Counts only. Never the underlying rows.
        _count: { select: { cvs: true, applications: true, savedJobs: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.user.count(),
    prisma.job.count(),
    prisma.jobAnalysis.count(),
    prisma.application.count(),
    prisma.aiUsage.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { costPence: true },
    }),
    prisma.aiUsage.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.sourceFetchLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.sourceFetchLog.count({
      where: {
        succeeded: false,
        createdAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    }),
  ]);

  const spendPence = aiSpend._sum.costPence ?? 0;

  return (
    <Container>
      <PageHeader
        title="Administration"
        description="Service health and account management. User CVs, applications and generated documents are not accessible from here."
      />

      <Grid min={160}>
        <Stat label="Users" value={userCount} />
        <Stat label="Jobs stored" value={jobCount} />
        <Stat label="Jobs analysed" value={analysedCount} />
        <Stat label="Applications" value={applicationCount} />
        <Stat label="AI calls this month" value={aiCalls} />
        <Stat
          label="AI spend this month"
          value={`£${(spendPence / 100).toFixed(2)}`}
        />
      </Grid>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: "0.7rem" }}>Job sources</h2>
        <div className="card" style={{ padding: "1rem 1.1rem" }}>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.9rem" }}>
            {sourceStatus().map((source) => (
              <li key={source.id}>
                {source.displayName}:{" "}
                {source.configured ? (
                  <span style={{ color: "var(--success)" }}>configured</span>
                ) : (
                  <span className="subtle">not configured</span>
                )}
              </li>
            ))}
          </ul>
          {recentErrors > 0 && (
            <div className="alert alert-warning" style={{ marginTop: "0.8rem" }}>
              {recentErrors} failed source request
              {recentErrors === 1 ? "" : "s"} in the last 24 hours.
            </div>
          )}
        </div>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: "0.7rem" }}>
          Recent source activity
        </h2>
        <div className="card scroll-x" style={{ padding: "0.5rem 1.1rem 1rem" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.86rem",
              minWidth: 520,
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                <th style={{ padding: "0.5rem 0.5rem 0.5rem 0" }}>When</th>
                <th style={{ padding: "0.5rem" }}>Source</th>
                <th style={{ padding: "0.5rem" }}>Query</th>
                <th style={{ padding: "0.5rem" }}>Received</th>
                <th style={{ padding: "0.5rem" }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {recentFetches.map((row) => (
                <tr key={row.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem 0.5rem 0.5rem 0" }}>
                    {formatDate(row.createdAt)}
                  </td>
                  <td style={{ padding: "0.5rem" }}>{row.source}</td>
                  <td style={{ padding: "0.5rem" }} className="muted">
                    {row.query || "-"}
                  </td>
                  <td style={{ padding: "0.5rem" }}>{row.received}</td>
                  <td style={{ padding: "0.5rem" }}>
                    {row.succeeded ? (
                      <span style={{ color: "var(--success)" }}>ok</span>
                    ) : (
                      <span style={{ color: "var(--danger)" }}>
                        {row.errorCode ?? "failed"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {recentFetches.length === 0 && (
                <tr>
                  <td colSpan={5} className="subtle" style={{ padding: "0.7rem 0" }}>
                    No source requests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: "0.7rem" }}>
          Users ({userCount})
        </h2>
        <AdminUserList
          currentUserId={user.id}
          users={users.map((row) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            role: row.role,
            createdAt: row.createdAt,
            verified: Boolean(row.emailVerified),
            disabled: Boolean(row.disabledAt),
            counts: row._count,
          }))}
        />
      </section>
    </Container>
  );
}
