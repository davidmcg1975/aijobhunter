import { describe, expect, it } from "vitest";
import { updateTarget } from "../scripts/update-host.mjs";
import { updateRequest } from "@/lib/updates";

describe("host updater", () => {
  const current = "a".repeat(40);
  const incoming = "b".repeat(40);

  it("only offers a valid fast-forward revision", () => {
    expect(updateTarget(current, incoming, true)).toBe(incoming);
    expect(updateTarget(current, current, true)).toBeUndefined();
    expect(() => updateTarget(current, incoming, false)).toThrow("fast-forward");
    expect(() => updateTarget(current, "--help", true)).toThrow("Invalid Git revision");
  });

  it("requires a reviewed commit for an install request", () => {
    expect(updateRequest.safeParse({ command: "install" }).success).toBe(false);
    expect(updateRequest.safeParse({ command: "install", revision: "main" }).success).toBe(false);
    expect(updateRequest.safeParse({ command: "install", revision: incoming }).success).toBe(true);
    expect(updateRequest.safeParse({ command: "shell" }).success).toBe(false);
  });
});
