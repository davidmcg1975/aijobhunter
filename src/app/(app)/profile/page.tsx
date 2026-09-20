import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Container, PageHeader } from "@/components/ui";
import {
  ExperienceEditor,
  ProfileForm,
  type ProfileValues,
} from "@/components/profile-form";

export const metadata = { title: "My profile" };
export const dynamic = "force-dynamic";

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export default async function ProfilePage() {
  const user = await requireUser();

  const [profile, experiences] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: user.id } }),
    prisma.experience.findMany({
      where: { userId: user.id },
      orderBy: { startDate: { sort: "desc", nulls: "last" } },
    }),
  ]);

  const values: ProfileValues = {
    headline: profile?.headline ?? "",
    location: profile?.location ?? "",
    postcode: profile?.postcode ?? "",
    phone: profile?.phone ?? "",
    linkedinUrl: profile?.linkedinUrl ?? "",
    minDayRate: profile?.minDayRate?.toString() ?? "",
    preferredDayRate: profile?.preferredDayRate?.toString() ?? "",
    maxCommuteMiles: profile?.maxCommuteMiles?.toString() ?? "",
    minContractMonths: profile?.minContractMonths?.toString() ?? "",
    maxContractMonths: profile?.maxContractMonths?.toString() ?? "",
    remoteModes: profile?.remoteModes ?? [],
    ir35Stances: profile?.ir35Stances ?? [],
    engagementModels: profile?.engagementModels ?? [],
    jobTitles: (profile?.jobTitles ?? []).join(", "),
    yearsExperience: profile?.yearsExperience?.toString() ?? "",
    industries: (profile?.industries ?? []).join(", "),
    technologies: (profile?.technologies ?? []).join(", "),
    testingMethodologies: (profile?.testingMethodologies ?? []).join(", "),
    aiTestingSkills: (profile?.aiTestingSkills ?? []).join(", "),
    certifications: (profile?.certifications ?? []).join(", "),
    qualifications: (profile?.qualifications ?? []).join(", "),
    softSkills: (profile?.softSkills ?? []).join(", "),
    managementExperience: profile?.managementExperience ?? "",
  };

  return (
    <Container width={860}>
      <PageHeader
        title="My profile"
        description="This is the source of truth. Match scores are calculated from it, and it is the only thing the AI is allowed to say about you."
      />

      <ProfileForm values={values} />

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: "0.3rem" }}>
          Employment history
        </h2>
        <p className="muted" style={{ margin: "0 0 1rem", fontSize: "0.87rem" }}>
          Roles marked &quot;from CV&quot; were read from an uploaded CV and can be
          edited or removed like any other.
        </p>

        <ExperienceEditor
          experiences={experiences.map((exp) => ({
            id: exp.id,
            company: exp.company,
            jobTitle: exp.jobTitle,
            startDate: isoDate(exp.startDate) ?? "",
            endDate: isoDate(exp.endDate),
            isCurrent: exp.isCurrent,
            location: exp.location,
            industry: exp.industry,
            description: exp.description,
            responsibilities: exp.responsibilities,
            achievements: exp.achievements,
            technologies: exp.technologies,
            source: exp.source,
          }))}
        />
      </section>
    </Container>
  );
}
