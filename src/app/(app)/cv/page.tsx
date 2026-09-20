import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { CvList, CvUpload, ExtractionReview } from "@/components/cv-manager";
import type { ExtractedCv } from "@/lib/ai/cv-extraction";

export const metadata = { title: "My CV" };
export const dynamic = "force-dynamic";

export default async function CvPage() {
  const user = await requireUser();

  const cvs = await prisma.cv.findMany({
    where: { userId: user.id },
    include: { job: { select: { title: true } } },
    orderBy: [{ isMaster: "desc" }, { createdAt: "desc" }],
  });

  const hasMaster = cvs.some((cv) => cv.isMaster);

  // An extraction the user has not confirmed into their profile yet. Offered
  // for the master CV, which is the one the profile should reflect.
  const pending = cvs.find((cv) => cv.isMaster && cv.structured);

  return (
    <Container width={860}>
      <PageHeader
        title="My CV"
        description="Your master CV is the source of truth. Tailored versions are always saved separately and never overwrite it."
      />

      {pending && (
        <ExtractionReview
          cvId={pending.id}
          extraction={pending.structured as unknown as ExtractedCv}
        />
      )}

      <CvUpload hasMaster={hasMaster} />

      <section style={{ marginTop: "1.6rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: "0.7rem" }}>
          Your CVs ({cvs.length})
        </h2>
        {cvs.length === 0 ? (
          <EmptyState
            title="No CVs yet"
            description="Upload your CV above. The text is extracted and read so jobs can be matched against your real experience."
          />
        ) : (
          <CvList
            cvs={cvs.map((cv) => ({
              id: cv.id,
              name: cv.name,
              isMaster: cv.isMaster,
              kind: cv.kind,
              fileName: cv.fileName,
              createdAt: cv.createdAt,
              jobTitle: cv.job?.title ?? null,
            }))}
          />
        )}
      </section>
    </Container>
  );
}
