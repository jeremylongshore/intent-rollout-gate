import type { RowTrustPolicy } from "../src/verification/verify-row";
import { SKILL_REFINER_PASS_V1_URI } from "@intentsolutions/core";
import { statement } from "./verification-statement";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { inputs, outputs, setFailed } = vi.hoisted(() => ({
  inputs: new Map<string, string>(),
  outputs: new Map<string, string>(),
  setFailed: vi.fn(),
}));
vi.mock("@actions/core", () => ({
  getInput: (key: string) => inputs.get(key) ?? "",
  setOutput: (key: string, value: string) => outputs.set(key, value),
  setFailed,
  info: vi.fn(),
  warning: vi.fn(),
  summary: { addRaw: vi.fn().mockReturnThis(), write: vi.fn() },
}));
vi.mock("@intentsolutions/rollout-gate", async (original) => {
  const actual =
    await original<typeof import("@intentsolutions/rollout-gate")>();
  return { ...actual, decide: vi.fn(actual.decide) };
});
import { decide } from "@intentsolutions/rollout-gate";
import { runEnforcingAction, runVerified } from "../src/run";
import { bundleToJSON } from "@sigstore/bundle";
import { loggedFixture } from "./verification-log-fixture";
import { signedFixture } from "./verification-private-fixture";
let dir: string;
beforeEach(() => {
  vi.clearAllMocks();
  inputs.clear();
  outputs.clear();
  dir = mkdtempSync(join(tmpdir(), "synthetic-verifier-"));
  inputs.set("bundle-path", join(dir, "rows.json"));
  inputs.set(
    "policy-json",
    JSON.stringify({ required_gates: ["synth-tool:ci:*"] }),
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
function writeRows(rows: unknown[]) {
  writeFileSync(
    inputs.get("bundle-path")!,
    JSON.stringify({ format: "sigstore-dsse-rows/v1", rows }),
  );
}
describe("strict execution seam preserves existing policy exit semantics", () => {
  it.each([{}, { "fail-on-block": "false" }, { "dry-run": "true" }])(
    "never delegates invalid evidence with exit configuration %j",
    async (knobs) => {
      for (const [key, value] of Object.entries(knobs)) inputs.set(key, value!);
      const fixture = signedFixture();
      writeRows([fixture.bundle, {}]);
      await runVerified(fixture.trust);
      expect(decide).not.toHaveBeenCalled();
      expect(outputs.get("decision")).toBe("block");
      expect(outputs.get("verification-status")).toBe("failed");
      expect(outputs.get("verification-transparency")).toBe("not-verified");
      if (Object.keys(knobs).length === 0)
        expect(setFailed).toHaveBeenCalledOnce();
      else expect(setFailed).not.toHaveBeenCalled();
    },
  );
  it("never falls back to legacy parsing when a JavaScript caller omits trust", async () => {
    writeFileSync(inputs.get("bundle-path")!, JSON.stringify([statement()]));
    await runVerified(undefined as unknown as RowTrustPolicy);
    expect(decide).not.toHaveBeenCalled();
    expect(outputs.get("decision")).toBe("block");
    expect(outputs.get("verification-status")).toBe("failed");
    expect(outputs.get("verification-transparency")).toBe("not-verified");
  });
  it("loads externally supplied trust at the proposed enforcing Action entry", async () => {
    const fixture = signedFixture();
    writeRows([fixture.bundle]);
    inputs.set(
      "verification-policy-json",
      JSON.stringify({
        kind: "key",
        keyHint: "synthetic-key",
        status: "active",
        requireInclusion: false,
        publicKeyPem: fixture.keys.publicKey
          .export({ type: "spki", format: "pem" })
          .toString(),
        notBefore: "2020-01-01T00:00:00Z",
        notAfter: "2099-01-01T00:00:00Z",
      }),
    );
    await runEnforcingAction();
    expect(outputs.get("decision")).toBe("allow");
    expect(outputs.get("verification-status")).toBe("verified");
    expect(decide).toHaveBeenCalledOnce();
  });
  it.each(["", "not-json", "x".repeat(64 * 1024 + 1)])(
    "blocks invalid or missing trusted input %# without delegation",
    async (policy) => {
      const fixture = signedFixture();
      writeRows([fixture.bundle]);
      inputs.set("verification-policy-json", policy);
      await runEnforcingAction();
      expect(outputs.get("decision")).toBe("block");
      expect(outputs.get("verification-status")).toBe("failed");
      expect(outputs.get("verification-transparency")).toBe("not-verified");
      expect(decide).not.toHaveBeenCalled();
    },
  );
  it("keeps a malformed but authenticated refiner advisory from changing the real gate verdict", async () => {
    const gate = signedFixture();
    writeRows([gate.bundle]);
    await runVerified(gate.trust);
    const baseline = outputs.get("decision");
    const advisory = signedFixture(
      {
        ...statement(),
        predicateType: SKILL_REFINER_PASS_V1_URI,
        predicate: { malformed: true },
      },
      gate.keys,
    );
    writeRows([gate.bundle, advisory.bundle]);
    await runVerified(gate.trust);
    expect(decide).toHaveBeenCalledTimes(2);
    expect(outputs.get("decision")).toBe(baseline);
    expect(outputs.get("verification-status")).toBe("verified");
    expect(outputs.get("summary")).not.toContain("Skill Refiner");
  });
  it("delegates authenticated rows to the real decision package", async () => {
    const fixture = signedFixture();
    writeRows([fixture.bundle]);
    await runVerified(fixture.trust);
    expect(decide).toHaveBeenCalledOnce();
    expect(outputs.get("verification-status")).toBe("verified");
    expect(outputs.get("decision")).toBe("allow");
    expect(setFailed).not.toHaveBeenCalled();
  });
});

describe("authenticated transparency reporting is independent of verdict", () => {
  it.each(["inclusion", "private", "mixed"] as const)(
    "reports %s evidence without changing allow",
    async (mode) => {
      const fixture = await loggedFixture();
      if (fixture.trust.signer.kind !== "key")
        throw new Error("expected key fixture");
      fixture.trust.signer.requireInclusion = false;
      const anchored = bundleToJSON(fixture.bundle);
      fixture.bundle.verificationMaterial.tlogEntries = [];
      const privateRow = bundleToJSON(fixture.bundle);
      writeRows(
        mode === "inclusion"
          ? [anchored]
          : mode === "private"
            ? [privateRow]
            : [anchored, privateRow],
      );
      await runVerified(fixture.trust);
      const expected =
        mode === "inclusion" ? "all-inclusion" : "contains-private-unanchored";
      expect(outputs.get("verification-status")).toBe("verified");
      expect(outputs.get("verification-transparency")).toBe(expected);
      expect(outputs.get("summary")).toContain(
        `Evidence transparency: **${expected}**`,
      );
      expect(outputs.get("decision")).toBe("allow");
      expect(setFailed).not.toHaveBeenCalled();
    },
  );
});
