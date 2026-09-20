"use client";

import { useState, useTransition } from "react";
import {
  addToApplicationsAction,
  analyseJobAction,
  toggleSaveJobAction,
} from "@/lib/actions/jobs";

export function JobActions({
  jobId,
  jobUrl,
  isSaved,
  inTracker,
  isAnalysed,
}: {
  jobId: string;
  jobUrl: string;
  isSaved: boolean;
  inTracker: boolean;
  isAnalysed: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(
    null,
  );

  const run = (fn: () => Promise<{ error?: string; success?: string }>) => {
    startTransition(async () => {
      const result = await fn();
      setMessage(
        result.error
          ? { text: result.error, error: true }
          : { text: result.success ?? "Done", error: false },
      );
    });
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => run(() => toggleSaveJobAction(jobId))}
        >
          {isSaved ? "Remove from saved" : "Save job"}
        </button>

        {!isAnalysed && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={pending}
            onClick={() => run(() => analyseJobAction(jobId))}
          >
            {pending ? "Analysing..." : "Analyse with AI"}
          </button>
        )}

        <button
          type="button"
          className="btn btn-sm"
          disabled={pending || inTracker}
          onClick={() => run(() => addToApplicationsAction(jobId))}
        >
          {inTracker ? "In your tracker" : "Add to applications"}
        </button>

        {jobUrl && (
          <a
            href={jobUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="btn btn-sm"
          >
            Open original advert
          </a>
        )}
      </div>

      {message && (
        <div
          className={message.error ? "alert alert-error" : "alert alert-success"}
          style={{ marginTop: "0.7rem" }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
