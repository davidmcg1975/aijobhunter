"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteExperienceAction,
  saveExperienceAction,
  saveProfileAction,
  type ProfileState,
} from "@/lib/actions/profile";
import { Field } from "./ui";
import { formatDate } from "@/lib/format";

function Save({ label = "Save" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving..." : label}
    </button>
  );
}

function Messages({ state }: { state: ProfileState }) {
  return (
    <>
      {state.error && (
        <div className="alert alert-error" style={{ marginBottom: "0.9rem" }}>
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="alert alert-success" style={{ marginBottom: "0.9rem" }}>
          {state.success}
        </div>
      )}
    </>
  );
}

export type ProfileValues = {
  headline: string;
  location: string;
  postcode: string;
  phone: string;
  linkedinUrl: string;
  minDayRate: string;
  preferredDayRate: string;
  maxCommuteMiles: string;
  minContractMonths: string;
  maxContractMonths: string;
  remoteModes: string[];
  ir35Stances: string[];
  engagementModels: string[];
  jobTitles: string;
  yearsExperience: string;
  industries: string;
  technologies: string;
  testingMethodologies: string;
  aiTestingSkills: string;
  certifications: string;
  qualifications: string;
  softSkills: string;
  managementExperience: string;
};

function CheckboxGroup({
  name,
  options,
  selected,
}: {
  name: string;
  options: Array<[string, string]>;
  selected: string[];
}) {
  return (
    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
      {options.map(([value, label]) => (
        <label
          key={value}
          style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.89rem" }}
        >
          <input
            type="checkbox"
            name={name}
            value={value}
            defaultChecked={selected.includes(value)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

export function ProfileForm({ values }: { values: ProfileValues }) {
  const [state, action] = useActionState(saveProfileAction, {} as ProfileState);

  return (
    <form action={action}>
      <Messages state={state} />

      <section className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ margin: "0 0 0.9rem", fontSize: "1.05rem" }}>About you</h2>
        <Field label="Professional headline" hint="For example: Senior Test Analyst with 8 years in financial services">
          <input name="headline" className="input" defaultValue={values.headline} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px,100%),1fr))", gap: "0 1rem" }}>
          <Field label="Location">
            <input name="location" className="input" defaultValue={values.location} placeholder="London" />
          </Field>
          <Field label="Postcode" hint="Used for commute distance only">
            <input name="postcode" className="input" defaultValue={values.postcode} />
          </Field>
          <Field label="Phone">
            <input name="phone" className="input" defaultValue={values.phone} />
          </Field>
          <Field label="LinkedIn">
            <input name="linkedinUrl" className="input" defaultValue={values.linkedinUrl} />
          </Field>
        </div>
      </section>

      <section className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.05rem" }}>
          Contract preferences
        </h2>
        <p className="muted" style={{ margin: "0 0 1rem", fontSize: "0.87rem" }}>
          These drive the rate, location and IR35 parts of your match scores.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px,100%),1fr))", gap: "0 1rem" }}>
          <Field label="Minimum day rate (£)" hint="You would not go below this">
            <input name="minDayRate" type="number" min={0} step={25} className="input" defaultValue={values.minDayRate} />
          </Field>
          <Field label="Target day rate (£)">
            <input name="preferredDayRate" type="number" min={0} step={25} className="input" defaultValue={values.preferredDayRate} />
          </Field>
          <Field label="Maximum commute (miles)">
            <input name="maxCommuteMiles" type="number" min={0} className="input" defaultValue={values.maxCommuteMiles} />
          </Field>
          <Field label="Shortest contract (months)">
            <input name="minContractMonths" type="number" min={0} className="input" defaultValue={values.minContractMonths} />
          </Field>
        </div>

        <Field label="Working arrangement">
          <CheckboxGroup
            name="remoteModes"
            selected={values.remoteModes}
            options={[
              ["REMOTE", "Remote"],
              ["HYBRID", "Hybrid"],
              ["ONSITE", "On-site"],
            ]}
          />
        </Field>

        <Field label="IR35" hint="Jobs outside your preference score lower, but are still shown">
          <CheckboxGroup
            name="ir35Stances"
            selected={values.ir35Stances}
            options={[
              ["OUTSIDE", "Outside IR35"],
              ["INSIDE", "Inside IR35"],
            ]}
          />
        </Field>

        <Field label="Engagement model">
          <CheckboxGroup
            name="engagementModels"
            selected={values.engagementModels}
            options={[
              ["LIMITED_COMPANY", "Own limited company"],
              ["UMBRELLA", "Umbrella"],
              ["PAYE", "Agency PAYE"],
            ]}
          />
        </Field>
      </section>

      <section className="card" style={{ padding: "1.2rem", marginBottom: "1.2rem" }}>
        <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.05rem" }}>
          Skills and experience
        </h2>
        <p className="muted" style={{ margin: "0 0 1rem", fontSize: "0.87rem" }}>
          Separate entries with commas. Only put things here you could evidence
          in an interview - this is what the AI is allowed to claim on your
          behalf.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px,100%),1fr))", gap: "0 1rem" }}>
          <Field label="Job titles you have held">
            <input name="jobTitles" className="input" defaultValue={values.jobTitles} placeholder="Senior Test Analyst, Test Lead" />
          </Field>
          <Field label="Years of experience">
            <input name="yearsExperience" type="number" min={0} max={70} className="input" defaultValue={values.yearsExperience} />
          </Field>
        </div>

        <Field label="Industries" hint="Financial services, broadcasting, utilities...">
          <input name="industries" className="input" defaultValue={values.industries} />
        </Field>
        <Field label="Technologies and tools">
          <textarea name="technologies" className="textarea" defaultValue={values.technologies} placeholder="Selenium, Java, Jenkins, Postman, SQL" />
        </Field>
        <Field label="Testing methodologies">
          <input name="testingMethodologies" className="input" defaultValue={values.testingMethodologies} placeholder="Agile, BDD, risk-based testing" />
        </Field>
        <Field
          label="AI / LLM testing skills"
          hint="A fast-growing niche: LLM testing, prompt testing, RAG evaluation, hallucination testing, AI red teaming"
        >
          <input name="aiTestingSkills" className="input" defaultValue={values.aiTestingSkills} />
        </Field>
        <Field label="Certifications">
          <input name="certifications" className="input" defaultValue={values.certifications} placeholder="ISTQB Foundation" />
        </Field>
        <Field label="Qualifications">
          <input name="qualifications" className="input" defaultValue={values.qualifications} placeholder="BSc Computer Science" />
        </Field>
        <Field label="Soft skills">
          <input name="softSkills" className="input" defaultValue={values.softSkills} />
        </Field>
        <Field label="Management and leadership experience">
          <textarea name="managementExperience" className="textarea" defaultValue={values.managementExperience} placeholder="Led a team of four testers across two Scrum teams" />
        </Field>
      </section>

      <Save label="Save profile" />
    </form>
  );
}

export type ExperienceRow = {
  id: string;
  company: string;
  jobTitle: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  location: string | null;
  industry: string | null;
  description: string | null;
  responsibilities: string[];
  achievements: string[];
  technologies: string[];
  source: string;
};

export function ExperienceEditor({ experiences }: { experiences: ExperienceRow[] }) {
  const [state, action] = useActionState(saveExperienceAction, {} as ProfileState);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  const blank: ExperienceRow = {
    id: "",
    company: "",
    jobTitle: "",
    startDate: "",
    endDate: null,
    isCurrent: false,
    location: null,
    industry: null,
    description: null,
    responsibilities: [],
    achievements: [],
    technologies: [],
    source: "user",
  };

  const form = (row: ExperienceRow) => (
    <form action={action} className="card" style={{ padding: "1.1rem", marginBottom: "0.8rem" }}>
      <input type="hidden" name="id" value={row.id} />
      <Messages state={state} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px,100%),1fr))", gap: "0 1rem" }}>
        <Field label="Job title">
          <input name="jobTitle" className="input" defaultValue={row.jobTitle} required />
        </Field>
        <Field label="Company">
          <input name="company" className="input" defaultValue={row.company} required />
        </Field>
        <Field label="Start date" hint="Leave blank if your CV does not give one">
          <input name="startDate" type="date" className="input" defaultValue={row.startDate} />
        </Field>
        <Field label="End date" hint="Leave blank if this is your current role">
          <input name="endDate" type="date" className="input" defaultValue={row.endDate ?? ""} />
        </Field>
        <Field label="Location">
          <input name="location" className="input" defaultValue={row.location ?? ""} />
        </Field>
        <Field label="Industry">
          <input name="industry" className="input" defaultValue={row.industry ?? ""} />
        </Field>
      </div>

      <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.89rem", marginBottom: "0.9rem" }}>
        <input type="checkbox" name="isCurrent" defaultChecked={row.isCurrent} />
        This is my current role
      </label>

      <Field label="Description">
        <textarea name="description" className="textarea" defaultValue={row.description ?? ""} />
      </Field>
      <Field label="Responsibilities" hint="One per line">
        <textarea name="responsibilities" className="textarea" defaultValue={row.responsibilities.join("\n")} />
      </Field>
      <Field label="Achievements" hint="One per line. Only things you can evidence.">
        <textarea name="achievements" className="textarea" defaultValue={row.achievements.join("\n")} />
      </Field>
      <Field label="Technologies used">
        <input name="technologies" className="input" defaultValue={row.technologies.join(", ")} />
      </Field>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Save label="Save role" />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setEditing(null);
            setAdding(false);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <div>
      {experiences.map((row) =>
        editing === row.id ? (
          <div key={row.id}>{form(row)}</div>
        ) : (
          <div
            key={row.id}
            className="card"
            style={{
              padding: "1rem 1.1rem",
              marginBottom: "0.7rem",
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <strong>{row.jobTitle}</strong>
              <span className="muted"> at {row.company}</span>
              <div className="muted" style={{ fontSize: "0.85rem" }}>
                {row.startDate ? formatDate(row.startDate) : "Date not stated"} to{" "}
                {row.isCurrent ? "present" : formatDate(row.endDate)}
                {row.industry && ` · ${row.industry}`}
                {row.source !== "user" && (
                  <span className="badge" style={{ marginLeft: "0.5rem" }}>
                    from CV
                  </span>
                )}
              </div>
              {row.technologies.length > 0 && (
                <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
                  {row.technologies.slice(0, 8).map((tech) => (
                    <span key={tech} className="badge">
                      {tech}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
              <button type="button" className="btn btn-sm" onClick={() => setEditing(row.id)}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove ${row.jobTitle} at ${row.company}?`)) return;
                  startTransition(() => {
                    void deleteExperienceAction(row.id);
                  });
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ),
      )}

      {adding ? (
        form(blank)
      ) : (
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          Add a role
        </button>
      )}
    </div>
  );
}
