import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { exportFilename, renderCvDocx, renderCvPdf } from "@/lib/cv/export";
import { audit } from "@/lib/security/audit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "pdf";

  // Scoped by userId: another user's CV id simply does not match.
  const cv = await prisma.cv.findFirst({
    where: { id, userId: user.id },
  });
  if (!cv?.extractedText) {
    return new NextResponse("Not found", { status: 404 });
  }

  await audit({
    action: "cv.exported",
    userId: user.id,
    entity: "Cv",
    entityId: cv.id,
    metadata: { format },
  });

  if (format === "docx") {
    const buffer = await renderCvDocx({ name: cv.name, text: cv.extractedText });
    return new NextResponse(new Blob([new Uint8Array(buffer)]), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${exportFilename(cv.name, "docx")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "txt") {
    return new NextResponse(cv.extractedText, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(cv.name, "txt")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const pdf = await renderCvPdf({ name: cv.name, text: cv.extractedText });
  return new NextResponse(new Blob([new Uint8Array(pdf)]), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${exportFilename(cv.name, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
}
