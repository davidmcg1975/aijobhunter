import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ingestFromAllSources } from "@/lib/jobsources/ingest";
import { analyseJob } from "@/lib/ai/job-analysis";
import { computeMatches } from "@/lib/matching/service";
import { purgeExpiredRateLimits } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled fetch. Point Vercel Cron (or any scheduler) at this with the
 * CRON_SECRET as a bearer token.
 *
 * Runs each user's saved searches, stores what comes back, analyses a capped
 * number of new adverts and re-scores everyone's matches.
 */
export async function GET(request: Request) {
  const config = env();

  if (!config.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  const expected = config.CRON_SECRET;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const searches = await prisma.savedSearch.findMany({
    where: { alertFrequency: { not: null } },
    take: 50,
  });

  // Distinct criteria only: several users watching "Test Analyst / London"
  // should cost one provider call, not one each.
  const seen = new Set<string>();
  let created = 0;

  for (const search of searches) {
    const criteria = search.criteria as Record<string, unknown>;
    const key = JSON.stringify([criteria.keywords, criteria.location]);
    if (seen.has(key)) continue;
    seen.add(key);

    const summaries = await ingestFromAllSources({
      keywords: typeof criteria.keywords === "string" ? criteria.keywords : undefined,
      location: typeof criteria.location === "string" ? criteria.location : undefined,
      contractType: "CONTRACT",
      postedWithinDays: 3,
      perPage: 40,
      sortBy: "date",
    });

    created += summaries.reduce((sum, s) => sum + s.created, 0);

    await prisma.savedSearch.update({
      where: { id: search.id },
      data: { lastRunAt: new Date() },
    });
  }

  let analysed = 0;
  if (process.env.ANTHROPIC_API_KEY) {
    const pending = await prisma.job.findMany({
      where: { analysis: null, canonicalId: null },
      orderBy: { retrievedAt: "desc" },
      take: 25,
      select: { id: true },
    });

    for (const job of pending) {
      try {
        await analyseJob(job.id);
        analysed += 1;
      } catch {
        // One bad advert must not stop the batch.
      }
    }
  }

  const users = await prisma.user.findMany({
    where: { disabledAt: null },
    select: { id: true },
  });
  const recent = await prisma.job.findMany({
    where: { canonicalId: null },
    orderBy: { retrievedAt: "desc" },
    take: 100,
    select: { id: true },
  });

  for (const user of users) {
    await computeMatches({ userId: user.id, jobIds: recent.map((j) => j.id) });
  }

  const purged = await purgeExpiredRateLimits();

  return NextResponse.json({
    ok: true,
    searchesRun: seen.size,
    jobsCreated: created,
    jobsAnalysed: analysed,
    usersScored: users.length,
    rateLimitRowsPurged: purged,
  });
}
