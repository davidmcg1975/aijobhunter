export const metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <article>
      <h1 className="page-title">Terms of service</h1>
      <p className="muted">Last updated: 3 September 2026</p>

      <div className="alert alert-warning" style={{ margin: "1rem 0" }}>
        Template. Complete the placeholders and have this reviewed before making
        the service public. It is not legal advice.
      </div>

      <h2>The service</h2>
      <p>
        AI Contract Hunter helps UK IT contractors find contracts, understand
        what they require, tailor application materials and track applications.
        It is operated by <strong>[OPERATOR NAME]</strong>.
      </p>

      <h2>Your account</h2>
      <p>
        You are responsible for keeping your password secure and for everything
        done through your account. Tell us promptly if you believe it has been
        compromised. One account per person.
      </p>

      <h2>What you upload</h2>
      <p>
        You keep ownership of your CV, your profile and everything you write.
        You confirm that what you upload is accurate and yours to upload, and
        you grant us only the permission needed to operate the service for you.
      </p>

      <h2>AI-generated content</h2>
      <p>
        The service generates tailored CVs, covering letters and recruiter
        messages from the information you provide. It is designed not to invent
        employers, dates, technologies, qualifications or achievements, and it
        checks its own output for precisely that.
      </p>
      <p>
        <strong>
          You remain responsible for everything you send to an employer or
          recruiter.
        </strong>{" "}
        Read generated documents before using them. AI systems can make
        mistakes, and a match score is an opinion rather than a guarantee of
        suitability.
      </p>

      <h2>Job data</h2>
      <p>
        Job adverts come from third-party sources and are reproduced as
        supplied. We do not control their accuracy, and roles may be filled or
        withdrawn without notice. The rate, IR35 status and contract length
        shown here are our reading of the advert &mdash; always confirm them
        with the recruiter.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not use the service to misrepresent your experience, to send bulk or
        automated applications, to scrape job data for redistribution, or to
        attempt to access another user&apos;s data.
      </p>

      <h2>Availability and liability</h2>
      <p>
        The service is provided as-is, without warranty of availability or
        fitness for a particular purpose. To the extent permitted by law we are
        not liable for lost opportunities, lost income or consequential loss
        arising from its use. Nothing here limits liability that cannot be
        limited by law.
      </p>

      <h2>Ending your account</h2>
      <p>
        You may delete your account at any time from Settings. We may suspend an
        account that breaches these terms.
      </p>
    </article>
  );
}
