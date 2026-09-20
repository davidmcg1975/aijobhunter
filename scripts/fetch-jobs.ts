import "dotenv/config";

/**
 * Background job fetcher.
 *
 * Run on a schedule (Vercel Cron hitting /api/cron/fetch-jobs, or this script
 * from any scheduler) to keep the local job database warm so the Jobs page is
 * fast and does not spend the provider allowance on every page view.
 *
 *   npm run jobs:fetch -- "Senior Test Analyst" London
 */
async function main() {
  const [keywords = "Test Analyst", location = "London"] = process.argv.slice(2);

  // Imported lazily so dotenv has populated the environment first.
  const { ingestFromAllSources } = await import("../src/lib/jobsources/ingest");
  const { analyseJob } = await import("../src/lib/ai/job-analysis");
  const { prisma } = await import("../src/lib/db");

  console.log(`Fetching "${keywords}" in ${location}...`);

  const summaries = await ingestFromAllSources({
    keywords,
    location,
    radiusMiles: 25,
    contractType: "CONTRACT",
    postedWithinDays: 7,
    perPage: 40,
    sortBy: "date",
  });

  for (const summary of summaries) {
    if (summary.error) {
      console.error(`  ${summary.source}: ${summary.error}`);
      continue;
    }
    console.log(
      `  ${summary.source}: ${summary.received} received, ${summary.created} new, ${summary.duplicates} duplicates`,
    );
  }

  if (process.env.ANTHROPIC_API_KEY) {
    // Only analyse what has never been analysed, and cap the batch so a large
    // fetch cannot run up an unexpected bill in one go.
    const pending = await prisma.job.findMany({
      where: { analysis: null, canonicalId: null },
      orderBy: { retrievedAt: "desc" },
      take: 20,
      select: { id: true, title: true },
    });

    console.log(`Analysing ${pending.length} new jobs...`);
    for (const job of pending) {
      try {
        await analyseJob(job.id);
        console.log(`  analysed: ${job.title}`);
      } catch (error) {
        console.error(
          `  failed: ${job.title} - ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }
  } else {
    console.log("ANTHROPIC_API_KEY not set - skipping analysis.");
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
