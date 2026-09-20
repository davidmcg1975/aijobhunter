/**
 * Skill taxonomy for software testing / QA contracting.
 *
 * Two jobs:
 *  - matching: recognise that "Selenium WebDriver" and "selenium" are the same
 *    skill, and that Cypress and Playwright are both browser automation
 *  - grounding: give the verifier a closed vocabulary so it can spot a
 *    technology appearing in AI output that was never in the source CV
 *
 * Canonical name -> aliases. Aliases are matched case-insensitively on word
 * boundaries.
 */
export const SKILL_ALIASES: Record<string, string[]> = {
  // --- Test automation -------------------------------------------------
  Selenium: ["selenium", "selenium webdriver", "webdriver", "selenium grid"],
  Playwright: ["playwright"],
  Cypress: ["cypress", "cypress.io"],
  Appium: ["appium"],
  WebdriverIO: ["webdriverio", "wdio"],
  "Robot Framework": ["robot framework", "robotframework"],
  TestCafe: ["testcafe"],
  Puppeteer: ["puppeteer"],

  // --- API and performance ---------------------------------------------
  "API Testing": ["api testing", "rest api testing", "web services testing", "api test"],
  Postman: ["postman", "newman"],
  "REST Assured": ["rest assured", "restassured"],
  SoapUI: ["soapui", "soap ui"],
  JMeter: ["jmeter", "apache jmeter"],
  "Gatling": ["gatling"],
  k6: ["k6", "grafana k6"],
  LoadRunner: ["loadrunner", "load runner"],
  "Performance Testing": ["performance testing", "load testing", "stress testing", "soak testing"],

  // --- Languages --------------------------------------------------------
  Java: ["java"],
  Python: ["python"],
  JavaScript: ["javascript", "js", "es6"],
  TypeScript: ["typescript", "ts"],
  "C#": ["c#", "csharp", "c sharp"],
  SQL: ["sql", "t-sql", "pl/sql", "postgresql", "mysql", "oracle sql"],
  Groovy: ["groovy"],
  Ruby: ["ruby"],

  // --- Frameworks and tooling ------------------------------------------
  Cucumber: ["cucumber", "gherkin", "specflow"],
  JUnit: ["junit"],
  TestNG: ["testng"],
  pytest: ["pytest", "py.test"],
  NUnit: ["nunit"],
  Jest: ["jest"],
  Mocha: ["mocha", "chai"],
  Serenity: ["serenity bdd", "serenity"],

  // --- CI/CD and cloud --------------------------------------------------
  Jenkins: ["jenkins"],
  "GitLab CI": ["gitlab ci", "gitlab-ci"],
  "GitHub Actions": ["github actions"],
  "Azure DevOps": ["azure devops", "ado", "tfs", "vsts"],
  TeamCity: ["teamcity"],
  Bamboo: ["bamboo"],
  "CI/CD": ["ci/cd", "cicd", "continuous integration", "continuous delivery"],
  Docker: ["docker", "containerisation", "containerization"],
  Kubernetes: ["kubernetes", "k8s"],
  AWS: ["aws", "amazon web services"],
  Azure: ["azure", "microsoft azure"],
  GCP: ["gcp", "google cloud"],
  Git: ["git", "github", "bitbucket"],

  // --- Test management --------------------------------------------------
  Jira: ["jira"],
  "X-Ray": ["xray", "x-ray test management"],
  Zephyr: ["zephyr"],
  TestRail: ["testrail", "test rail"],
  qTest: ["qtest"],
  ALM: ["hp alm", "micro focus alm", "quality center", "alm"],
  Confluence: ["confluence"],

  // --- Testing disciplines ---------------------------------------------
  "Test Management": ["test management", "test manager", "test lead", "qa lead"],
  "Test Strategy": ["test strategy", "test approach", "test policy"],
  "Test Planning": ["test planning", "test plan"],
  "Manual Testing": ["manual testing", "exploratory testing"],
  "Regression Testing": ["regression testing", "regression pack", "regression suite"],
  "UAT": ["uat", "user acceptance testing"],
  "System Integration Testing": ["sit", "system integration testing"],
  "Accessibility Testing": ["accessibility testing", "wcag", "axe", "a11y"],
  "Security Testing": ["security testing", "penetration testing", "owasp", "pen testing"],
  "Mobile Testing": ["mobile testing", "ios testing", "android testing"],
  "ETL Testing": ["etl testing", "data warehouse testing", "data testing"],
  "Non-functional Testing": ["non-functional testing", "nfr testing", "nfrs"],

  // --- Methodologies ----------------------------------------------------
  Agile: ["agile", "scrum", "kanban", "sprint"],
  SAFe: ["safe", "scaled agile"],
  BDD: ["bdd", "behaviour driven", "behavior driven"],
  TDD: ["tdd", "test driven development"],
  "Shift Left": ["shift left", "shift-left"],
  "Risk-based Testing": ["risk based testing", "risk-based testing"],
  Waterfall: ["waterfall", "v-model"],
  DevOps: ["devops"],

  // --- AI / LLM testing niche (see docs/product-spec.md section 26) ----
  "LLM Testing": ["llm testing", "llm test", "testing llms", "large language model testing"],
  "Prompt Testing": ["prompt testing", "prompt engineering", "prompt evaluation"],
  "RAG Evaluation": ["rag", "retrieval augmented generation", "rag evaluation", "rag testing"],
  "Hallucination Testing": ["hallucination testing", "hallucination detection", "groundedness"],
  "AI Evaluation": ["ai evaluation", "model evaluation", "evals", "llm evaluation", "benchmarking models"],
  "Prompt Injection": ["prompt injection", "jailbreak testing", "adversarial prompting"],
  "AI Security": ["ai security", "ai red teaming", "red teaming", "owasp llm"],
  "AI Regression Testing": ["ai regression testing", "model regression", "non-deterministic testing"],
  "ML Testing": ["ml testing", "machine learning testing", "model drift", "data drift"],

  // --- Certifications ---------------------------------------------------
  ISTQB: ["istqb", "istqb foundation", "istqb advanced", "iseb"],
  "ISTQB AI Testing": ["ct-ai", "istqb ai testing", "certified tester ai"],
};

/** Canonical names that count as the AI/LLM testing speciality. */
export const AI_TESTING_SKILLS = new Set([
  "LLM Testing",
  "Prompt Testing",
  "RAG Evaluation",
  "Hallucination Testing",
  "AI Evaluation",
  "Prompt Injection",
  "AI Security",
  "AI Regression Testing",
  "ML Testing",
  "ISTQB AI Testing",
]);

/** Skills that are closely enough related to count as partial evidence. */
export const RELATED_SKILLS: Record<string, string[]> = {
  Selenium: ["Playwright", "Cypress", "WebdriverIO", "Puppeteer", "TestCafe"],
  Playwright: ["Selenium", "Cypress", "WebdriverIO", "Puppeteer"],
  Cypress: ["Playwright", "Selenium", "WebdriverIO"],
  WebdriverIO: ["Selenium", "Playwright", "Cypress"],
  JMeter: ["Gatling", "k6", "LoadRunner"],
  Gatling: ["JMeter", "k6", "LoadRunner"],
  k6: ["JMeter", "Gatling", "LoadRunner"],
  Jenkins: ["GitLab CI", "GitHub Actions", "Azure DevOps", "TeamCity", "Bamboo"],
  "GitHub Actions": ["Jenkins", "GitLab CI", "Azure DevOps"],
  "GitLab CI": ["Jenkins", "GitHub Actions", "Azure DevOps"],
  Java: ["C#", "TypeScript"],
  TypeScript: ["JavaScript"],
  JavaScript: ["TypeScript"],
  pytest: ["JUnit", "TestNG", "NUnit"],
  JUnit: ["TestNG", "pytest", "NUnit"],
  AWS: ["Azure", "GCP"],
  Azure: ["AWS", "GCP"],
  TestRail: ["Zephyr", "qTest", "X-Ray", "ALM"],
  "LLM Testing": ["AI Evaluation", "Prompt Testing", "RAG Evaluation"],
  "AI Evaluation": ["LLM Testing", "ML Testing", "Prompt Testing"],
};

let lookup: Map<string, string> | null = null;

/** Alias (lower-cased) -> canonical skill name. */
function aliasLookup(): Map<string, string> {
  if (lookup) return lookup;
  lookup = new Map();
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    lookup.set(canonical.toLowerCase(), canonical);
    for (const alias of aliases) lookup.set(alias.toLowerCase(), canonical);
  }
  return lookup;
}

/** Every alias, longest first, so "selenium webdriver" wins over "selenium". */
let sortedAliases: string[] | null = null;
function allAliases(): string[] {
  if (sortedAliases) return sortedAliases;
  sortedAliases = [...aliasLookup().keys()].sort((a, b) => b.length - a.length);
  return sortedAliases;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Maps a free-text skill to its canonical name, or null if unrecognised. */
export function canonicaliseSkill(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return aliasLookup().get(cleaned) ?? null;
}

/**
 * Finds every known skill mentioned in a block of text.
 * Word-boundary matched so "Java" does not match "JavaScript".
 */
export function extractSkills(text: string): Set<string> {
  const found = new Set<string>();
  const haystack = text.toLowerCase();

  for (const alias of allAliases()) {
    // "c#" and "k6" need a tolerant boundary; the rest use \b.
    const pattern = /^[a-z0-9]/.test(alias)
      ? new RegExp(`(?<![a-z0-9])${escapeRegex(alias)}(?![a-z0-9+#])`, "i")
      : new RegExp(escapeRegex(alias), "i");

    if (pattern.test(haystack)) {
      found.add(aliasLookup().get(alias)!);
    }
  }
  return found;
}

/**
 * Canonicalises a list, keeping unrecognised entries as written.
 *
 * Job adverts state requirements as phrases, not tidy skill names -
 * "Strong Selenium WebDriver automation experience", "Agile delivery within a
 * Scrum team". An exact-match-only canonicaliser leaves those unmatched, and
 * they then score as unevidenced however much of it the person has actually
 * done. So an exact match is tried first, then the known skills mentioned
 * inside the phrase, and only then is the phrase kept verbatim.
 */
export function canonicaliseList(values: string[]): string[] {
  const out = new Set<string>();

  for (const value of values) {
    const exact = canonicaliseSkill(value);
    if (exact) {
      out.add(exact);
      continue;
    }

    const mentioned = extractSkills(value);
    if (mentioned.size > 0) {
      for (const skill of mentioned) out.add(skill);
      continue;
    }

    // Genuinely unknown: keep it. The taxonomy will never be complete, and a
    // requirement we cannot name is still a requirement the user should see.
    const trimmed = value.trim();
    if (trimmed) out.add(trimmed);
  }

  return [...out];
}

export function isRelated(a: string, b: string): boolean {
  return (RELATED_SKILLS[a] ?? []).includes(b) || (RELATED_SKILLS[b] ?? []).includes(a);
}
