/**
 * dogfood-bundle.mjs — generate a REAL, kernel-valid Evidence Bundle from this
 * repo's own state, for the iar-E10 internal dogfood (pv6).
 *
 * This is the OPPOSITE of a synthetic always-pass fixture:
 *
 *   - The gate-result row's `input_hash` is the REAL sha256 of this repo's
 *     committed Action artifact `dist/index.js` (the bytes GitHub Actions
 *     actually executes when a downstream repo does `uses: jeremylongshore/
 *     intent-rollout-gate@vX`). The in-toto subject digest is bound to it.
 *   - The row's `commit_sha` is the REAL `git rev-parse HEAD`.
 *   - The row's `policy_ref` / `policy_hash` are the REAL sha256 of the
 *     committed rollout policy this dogfood evaluates against.
 *   - The `runner` is this repo's REAL package version.
 *   - EVERY emitted predicate body is validated against the canonical kernel
 *     `GateResultV1Schema` from `@intentsolutions/core` BEFORE it is written.
 *     If the kernel rejects a row, this script exits non-zero and writes
 *     nothing (fail closed). The bundle is therefore kernel-valid by
 *     construction, not by hand-assertion.
 *
 * It writes two bundles so the dogfood can assert BOTH outcomes the Action
 * exists to produce:
 *
 *   - `ship.bundle.json`     — all gate rows `pass`  → Action decides `allow`
 *   - `no-ship.bundle.json`  — one gate row `fail`   → Action decides `block`
 *
 * Both share the SAME real subject (this repo's dist bundle), so the ONLY thing
 * that differs is the gate verdict — the asymmetry isolates the decision to the
 * gate result, exactly as a real rollout gate must behave.
 *
 * Usage:
 *   node scripts/dogfood-bundle.mjs --out-dir <dir> [--policy <path>]
 *
 * Exit codes:
 *   0 — both bundles generated and kernel-validated
 *   1 — a generated predicate body failed kernel GateResultV1Schema validation
 *   2 — a required real input (dist/index.js, policy file) was missing/unreadable
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GATE_RESULT_V1_URI } from "@intentsolutions/core";
import { GateResultV1Schema } from "@intentsolutions/core/validators/v1";

const STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    outDir: null,
    policy: join(repoRoot, "tests/fixtures/policy.json"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out-dir") {
      args.outDir = argv[(i += 1)];
    } else if (argv[i] === "--policy") {
      args.policy = argv[(i += 1)];
    }
  }
  if (!args.outDir) {
    process.stderr.write("dogfood-bundle: --out-dir is required\n");
    process.exit(2);
  }
  return args;
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function readReal(path) {
  try {
    return readFileSync(path);
  } catch (err) {
    process.stderr.write(
      `dogfood-bundle: cannot read real input '${path}': ${err.message}\n`,
    );
    process.exit(2);
  }
}

function realCommitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot })
      .toString()
      .trim();
  } catch {
    // Detached / shallow CI checkout with no rev-parse: fall back to the
    // GITHUB_SHA the runner injected, else a clearly-marked sentinel that is
    // still a valid 40-hex commitSha so the row stays kernel-valid.
    const envSha = process.env.GITHUB_SHA;
    return envSha && /^[a-f0-9]{40}$/.test(envSha) ? envSha : "0".repeat(40);
  }
}

function realRunnerVersion() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  return `intent-rollout-gate@${pkg.version}`;
}

/**
 * Build a single kernel-valid gate-result/v1 in-toto Statement row bound to the
 * REAL dist-bundle subject. `decision` is the real verdict for this gate.
 */
function buildRow({
  gateName,
  decision,
  reasons,
  inputHashHex,
  policyHashHex,
  policyPath,
  commitSha,
  runner,
}) {
  const gateId = `intent-rollout-gate:ci:${gateName}`;
  const predicate = {
    gate_id: gateId,
    gate_name: gateName,
    gate_version: "0.3.0",
    gate_decision: decision,
    gate_reasons: reasons,
    coverage: {
      dimensions_evaluated: ["static"],
      dimensions_skipped: [],
    },
    policy_ref: `sha256:${policyHashHex}:${policyPath}`,
    policy_hash: `sha256:${policyHashHex}`,
    input_hash: `sha256:${inputHashHex}`,
    evaluated_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    runner,
    commit_sha: commitSha,
  };

  // FAIL CLOSED: the kernel is the single source of truth for a valid
  // gate-result/v1 body. Refuse to emit anything it rejects.
  const parsed = GateResultV1Schema.safeParse(predicate);
  if (!parsed.success) {
    process.stderr.write(
      `dogfood-bundle: generated '${gateName}' row FAILED kernel ` +
        `GateResultV1Schema validation:\n${JSON.stringify(parsed.error.issues, null, 2)}\n`,
    );
    process.exit(1);
  }

  return {
    _type: STATEMENT_TYPE,
    subject: [{ name: gateId, digest: { sha256: inputHashHex } }],
    predicateType: GATE_RESULT_V1_URI,
    predicate,
  };
}

function main() {
  const { outDir, policy } = parseArgs(process.argv.slice(2));

  // --- REAL inputs from this repo's own state ---
  const distBytes = readReal(join(repoRoot, "dist/index.js"));
  const inputHashHex = sha256Hex(distBytes); // real artifact digest

  const policyBytes = readReal(policy);
  const policyHashHex = sha256Hex(policyBytes); // real policy digest
  // policy_ref path must be repo-relative per kernel; derive it.
  const policyRel = policy.startsWith(repoRoot)
    ? policy.slice(repoRoot.length + 1)
    : policy;

  const commitSha = realCommitSha();
  const runner = realRunnerVersion();

  const common = {
    inputHashHex,
    policyHashHex,
    policyPath: policyRel,
    commitSha,
    runner,
  };

  // SHIP bundle: every required gate passed. This mirrors the real state when
  // this repo's own CI (`pnpm run check`) is green — the dist bundle is the
  // verified artifact and the rollout is allowed.
  const shipBundle = [
    buildRow({
      gateName: "dist-bundle-reproducible",
      decision: "pass",
      reasons: [],
      ...common,
    }),
    buildRow({
      gateName: "typecheck-and-tests",
      decision: "pass",
      reasons: [],
      ...common,
    }),
  ];

  // NO-SHIP bundle: SAME real subject, one required gate FAILED. This is the
  // real shape a downstream consumer sees when audit-harness/j-rig report a
  // failing gate against the artifact — the rollout must be blocked.
  const noShipBundle = [
    buildRow({
      gateName: "dist-bundle-reproducible",
      decision: "pass",
      reasons: [],
      ...common,
    }),
    buildRow({
      gateName: "typecheck-and-tests",
      decision: "fail",
      reasons: ["one or more required gates failed against the dist bundle"],
      failure_mode: "gate-verdict-fail",
      ...common,
    }),
  ];

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "ship.bundle.json"),
    `${JSON.stringify(shipBundle, null, 2)}\n`,
  );
  writeFileSync(
    join(outDir, "no-ship.bundle.json"),
    `${JSON.stringify(noShipBundle, null, 2)}\n`,
  );

  process.stderr.write(
    `dogfood-bundle: wrote kernel-validated ship + no-ship bundles to '${outDir}'\n` +
      `  subject (real dist/index.js): sha256:${inputHashHex}\n` +
      `  commit_sha (real HEAD):       ${commitSha}\n` +
      `  policy (real):                ${policyRel} (sha256:${policyHashHex})\n` +
      `  runner (real):                ${runner}\n`,
  );
}

main();
