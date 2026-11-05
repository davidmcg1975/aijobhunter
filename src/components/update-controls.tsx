"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { requestUpdateAction } from "@/lib/actions/updates";

export function UpdateControls({ automatic, revision, busy }: {
  automatic: boolean;
  revision?: string;
  busy: boolean;
}) {
  const router = useRouter();
  const [result, action, pending] = useActionState(requestUpdateAction, {});

  return (
    <form action={action} className="stack">
      {revision && <input type="hidden" name="revision" value={revision} />}
      <div className="row">
        <button className="btn btn-sm" name="command" value="check" disabled={busy || pending}>
          Check for updates
        </button>
        <button className="btn btn-sm" name="command" value={automatic ? "disable" : "enable"} disabled={busy || pending}>
          {automatic ? "Turn off automatic checks" : "Turn on automatic checks"}
        </button>
        {revision && (
          <button className="btn btn-sm btn-primary" name="command" value="install" disabled={busy || pending}>
            Install update {revision.slice(0, 7)}
          </button>
        )}
        <button className="btn btn-sm" type="button" onClick={() => router.refresh()}>
          Refresh status
        </button>
      </div>
      {(result.error || result.success) && <p role="status">{result.error || result.success}</p>}
    </form>
  );
}
