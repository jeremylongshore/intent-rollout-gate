#!/usr/bin/env -S node --experimental-strip-types
/**
 * ci/emit-evidence.ts — produce intent-rollout-gate's own signed-ready testing
 * evidence for the intent-eval-dashboard reports hub (repo key `iar`).
 *
 * ── Why this lives in `ci/`, NOT `src/` or `scripts/` ──
 *
 * Mirrors audit-harness's `ci/` emitter placement: this is a CI-only emit
 * helper, not part of the Action's runtime surface. `src/` is bundled into the
 * committed `dist/index.js` (the shipped artifact); `scripts/` holds operator
 * tooling (release.sh). Nothing in `ci/` is reachable from the Action.
 *
 * This is the DETERMINISTIC half of the emit. It runs this repo's two REAL
 * release-state self-gates, shapes each outcome into a kernel `gate-result/v1`
 * body, wraps each in a kernel `EvidenceBundle`, and writes:
 *
 *   build/evidence/bundle-<i>.json          — CANONICAL EvidenceBundle bytes
 *                                             (exactly what the dashboard
 *                                             re-canonicalises; CI runs
 *                                             `cosign sign-blob` over THIS file)
 *   build/evidence/gate-result-<i>.json     — the gate-result/v1 predicate body
 *   build/evidence/manifest-skeleton.json   — for ci/assemble-manifest.ts
 *
 * Signing + Rekor + final report-manifest.json assembly happen in CI
 * (`.github/workflows/release.yml` emit-evidence job). This script does NO
 * crypto and writes only to the gitignored `build/` dir.
 *
 * ── Gate selection (honest, no fake evidence) ──
 *
 * Exactly two gates, both signals this repo's release pipeline ALREADY
 * enforces (release.yml `build` job):
 *
 *   - harness-hash       `pnpm exec audit-harness verify` — the hash-pinned
 *                        policy manifest (`.harness-hash`: action.yml +
 *                        tests/TESTING.md) is consistent / untampered. Same
 *                        gate shape audit-harness (iah) emits.
 *   - reproducible-dist  `pnpm run build` + `git diff --exit-code dist/` —
 *                        the committed `dist/index.js` (the artifact
 *                        `uses: ...@<tag>` actually resolves) is byte-
 *                        reproducible from `src/`. This is the repo's
 *                        signature integrity property.
 *
 * Deliberately excluded (would be fake/degraded evidence): coverage and
 * mutation — declared in tests/TESTING.md but NOT measured (vitest has no
 * coverage config here); nothing is emitted for them.
 *
 * ── Kernel pin (load-bearing) ──
 *
 * The dashboard validates ingest rows with `@intentsolutions/core@^0.9.0`
 * `EvidenceBundleSchema`. This repo already carries `@intentsolutions/core`
 * as a runtime dependency, lockfile-pinned to exactly 0.9.0, so the emitter
 * imports the SAME kernel bytes the Action itself bundles (release.yml
 * asserts the installed version is exactly 0.9.0, fail-closed). This differs
 * from audit-harness's CI-only `npm i --no-save` install ONLY because
 * audit-harness must stay zero-dep — iar already has the kernel.
 *
 * ── Contract (matches the dashboard ingest, verified against its source) ──
 *
 *   - Each `bundle` validates against `EvidenceBundleSchema` (fail-closed).
 *   - Canonical bytes use the dashboard's `stableStringify` (sorted keys, no
 *     whitespace) so cosign's signature round-trips through the dashboard's
 *     re-canonicalisation.
 *   - `signing_mode: 'rekor_production'`, `rekor_log_indices: []` (the real
 *     index lives in the sigstore Bundle the dashboard's Rekor check
 *     verifies — avoids embedding a log index in the very bytes being logged).
 *   - `coverage.dimensions_*` elements are kernel-typed as free strings
 *     (deferral-D: element type LOCKED as string, no enum), so the
 *     descriptive dimension ids below are kernel-valid by construction;
 *     `GateResultV1Schema.parse` confirms at emit time.
 *
 * Usage:
 *   node --experimental-strip-types ci/emit-evidence.ts [--out build/evidence] [--ref refs/tags/vX.Y.Z] [--self-check]
 *
 * Requires Node >= 22.6 (--experimental-strip-types; Node 20 exits 9).
 * `--self-check` runs the builders over synthetic outcomes and asserts every
 * artifact is kernel-valid + canonical-stable — the locally-runnable
 * correctness proof (no gates run, no cosign needed).
 */

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GATE_RESULT_V1_URI } from "@intentsolutions/core";
import {
  EvidenceBundleSchema,
  GateResultV1Schema,
} from "@intentsolutions/core/validators/v1";

const GITHUB_REPO = "jeremylongshore/intent-rollout-gate";
const REPO_KEY = "iar";

interface GateOutcome {
  readonly gateName: string;
  readonly gateVersion: string;
  readonly decision: "pass" | "fail" | "advisory" | "error";
  readonly reasons: readonly string[];
  readonly dimensionsEvaluated: readonly string[];
  readonly dimensionsSkipped: readonly string[];
  readonly advisorySeverity?: "info" | "warn" | "error";
  readonly failureMode?: string;
}

interface EmitContext {
  readonly nowIso: string;
  readonly nowMs: number;
  readonly commitSha: string;
  readonly sourceSha: string;
  readonly policyHash: string;
  readonly runnerVersion: string;
  readonly rand16: () => Uint8Array;
}

// ── Canonicalisation (MUST match the dashboard's content-address.ts) ──

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, sortDeep(v)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

/** Canonical JSON string (sorted keys, no whitespace) — dashboard-identical. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
}

/** Generate a kernel-valid UUIDv7 from a 16-byte source + ms timestamp. */
export function uuidv7(nowMs: number, rand: Uint8Array): string {
  const b = Buffer.from(rand.slice(0, 16));
  const ts = BigInt(nowMs);
  b[0] = Number((ts >> 40n) & 0xffn);
  b[1] = Number((ts >> 32n) & 0xffn);
  b[2] = Number((ts >> 24n) & 0xffn);
  b[3] = Number((ts >> 16n) & 0xffn);
  b[4] = Number((ts >> 8n) & 0xffn);
  b[5] = Number(ts & 0xffn);
  b[6] = (b[6]! & 0x0f) | 0x70; // version 7
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export interface EmitRow {
  readonly bundle: unknown;
  readonly canonicalBundle: string;
  readonly gateResult: unknown;
  readonly sourceSha: string;
}

export function buildGateResult(
  o: GateOutcome,
  ctx: EmitContext,
): Record<string, unknown> {
  const gateId = `${REPO_KEY}:ci:${o.gateName}`;
  const inputHash = `sha256:${sha256Hex(`${ctx.commitSha}:${o.gateName}:${ctx.policyHash}`)}`;
  const body: Record<string, unknown> = {
    gate_id: gateId,
    gate_name: o.gateName,
    gate_version: o.gateVersion,
    gate_decision: o.decision,
    gate_reasons: [...o.reasons],
    coverage: {
      dimensions_evaluated: [...o.dimensionsEvaluated],
      dimensions_skipped: [...o.dimensionsSkipped],
    },
    policy_ref: `${ctx.policyHash}:.harness-hash`,
    policy_hash: ctx.policyHash,
    input_hash: inputHash,
    evaluated_at: ctx.nowIso,
    runner: `intent-rollout-gate-emit@${ctx.runnerVersion}`,
    commit_sha: ctx.commitSha,
    ...(o.advisorySeverity !== undefined
      ? { advisory_severity: o.advisorySeverity }
      : {}),
    ...(o.failureMode !== undefined ? { failure_mode: o.failureMode } : {}),
  };
  GateResultV1Schema.parse(body); // fail-closed
  return body;
}

export function buildEvidenceBundle(
  gateResult: Record<string, unknown>,
  ctx: EmitContext,
): Record<string, unknown> {
  const grHashHex = sha256Hex(stableStringify(gateResult));
  const inputHash = String(gateResult["input_hash"]);
  const subjectDigest = inputHash.startsWith("sha256:")
    ? inputHash.slice("sha256:".length)
    : inputHash;
  const bundle: Record<string, unknown> = {
    id: uuidv7(ctx.nowMs, ctx.rand16()),
    eval_run_id: uuidv7(ctx.nowMs, ctx.rand16()),
    created_at: ctx.nowIso,
    predicate_uri_set: [GATE_RESULT_V1_URI],
    row_count: 1,
    subject_set: [
      {
        name: String(gateResult["gate_id"]),
        digest: { sha256: subjectDigest },
      },
    ],
    storage_key: `sha256:${grHashHex}`,
    signing_mode: "rekor_production",
    rekor_log_indices: [], // real index lives in the sigstore Bundle (see header)
    verification_status: "unverified", // the dashboard re-verifies; we don't self-attest
    verification_last_checked_at: ctx.nowIso,
  };
  EvidenceBundleSchema.parse(bundle); // fail-closed
  return bundle;
}

export function buildRows(
  outcomes: readonly GateOutcome[],
  ctx: EmitContext,
): EmitRow[] {
  return outcomes.map((o) => {
    const gateResult = buildGateResult(o, ctx);
    const bundle = buildEvidenceBundle(gateResult, ctx);
    return {
      bundle,
      canonicalBundle: stableStringify(bundle),
      gateResult,
      sourceSha: ctx.sourceSha,
    };
  });
}

export interface ManifestSkeleton {
  readonly repo: string;
  readonly signing: {
    readonly issuer: string;
    readonly subject: string;
    readonly workflowRef: string;
  };
  readonly rows: readonly {
    readonly bundleFile: string;
    readonly gateResults: readonly unknown[];
    readonly sourceSha: string;
  }[];
}

/**
 * The OIDC signing claims this CI run will assert (tag-derived). MUST
 * byte-match the dashboard's pinned-subjects entry for `iar`:
 *   subject      repo:jeremylongshore/intent-rollout-gate:ref:refs/tags/<tag>
 *   workflowRef  jeremylongshore/intent-rollout-gate/.github/workflows/release.yml@refs/tags/<tag>
 */
export function signingClaims(ref: string): ManifestSkeleton["signing"] {
  return {
    issuer: "https://token.actions.githubusercontent.com",
    subject: `repo:${GITHUB_REPO}:ref:${ref}`,
    workflowRef: `${GITHUB_REPO}/.github/workflows/release.yml@${ref}`,
  };
}

export function writeEmit(
  rows: readonly EmitRow[],
  ref: string,
  outDir: string,
): ManifestSkeleton {
  mkdirSync(outDir, { recursive: true });
  const skeletonRows = rows.map((row, i) => {
    const bundleFile = `bundle-${i}.json`;
    writeFileSync(join(outDir, bundleFile), row.canonicalBundle, "utf8");
    writeFileSync(
      join(outDir, `gate-result-${i}.json`),
      stableStringify(row.gateResult),
      "utf8",
    );
    return {
      bundleFile,
      gateResults: [row.gateResult],
      sourceSha: row.sourceSha,
    };
  });
  const skeleton: ManifestSkeleton = {
    repo: REPO_KEY,
    signing: signingClaims(ref),
    rows: skeletonRows,
  };
  writeFileSync(
    join(outDir, "manifest-skeleton.json"),
    JSON.stringify(skeleton, null, 2),
    "utf8",
  );
  return skeleton;
}

// ── Gate collection (CI-run; runs the repo's REAL release-state gates) ──

function run(
  cmd: string,
  args: readonly string[],
): { ok: boolean; out: string } {
  try {
    const out = execFileSync(cmd, args as string[], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      out: `${e.stdout ?? ""}${e.stderr ?? ""}${e.message ?? ""}`,
    };
  }
}

/**
 * harness-hash: `audit-harness verify` — the hash-pinned policy artifacts
 * (.harness-hash: action.yml + tests/TESTING.md) are consistent / untampered.
 * Same gate shape audit-harness (iah) emits for itself.
 */
function harnessHashOutcome(): GateOutcome {
  const r = run("pnpm", ["exec", "audit-harness", "verify"]);
  return {
    gateName: "harness-hash",
    gateVersion: "1.0.0",
    decision: r.ok ? "pass" : "fail",
    reasons: r.ok
      ? [".harness-hash pinned policy artifacts verified consistent"]
      : [firstLines(r.out, 6) || "audit-harness verify reported drift"],
    dimensionsEvaluated: ["hash-manifest-consistency"],
    dimensionsSkipped: [],
    ...(r.ok ? {} : { failureMode: "harness-hash-drift" }),
  };
}

/**
 * reproducible-dist: rebuild dist/index.js from src/ and assert the committed
 * bundle is byte-identical (`git diff --exit-code dist/`). The committed dist
 * IS the shipped Action artifact (`uses: ...@<tag>` resolves to the tagged
 * tree), so this is the repo's signature integrity property — the same check
 * release.yml's build job enforces before any release.
 */
function reproducibleDistOutcome(): GateOutcome {
  const build = run("pnpm", ["run", "build"]);
  if (!build.ok) {
    return {
      gateName: "reproducible-dist",
      gateVersion: "1.0.0",
      decision: "error",
      reasons: [firstLines(build.out, 6) || "pnpm run build failed"],
      dimensionsEvaluated: [],
      dimensionsSkipped: ["dist-reproducibility"],
      failureMode: "build-failed",
    };
  }
  const diff = run("git", ["diff", "--exit-code", "dist/"]);
  return {
    gateName: "reproducible-dist",
    gateVersion: "1.0.0",
    decision: diff.ok ? "pass" : "fail",
    reasons: diff.ok
      ? ["committed dist/index.js is byte-reproducible from src/"]
      : ["committed dist/ differs from a fresh src/ rebuild"],
    dimensionsEvaluated: ["dist-reproducibility"],
    dimensionsSkipped: [],
    ...(diff.ok ? {} : { failureMode: "dist-drift" }),
  };
}

function firstLines(s: string, n: number): string {
  return s
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(0, n)
    .join(" ")
    .slice(0, 500);
}

function gitSha(): string {
  const r = run("git", ["rev-parse", "HEAD"]);
  if (!r.ok) {
    // Fail closed: a signed EvidenceBundle must never carry a dummy commit SHA.
    throw new Error(
      `emit-evidence: git rev-parse HEAD failed — refusing to emit without a real commit SHA (${r.out.slice(0, 200)})`,
    );
  }
  return r.out.trim();
}

function harnessPolicyHash(): string {
  try {
    // Hash the raw file bytes so policy_hash === `sha256sum .harness-hash`
    // (byte-exact — no trim; see the iah emitter's trailing-newline lesson).
    const raw = readFileSync(join(process.cwd(), ".harness-hash"));
    return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
  } catch (err) {
    // Fail closed: the policy hash is embedded in signed rows — a placeholder
    // would attest a policy surface that was never read.
    throw new Error(
      `emit-evidence: cannot read .harness-hash — refusing to emit a placeholder policy hash (${String(err).slice(0, 200)})`,
    );
  }
}

// ── Self-check (locally-runnable correctness proof) ──

function selfCheck(): void {
  const ctx = synthCtx();
  const outcomes: GateOutcome[] = [
    {
      gateName: "harness-hash",
      gateVersion: "1.0.0",
      decision: "pass",
      reasons: [".harness-hash pinned policy artifacts verified consistent"],
      dimensionsEvaluated: ["hash-manifest-consistency"],
      dimensionsSkipped: [],
    },
    {
      gateName: "reproducible-dist",
      gateVersion: "1.0.0",
      decision: "fail",
      reasons: ["committed dist/ differs from a fresh src/ rebuild"],
      dimensionsEvaluated: ["dist-reproducibility"],
      dimensionsSkipped: [],
      failureMode: "dist-drift",
    },
  ];
  const rows = buildRows(outcomes, ctx); // throws if any artifact is kernel-invalid
  for (const row of rows) {
    if (
      stableStringify(JSON.parse(row.canonicalBundle)) !== row.canonicalBundle
    ) {
      throw new Error(
        "canonical bundle is not stable under re-canonicalisation",
      );
    }
  }
  if (rows.length !== 2) throw new Error("expected 2 rows");
  const claims = signingClaims("refs/tags/v0.0.0");
  if (claims.subject !== `repo:${GITHUB_REPO}:ref:refs/tags/v0.0.0`) {
    throw new Error("signing subject does not match the dashboard pin shape");
  }
  console.log(
    `✓ self-check: ${rows.length} kernel-valid, canonical-stable rows built`,
  );
}

function synthCtx(): EmitContext {
  let n = 0;
  return {
    nowIso: "2026-07-08T00:00:00.000Z",
    nowMs: 1783209600000,
    commitSha: "a".repeat(40),
    sourceSha: "a".repeat(40),
    policyHash: `sha256:${"b".repeat(64)}`,
    runnerVersion: "0.3.1",
    // Deterministic, non-random 16-byte source so self-check output is stable.
    rand16: () => {
      n += 1;
      return Uint8Array.from(
        Array.from({ length: 16 }, (_v, i) => (n * 31 + i) & 0xff),
      );
    },
  };
}

function packageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as {
      version?: string;
    };
    if (typeof pkg.version !== "string" || pkg.version.trim() === "") {
      throw new Error(
        "emit-evidence: package.json has no version — refusing to emit a dummy runner version",
      );
    }
    return pkg.version;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("emit-evidence:"))
      throw err;
    // Fail closed: the runner version is embedded in signed gate-result rows.
    throw new Error(
      `emit-evidence: cannot read package.json version (${String(err).slice(0, 200)})`,
    );
  }
}

function ciCtx(): EmitContext {
  const sha = gitSha();
  return {
    nowIso: new Date().toISOString(),
    nowMs: Date.now(),
    commitSha: sha,
    sourceSha: sha,
    policyHash: harnessPolicyHash(),
    runnerVersion: packageVersion(),
    rand16: () => Uint8Array.from(randomBytes(16)),
  };
}

function parseArgs(argv: readonly string[]): {
  out: string;
  selfCheck: boolean;
  ref: string;
} {
  let out = "build/evidence";
  let ref = process.env["GITHUB_REF"] ?? "refs/tags/v0.0.0";
  let sc = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") {
      out = argv[i + 1] ?? out;
      i++;
    } else if (argv[i] === "--ref") {
      ref = argv[i + 1] ?? ref;
      i++;
    } else if (argv[i] === "--self-check") {
      sc = true;
    }
  }
  return { out, selfCheck: sc, ref };
}

function main(argv: readonly string[]): number {
  const args = parseArgs(argv);
  if (args.selfCheck) {
    selfCheck();
    return 0;
  }
  const ctx = ciCtx();
  mkdirSync(args.out, { recursive: true });
  const outcomes: GateOutcome[] = [
    harnessHashOutcome(),
    reproducibleDistOutcome(),
  ];
  const rows = buildRows(outcomes, ctx);
  writeEmit(rows, args.ref, args.out);
  console.log(
    `✓ emit-evidence: ${rows.length} kernel-valid gate-result/v1 row(s) written to ${args.out}\n` +
      `  decisions: ${outcomes.map((o) => `${o.gateName}=${o.decision}`).join(", ")}\n` +
      `  next (CI): cosign sign-blob each bundle-<i>.json -> ci/assemble-manifest.ts -> report-manifest.json`,
  );
  return 0;
}

// Only run when invoked directly (not when imported by a sibling assembler).
const invokedDirectly = process.argv[1]?.endsWith("emit-evidence.ts") === true;
if (invokedDirectly) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err: unknown) {
    console.error(
      "emit-evidence FAILED (fail-closed):",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}
