export const metadata = { title: "Privacy policy" };

/**
 * A working starting point, not legal advice. The operator must complete the
 * marked placeholders and have this reviewed before the service goes public.
 */
export default function PrivacyPage() {
  return (
    <article>
      <h1 className="page-title">Privacy policy</h1>
      <p className="muted">Last updated: 3 September 2026</p>

      <div className="alert alert-warning" style={{ margin: "1rem 0" }}>
        Template. Before making this service public, complete the placeholders
        below and have this reviewed. It is not legal advice.
      </div>

      <h2>Who we are</h2>
      <p>
        AI Contract Hunter is operated by <strong>[OPERATOR NAME]</strong> of{" "}
        <strong>[ADDRESS]</strong>, the data controller for the personal data
        described here. Contact: <strong>[CONTACT EMAIL]</strong>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, email address and a hashed password.</li>
        <li>
          Professional profile: job titles, skills, employment history,
          qualifications, rate expectations and working preferences.
        </li>
        <li>
          CVs you upload, the text extracted from them, and documents generated
          from them.
        </li>
        <li>Jobs you save, applications you track and notes you write.</li>
        <li>
          Technical data: IP address and browser user agent, recorded against
          sign-in events and security-relevant actions.
        </li>
      </ul>

      <h2>Why we use it, and our lawful basis</h2>
      <ul>
        <li>
          <strong>To provide the service</strong> (matching jobs, tailoring CVs,
          tracking applications) &mdash; performance of a contract with you.
        </li>
        <li>
          <strong>To keep the service secure</strong> (rate limiting, audit
          logging) &mdash; our legitimate interest in preventing abuse.
        </li>
        <li>
          <strong>To send service emails</strong> (verifying your address,
          resetting your password) &mdash; performance of a contract with you.
        </li>
      </ul>

      <h2>AI processing</h2>
      <p>
        Your CV text and structured profile are sent to the AI provider you
        choose in Settings &mdash; Anthropic (Claude) or OpenAI (ChatGPT) &mdash;
        to read your CV, analyse job adverts and draft application documents.
        Only the provider you choose receives it. Both act as processors and do
        not use API data to train models by default. If you enter your own API
        key, the processing is also under your own agreement with that
        provider. Match scores themselves are calculated on our own servers,
        not by an AI model.
      </p>
      <p>
        No automated decision producing a legal or similarly significant effect
        is made about you. Match scores are advisory and are always shown
        together with the reasoning behind them.
      </p>

      <h2>Who else sees it</h2>
      <ul>
        <li>
          Anthropic or OpenAI, whichever you choose, for the AI processing
          described above.
        </li>
        <li>Our hosting and database providers.</li>
        <li>Our email provider, for service emails.</li>
        <li>
          Job sources such as Adzuna receive your search terms. They do not
          receive your CV, profile or applications.
        </li>
      </ul>
      <p>
        We never sell your data, and we do not pass your CV or applications to
        recruiters. Applications are submitted by you, on the recruiter&apos;s
        own site.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account data: until you delete your account.</li>
        <li>
          CVs and generated documents: until you delete them, or delete your
          account.
        </li>
        <li>Audit logs: 12 months.</li>
        <li>
          On account deletion everything is removed immediately, including
          stored CV files.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Under UK GDPR you have the right to access, correct, delete, restrict
        and port your data, and to object to processing. Settings contains
        one-click <strong>Download my data</strong> and{" "}
        <strong>Delete my account</strong>. You may also complain to the
        Information Commissioner&apos;s Office at ico.org.uk.
      </p>

      <h2>Cookies</h2>
      <p>
        We set two cookies, both strictly necessary: a session cookie that keeps
        you signed in, and a CSRF token that protects forms against cross-site
        request forgery. We use no analytics or advertising cookies, so no
        consent banner is required.
      </p>
    </article>
  );
}
