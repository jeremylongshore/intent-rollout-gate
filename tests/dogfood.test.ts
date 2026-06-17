/**
 * iar-E10 internal-dogfood test (pv6).
 *
 * This is the in-repo, deterministic half of the dogfood. It proves that the
 * `scripts/dogfood-bundle.mjs` generator emits a REAL, kernel-valid Evidence
 * Bundle from this repo's own state — NOT a synthetic always-pass fixture — and
 * that feeding both the SHIP and NO-SHIP bundle through the SAME real
 * `decide()` path the Action runs produces the exact opposite decisions.
 *
 * "Real" is asserted concretely:
 *   - the in-toto subject digest equals the live sha256 of this repo's
 *     committed `dist/index.js` (the bytes the published Action actually runs);
 *   - every predicate body validates against the canonical kernel
 *     `GateResultV1Schema` from `@intentsolutions/core` (the generator already
 *     fails closed on this; here we re-assert it independently);
 *   - the gate IDs are this repo's real gate identity
 *     (`intent-rollout-gate:ci:*`), not the `synth-tool:ci:*` placeholders the
 *     shell-wiring unit tests use.
 *
 * The end-to-end run of the PUBLISHED Action (`uses: ./`) against these bundles
 * lives in `.github/workflows/dogfood.yml`; this test is the local gate so the
 * generator + decision asymmetry can't silently rot between CI runs.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GATE_RESULT_V1_URI } from "@intentsolutions/core";
import { GateResultV1Schema } from "@intentsolutions/core/validators/v1";
import { decide, parsePolicy } from "@intentsolutions/rollout-gate";

const repoRoot = join(__dirname, "..");
const generator = join(repoRoot, "scripts/dogfood-bundle.mjs");
const policyPath = join(repoRoot, "tests/fixtures/dogfood-policy.json");

interface Subject {
  name: string;
  digest: { sha256: string };
}
interface Statement {
  _type: string;
  subject: Subject[];
  predicateType: string;
  predicate: Record<string, unknown>;
}

/** The single in-toto subject of a row (every dogfood row has exactly one). */
function subjectOf(stmt: Statement): Subject {
  const s = stmt.subject[0];
  if (!s) throw new Error("dogfood row has no subject — malformed bundle");
  return s;
}

let outDir: string;
let shipBundle: Statement[];
let noShipBundle: Statement[];
let realDistSha: string;

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), "iar-dogfood-"));
  // Run the REAL generator exactly as CI does. If the kernel rejected any row,
  // it would exit non-zero and execFileSync would throw — so a clean run is
  // itself proof the bundle is kernel-valid by construction.
  execFileSync(
    "node",
    [generator, "--out-dir", outDir, "--policy", policyPath],
    { cwd: repoRoot, stdio: "pipe" }
  );
  shipBundle = JSON.parse(
    readFileSync(join(outDir, "ship.bundle.json"), "utf8")
  ) as Statement[];
  noShipBundle = JSON.parse(
    readFileSync(join(outDir, "no-ship.bundle.json"), "utf8")
  ) as Statement[];
  realDistSha = createHash("sha256")
    .update(readFileSync(join(repoRoot, "dist/index.js")))
    .digest("hex");
});

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

describe("dogfood bundle is REAL, not synthetic", () => {
  it("binds the in-toto subject digest to the live dist/index.js bytes", () => {
    // This is the load-bearing 'not synthetic' assertion: the bundle's subject
    // digest is the actual artifact the published Action runs, computed here
    // independently of the generator.
    for (const stmt of [...shipBundle, ...noShipBundle]) {
      expect(subjectOf(stmt).digest.sha256).toBe(realDistSha);
      expect(stmt.predicate.input_hash).toBe(`sha256:${realDistSha}`);
    }
  });

  it("uses this repo's real gate identity, never the synth-tool placeholders", () => {
    const ids = shipBundle.map((s) => subjectOf(s).name);
    expect(ids).toContain("intent-rollout-gate:ci:dist-bundle-reproducible");
    expect(ids).toContain("intent-rollout-gate:ci:typecheck-and-tests");
    for (const id of ids) {
      expect(id.startsWith("intent-rollout-gate:ci:")).toBe(true);
      expect(id).not.toContain("synth-tool");
    }
  });

  it("carries this repo's real HEAD commit_sha and package version runner", () => {
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
    })
      .toString()
      .trim();
    const pkgVersion = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8")
    ).version as string;
    for (const stmt of shipBundle) {
      expect(stmt.predicate.commit_sha).toBe(headSha);
      expect(stmt.predicate.runner).toBe(`intent-rollout-gate@${pkgVersion}`);
    }
  });

  it("every predicate body independently validates against the kernel GateResultV1Schema", () => {
    for (const stmt of [...shipBundle, ...noShipBundle]) {
      expect(stmt.predicateType).toBe(GATE_RESULT_V1_URI);
      const parsed = GateResultV1Schema.safeParse(stmt.predicate);
      expect(parsed.success).toBe(true);
    }
  });

  it("binds policy_ref / policy_hash to the real committed policy file", () => {
    const policySha = createHash("sha256")
      .update(readFileSync(policyPath))
      .digest("hex");
    for (const stmt of shipBundle) {
      expect(stmt.predicate.policy_hash).toBe(`sha256:${policySha}`);
      expect(stmt.predicate.policy_ref).toBe(
        `sha256:${policySha}:tests/fixtures/dogfood-policy.json`
      );
    }
  });
});

describe("the SAME decide() path the Action runs produces opposite decisions", () => {
  const policy = () =>
    parsePolicy(JSON.parse(readFileSync(policyPath, "utf8")));

  it("SHIP: all-pass real bundle → decision=allow, empty reasons", () => {
    const result = decide(shipBundle, policy());
    expect(result.decision).toBe("allow");
    expect(result.reasons).toEqual([]);
  });

  it("NO-SHIP: the SAME subject with one fail row → decision=block naming the real failing gate", () => {
    const result = decide(noShipBundle, policy());
    expect(result.decision).toBe("block");
    expect(result.reasons.length).toBeGreaterThan(0);
    // pins the block to THIS real gate, not a generic non-empty check
    expect(result.reasons.join(" ")).toContain(
      "intent-rollout-gate:ci:typecheck-and-tests"
    );
  });

  it("asymmetry isolates the decision to the gate verdict (same subject, only the verdict differs)", () => {
    // Both bundles share the identical real subject digest — the ONLY thing
    // that flipped allow → block is the typecheck-and-tests gate_decision.
    const shipSubject = shipBundle.map((s) => subjectOf(s).digest.sha256);
    const noShipSubject = noShipBundle.map((s) => subjectOf(s).digest.sha256);
    expect(shipSubject).toEqual(noShipSubject);

    const shipVerdicts = shipBundle.map((s) => s.predicate.gate_decision);
    const noShipVerdicts = noShipBundle.map((s) => s.predicate.gate_decision);
    expect(shipVerdicts).toEqual(["pass", "pass"]);
    expect(noShipVerdicts).toEqual(["pass", "fail"]);
  });
});
