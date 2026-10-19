import { EvidenceMark, MatchScore } from "./ui";
import {
  RECOMMENDATION_ACTIONS,
  RECOMMENDATION_LABELS,
  type MatchBreakdown,
} from "@/lib/matching/types";
import { isUnderEvidenced, UNDER_EVIDENCED_REASON } from "@/lib/matching/evidence";

/**
 * The score is never shown without this. Section 13 of the spec: a percentage
 * with no working shown is worse than useless, because the user cannot tell
 * when the AI has got it wrong.
 */
export function MatchExplanation({ breakdown }: { breakdown: MatchBreakdown }) {
  const underEvidenced = isUnderEvidenced(breakdown);
  const scored = breakdown.dimensions.filter((d) => !d.indeterminate);
  const skipped = breakdown.dimensions.filter((d) => d.indeterminate);

  return (
    <div className="card" style={{ padding: "1.1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "0.8rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Why this score?</h2>
          <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.87rem" }}>
            {underEvidenced
              ? "Not enough of this advert could be checked to score it"
              : `${RECOMMENDATION_LABELS[breakdown.recommendation]} · ${
                  RECOMMENDATION_ACTIONS[breakdown.recommendation]
                }`}
          </p>
        </div>
        <MatchScore
          score={breakdown.score}
          size="lg"
          underEvidenced={underEvidenced}
        />
      </div>

      {underEvidenced && (
        <div className="alert alert-warning" style={{ marginBottom: "0.9rem" }}>
          <strong>
            Only {breakdown.effectiveWeightTotal}% of the scoring could be
            assessed.
          </strong>{" "}
          {UNDER_EVIDENCED_REASON}
        </div>
      )}

      {/* Both of these explain the same shortfall in a different way, and the
          cap refers to a percentage that is not shown when the score is too
          thin to state. One message is enough. */}
      {!underEvidenced && breakdown.capReason && (
        <div className="alert alert-warning" style={{ marginBottom: "0.9rem" }}>
          <strong>Held at {breakdown.cappedAt}%.</strong> {breakdown.capReason}
        </div>
      )}

      {!underEvidenced && breakdown.usedFallbackAnalysis && (
        <div className="alert alert-warning" style={{ marginBottom: "0.9rem" }}>
          This job has not been analysed by AI yet, so the score is based on
          reading the advert text directly. Analyse it for a better score.
        </div>
      )}

      <div className="scroll-x">
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.88rem",
            minWidth: 460,
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
              <th style={{ padding: "0.4rem 0.5rem 0.4rem 0" }}>Dimension</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>Weight</th>
              <th style={{ padding: "0.4rem 0.5rem" }}>Scored</th>
              <th style={{ padding: "0.4rem 0 0.4rem 0.5rem" }}>Contribution</th>
            </tr>
          </thead>
          <tbody>
            {scored.map((dimension) => (
              <tr key={dimension.key} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "0.5rem 0.5rem 0.5rem 0" }}>
                  <strong>{dimension.label}</strong>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>
                    {dimension.explanation}
                  </div>
                </td>
                <td style={{ padding: "0.5rem" }} className="muted">
                  {dimension.weight}%
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {Math.round(dimension.score * 100)}%
                </td>
                <td style={{ padding: "0.5rem 0 0.5rem 0.5rem" }}>
                  {dimension.contribution.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: "0.6rem" }}>
        Contributions are out of {breakdown.effectiveWeightTotal} available
        points, rescaled to 100.
        {skipped.length > 0 &&
          " Dimensions that could not be assessed were excluded rather than scored as zero."}
      </p>

      {skipped.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <h3 style={{ fontSize: "0.92rem", margin: "0 0 0.4rem" }}>
            Could not be assessed
          </h3>
          <ul className="muted" style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.86rem" }}>
            {skipped.map((dimension) => (
              <li key={dimension.key}>{dimension.explanation}</li>
            ))}
          </ul>
        </div>
      )}

      <details style={{ marginTop: "1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.92rem" }}>
          Evidence behind each requirement
        </summary>
        <div style={{ marginTop: "0.7rem" }}>
          <p className="hint" style={{ marginTop: 0 }}>
            <EvidenceMark level="CONFIRMED" /> demonstrated in your CV or profile
            {" · "}
            <EvidenceMark level="INFERRED" /> reasonable inference from related
            experience
            {" · "}
            <EvidenceMark level="NOT_EVIDENCED" /> no evidence either way. That
            is not the same as being unable to do it.
          </p>
          {breakdown.dimensions
            .filter((d) => d.evidence.length > 0)
            .map((dimension) => (
              <div key={dimension.key} style={{ marginBottom: "0.9rem" }}>
                <h4 style={{ fontSize: "0.87rem", margin: "0 0 0.3rem" }}>
                  {dimension.label}
                </h4>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                  {dimension.evidence.map((item, index) => (
                    <li
                      key={`${item.requirement}-${index}`}
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        padding: "0.25rem 0",
                        fontSize: "0.86rem",
                      }}
                    >
                      <EvidenceMark level={item.level} />
                      <span>
                        <strong style={{ fontWeight: 580 }}>{item.requirement}</strong>
                        <span className="muted"> — {item.note}</span>
                        {item.source && (
                          <span className="subtle" style={{ fontSize: "0.8rem" }}>
                            {" "}
                            ({item.source})
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </details>
    </div>
  );
}
