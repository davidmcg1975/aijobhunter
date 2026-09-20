import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

/**
 * Development seed. Creates a demo account with a filled-in profile and a
 * couple of hand-written job adverts so the matching and tailoring flows can
 * be exercised without an Adzuna key.
 *
 * Refuses to run against a production database.
 */
if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed a production database");
}

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "correct-horse-battery-staple";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      name: "Demo Contractor",
      passwordHash,
      role: "ADMIN",
      emailVerified: new Date(),
      acceptedTermsAt: new Date(),
      aiProcessingConsentAt: new Date(),
    },
  });

  await prisma.profile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      headline: "Senior Test Analyst with 8 years in financial services",
      location: "London",
      minDayRate: 450,
      preferredDayRate: 525,
      maxCommuteMiles: 30,
      remoteModes: ["HYBRID", "REMOTE"],
      ir35Stances: ["OUTSIDE"],
      engagementModels: ["LIMITED_COMPANY"],
      jobTitles: ["Senior Test Analyst", "Test Lead"],
      yearsExperience: 8,
      industries: ["Financial Services", "Broadcasting"],
      technologies: ["Selenium", "Java", "Jenkins", "Postman", "SQL", "Git"],
      testingMethodologies: ["Agile", "BDD", "Risk-based Testing"],
      aiTestingSkills: [],
      certifications: ["ISTQB"],
      qualifications: ["BSc Computer Science"],
      softSkills: ["Stakeholder management", "Mentoring"],
      managementExperience: "Led a team of four testers across two Scrum teams.",
    },
  });

  const experienceCount = await prisma.experience.count({
    where: { userId: user.id },
  });

  if (experienceCount === 0) {
    await prisma.experience.createMany({
      data: [
        {
          userId: user.id,
          company: "Northbank Financial",
          jobTitle: "Senior Test Analyst",
          startDate: new Date("2019-04-01"),
          endDate: null,
          isCurrent: true,
          industry: "Financial Services",
          location: "London",
          description:
            "Test automation and release assurance for a retail banking platform.",
          responsibilities: [
            "Led regression testing across the payments platform",
            "Built and maintained the Selenium automation suite",
            "Owned the test strategy for quarterly releases",
          ],
          achievements: [
            "Reduced regression cycle time from five days to two",
          ],
          technologies: ["Selenium", "Java", "Jenkins", "SQL"],
          sortOrder: 0,
        },
        {
          userId: user.id,
          company: "Meridian Broadcasting",
          jobTitle: "Test Analyst",
          startDate: new Date("2016-01-01"),
          endDate: new Date("2019-03-01"),
          industry: "Broadcasting",
          location: "Manchester",
          description: "Functional and API testing for a video-on-demand service.",
          responsibilities: [
            "Manual and exploratory testing of the streaming client",
            "API testing with Postman",
          ],
          achievements: [],
          technologies: ["Postman", "SQL", "Git"],
          sortOrder: 1,
        },
      ],
    });
  }

  const jobs = [
    {
      source: "seed",
      sourceJobId: "seed-1",
      title: "Senior Test Analyst",
      company: "Aldgate Capital",
      location: "London",
      description: `Senior Test Analyst required for a 6 month contract with a leading investment bank.

This role is Outside IR35 and pays £500 - £550 per day. Hybrid working, 2 days per week on-site in the City.

Essential:
- Strong Selenium WebDriver automation experience
- Java
- API testing
- Agile delivery within a Scrum team
- Experience leading testing on a workstream

Desirable:
- Playwright
- Python
- AWS
- Financial services background

You will own the test strategy for a regulatory reporting programme, lead a small team of testers and work closely with developers to shift testing left.

5+ years experience required.`,
      salaryMin: 500,
      salaryMax: 550,
      salaryPeriod: "DAY" as const,
      contractType: "CONTRACT" as const,
      remote: "HYBRID" as const,
      ir35: "OUTSIDE" as const,
      url: "https://example.com/jobs/seed-1",
      fingerprint: "seed-fingerprint-1",
    },
    {
      source: "seed",
      sourceJobId: "seed-2",
      title: "AI Test Engineer",
      company: "Helix AI",
      location: "Remote",
      description: `AI Test Engineer needed for a 12 month contract, fully remote.

Inside IR35, £450 - £500 per day, umbrella only.

We are building evaluation tooling for large language models and need someone who can bring test discipline to a non-deterministic system.

Essential:
- LLM testing and evaluation
- Prompt testing
- Python
- RAG evaluation
- Experience with hallucination detection

Desirable:
- Prompt injection and AI red teaming
- CI/CD
- Model regression testing

3+ years experience required.`,
      salaryMin: 450,
      salaryMax: 500,
      salaryPeriod: "DAY" as const,
      contractType: "CONTRACT" as const,
      remote: "REMOTE" as const,
      ir35: "INSIDE" as const,
      url: "https://example.com/jobs/seed-2",
      fingerprint: "seed-fingerprint-2",
    },
  ];

  for (const job of jobs) {
    await prisma.job.upsert({
      where: {
        source_sourceJobId: {
          source: job.source,
          sourceJobId: job.sourceJobId,
        },
      },
      update: {},
      create: { ...job, postedAt: new Date() },
    });
  }

  console.log(`Seeded.
  Sign in with:
    email:    ${DEMO_EMAIL}
    password: ${DEMO_PASSWORD}

  ${jobs.length} example jobs created. Open Jobs to score them against the demo profile.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
