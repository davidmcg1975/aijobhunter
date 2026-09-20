import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { ApplicationBoard } from "@/components/application-board";

export const metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const user = await requireUser();

  const [applications, cvs] = await Promise.all([
    prisma.application.findMany({
      where: { userId: user.id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            company: true,
            location: true,
            salaryMin: true,
            salaryMax: true,
            salaryPeriod: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.cv.findMany({
      where: { userId: user.id },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <Container>
      <PageHeader
        title="Applications"
        description="Move a card through the pipeline as things progress. Applying sets a follow-up reminder for seven days later."
      />

      {applications.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Open a job and choose 'Add to applications' to start tracking it here."
          action={
            <Link href="/jobs" className="btn btn-primary">
              Find jobs
            </Link>
          }
        />
      ) : (
        <ApplicationBoard applications={applications} cvs={cvs} />
      )}
    </Container>
  );
}
