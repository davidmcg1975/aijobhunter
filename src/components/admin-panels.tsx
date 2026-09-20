"use client";

import { useState, useTransition } from "react";
import { deleteUserAction, setUserDisabledAction } from "@/lib/actions/admin";
import { formatDate } from "@/lib/format";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  verified: boolean;
  disabled: boolean;
  counts: { cvs: number; applications: number; savedJobs: number };
};

export function AdminUserList({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(
    null,
  );

  return (
    <div>
      {message && (
        <div
          className={message.error ? "alert alert-error" : "alert alert-success"}
          style={{ marginBottom: "0.9rem" }}
        >
          {message.text}
        </div>
      )}

      <div className="stack" style={{ gap: "0.6rem" }}>
        {users.map((user) => (
          <div
            key={user.id}
            className="card"
            style={{
              padding: "0.9rem 1rem",
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
              alignItems: "center",
              opacity: user.disabled ? 0.6 : 1,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <strong>{user.name}</strong>
              {user.role === "ADMIN" && (
                <span className="badge badge-accent" style={{ marginLeft: "0.5rem" }}>
                  Admin
                </span>
              )}
              {user.disabled && (
                <span className="badge badge-danger" style={{ marginLeft: "0.5rem" }}>
                  Disabled
                </span>
              )}
              {!user.verified && (
                <span className="badge badge-warning" style={{ marginLeft: "0.5rem" }}>
                  Unverified
                </span>
              )}
              <div className="muted" style={{ fontSize: "0.84rem" }}>
                {user.email} · joined {formatDate(user.createdAt)}
              </div>
              {/* Counts only. Their contents are not reachable from here. */}
              <div className="subtle" style={{ fontSize: "0.8rem" }}>
                {user.counts.cvs} CVs · {user.counts.applications} applications ·{" "}
                {user.counts.savedJobs} saved
              </div>
            </div>

            {user.id !== currentUserId && (
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await setUserDisabledAction(
                        user.id,
                        !user.disabled,
                      );
                      setMessage(
                        result.error
                          ? { text: result.error, error: true }
                          : { text: result.success ?? "Done", error: false },
                      );
                    })
                  }
                >
                  {user.disabled ? "Enable" : "Disable"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !confirm(
                        `Permanently delete ${user.email} and all their data? This cannot be undone.`,
                      )
                    ) {
                      return;
                    }
                    startTransition(async () => {
                      const result = await deleteUserAction(user.id);
                      setMessage(
                        result.error
                          ? { text: result.error, error: true }
                          : { text: result.success ?? "Deleted", error: false },
                      );
                    });
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
