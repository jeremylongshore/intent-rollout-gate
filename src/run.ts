/**
 * intent-rollout-gate — GitHub Action shell wiring.
 *
 * THIN SHELL by design (Blueprint A; DR-002 § 6.1): every rollout decision is
 * delegated to the published `@intentsolutions/rollout-gate` package. This
 * file contains ONLY:
 *   - action input reading + validation (exactly-one policy source, etc.)
 *   - file I/O (bundle + policy files)
 *   - output + step-summary rendering
 *   - exit-code wiring (`fail-on-block` / legacy `dry-run`)
 *
 * No gate semantics, no predicate evaluation, no policy interpretation is
 * re-implemented here. FAIL CLOSED: any wiring failure produces a `block`
 * decision rather than a silent pass.
 */

import { readFileSync } from "node:fs";
import * as core from "@actions/core";
import {
  decide,
  parsePolicy,
  type DecideResult,
  type RolloutPolicy,
} from "@intentsolutions/rollout-gate";
import {
  GATE_RESULT_V1_URI,
  SKILL_REFINER_PASS_V1_URI,
} from "@intentsolutions/core";
import {
  GateResultV1Schema,
  SkillRefinerPassV1Schema,
} from "@intentsolutions/core/validators/v1";
import { renderSummary, type RefinerAdvisoryRow } from "./summary";

/**
 * Re-exported so existing wiring + tests keep importing `renderSummary` from
 * this module. The implementation lives in `./summary` (iar-summary-renderer
 * Option C carve-out): the step-summary markdown renderer is its own pure,
 * directly-unit-tested module, while this shell owns the actual
 * `$GITHUB_STEP_SUMMARY` write + exit wiring in `conclude()`.
 */
export { renderSummary };

/**
 * The only predicate URI this shell supports (Evidence Bundle SPEC R17).
 *
 * SINGLE SOURCE OF TRUTH: re-exported verbatim from the canonical contracts
 * kernel `@intentsolutions/core` (`GATE_RESULT_V1_URI`). This was previously a
 * hand-rolled local string constant — the only local copy of a kernel-owned
 * artifact in this shell. Aliased here so existing wiring + tests keep their
 * name while the value comes from the kernel (drift-proof).
 */
export const SUPPORTED_PREDICATE_URI = GATE_RESULT_V1_URI;

/**
 * The ADVISORY predicate URI this shell recognizes for enrichment-only display
 * (bead r8ir.1). skill-refiner-pass/v1 rows are surfaced in the step-summary but
 * NEVER influence the ship/no-ship decision. Re-exported VERBATIM from the
 * canonical kernel `@intentsolutions/core` (no local string copy) so the value
 * tracks the kernel and can never drift.
 */
export const ADVISORY_REFINER_PASS_URI = SKILL_REFINER_PASS_V1_URI;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Extract the row array from an Evidence Bundle in either supported wire form —
 * the v2 plain-array `EvidenceBundlePayload` or the v1 `{ rows: [...] }`
 * container — WITHOUT interpreting the rows. Returns `null` for any shape that
 * is neither (so callers can no-op safely). Never throws.
 *
 * Shared by `countKernelInvalidPredicates`, `extractRefinerPassRows`, and
 * `stripRefinerPassRows` so all three agree on "what counts as a bundle".
 */
function bundleRows(bundle: unknown): unknown[] | null {
  if (Array.isArray(bundle)) {
    return bundle; // v2 plain-array EvidenceBundlePayload
  }
  if (
    bundle !== null &&
    typeof bundle === "object" &&
    Array.isArray((bundle as { rows?: unknown }).rows)
  ) {
    return (bundle as { rows: unknown[] }).rows; // v1 legacy container
  }
  return null;
}

/** Narrow: is this row a statement whose predicateType is the given URI? */
function isRowOfType(row: unknown, uri: string): boolean {
  return (
    row !== null &&
    typeof row === "object" &&
    (row as { predicateType?: unknown }).predicateType === uri
  );
}

/**
 * OPTIONAL kernel-side narrowing (cab3): run every consumed gate-result
 * predicate body through the canonical kernel Zod schema
 * (`GateResultV1Schema` from `@intentsolutions/core`). This is ADVISORY only —
 * it never changes the ship/no-ship decision (that stays 100% delegated to
 * `@intentsolutions/rollout-gate`). It exists so a structurally-malformed
 * predicate body that the decision package happens to tolerate is still
 * surfaced as a `core.warning`, keeping the kernel the single source of truth
 * for "what a valid gate-result/v1 body looks like".
 *
 * Returns the count of predicate bodies that fail kernel validation. Defensive
 * by design: any unexpected bundle shape yields 0 (never throws) so this
 * advisory pass can never break the fail-closed decision path.
 */
export function countKernelInvalidPredicates(bundle: unknown): number {
  const rows = bundleRows(bundle);
  if (rows === null) {
    return 0;
  }

  let invalid = 0;
  for (const row of rows) {
    if (!isRowOfType(row, SUPPORTED_PREDICATE_URI)) {
      continue; // not a gate-result/v1 row — not this validator's concern
    }
    const predicate = (row as { predicate?: unknown }).predicate;
    if (!GateResultV1Schema.safeParse(predicate).success) {
      invalid += 1;
    }
  }
  return invalid;
}

/**
 * ADVISORY enrichment (bead r8ir.1): extract every VALID skill-refiner-pass/v1
 * predicate body from the incoming bundle, projected down to the display fields
 * the step-summary renders.
 *
 * Each candidate row (matched by the kernel `SKILL_REFINER_PASS_V1_URI`) is run
 * through the kernel `SkillRefinerPassV1Schema` — the single source of truth for
 * "what a valid skill-refiner-pass/v1 body looks like". A row whose body FAILS
 * kernel validation is silently DROPPED, never surfaced and never a hard fail:
 * this is advisory enrichment, so a malformed refiner row must degrade to
 * "nothing to show" rather than block the job.
 *
 * Defensive by design: any unexpected bundle/row shape yields `[]` (never
 * throws) so this advisory pass can never perturb the fail-closed decision path.
 */
export function extractRefinerPassRows(bundle: unknown): RefinerAdvisoryRow[] {
  const rows = bundleRows(bundle);
  if (rows === null) {
    return [];
  }

  const out: RefinerAdvisoryRow[] = [];
  for (const row of rows) {
    if (!isRowOfType(row, ADVISORY_REFINER_PASS_URI)) {
      continue; // not a skill-refiner-pass/v1 row
    }
    const predicate = (row as { predicate?: unknown }).predicate;
    const parsed = SkillRefinerPassV1Schema.safeParse(predicate);
    if (!parsed.success) {
      continue; // malformed refiner-pass body → dropped (advisory, never a fail)
    }
    const body = parsed.data;
    // The Rekor reference is envelope-time metadata — it lives on the STATEMENT
    // (sibling to `predicate`), NOT in the signed determinant body (which is
    // `.strict()` and carries no timestamp/log fields per the kernel spec).
    // skill-refiner-pass/v1 is staging-first (`rekor_log_index` is null until the
    // DR-082 Q3 production triggers hold), so this is typically null → "staging".
    const stmtRekor = (row as { rekor_log_index?: unknown }).rekor_log_index;
    const rekorRef =
      typeof stmtRekor === "number" && Number.isFinite(stmtRekor)
        ? String(stmtRekor)
        : null;
    out.push({
      verdict: body.verdict,
      skillVersionId: body.skill_version_id,
      behavioralDelta: body.behavioral_delta,
      rekorRef,
    });
  }
  return out;
}

/**
 * Return a copy of the bundle with every skill-refiner-pass/v1 row REMOVED, so
 * the gate-result-only remainder is what reaches `@intentsolutions/rollout-gate`
 * `decide()`.
 *
 * This is what makes the advisory enrichment VERDICT-INVARIANT by construction:
 * `decide()`'s `EvidenceStatementSchema` is `.strict()` on
 * `predicateType: gate-result/v1`, so a skill-refiner-pass row reaching it would
 * be scored schema-invalid → blocking. Stripping the refiner rows here means the
 * decision engine sees the EXACT same gate-result rows whether or not any
 * refiner-pass rows were present — the refiner rows can only ever add a
 * read-only summary section, never flip ship→no-ship.
 *
 * The bundle wire form is preserved (array in → array out; container in →
 * container out with the same sibling keys). Any non-bundle shape is returned
 * unchanged so the downstream fail-closed handling still classifies it.
 */
export function stripRefinerPassRows(bundle: unknown): unknown {
  if (Array.isArray(bundle)) {
    return bundle.filter((row) => !isRowOfType(row, ADVISORY_REFINER_PASS_URI));
  }
  if (
    bundle !== null &&
    typeof bundle === "object" &&
    Array.isArray((bundle as { rows?: unknown }).rows)
  ) {
    const container = bundle as { rows: unknown[] };
    return {
      ...container,
      rows: container.rows.filter(
        (row) => !isRowOfType(row, ADVISORY_REFINER_PASS_URI),
      ),
    };
  }
  return bundle; // not a bundle shape — leave it for the fail-closed path
}

/**
 * Set every declared output, write the step summary, and wire the exit code.
 * `signed-decision-row-path` is reserved (always empty at v0.3.0 — decision-row
 * signing lands with the DNSSEC + CAA pre-condition work per DR-002 § 6.3).
 */
async function conclude(
  decision: string,
  reasons: string[],
  result: DecideResult | null,
  failOnBlock: boolean,
  refinerRows: readonly RefinerAdvisoryRow[] = [],
): Promise<void> {
  const summary = renderSummary(decision, reasons, result, refinerRows);

  core.setOutput("decision", decision);
  core.setOutput("reasons", JSON.stringify(reasons));
  core.setOutput("summary", summary);
  core.setOutput("signed-decision-row-path", "");

  if (process.env.GITHUB_STEP_SUMMARY) {
    await core.summary.addRaw(summary).write();
  }

  if (decision === "block") {
    if (failOnBlock) {
      core.setFailed(`Rollout blocked: ${reasons.join("; ")}`);
    } else {
      core.info(
        `Rollout blocked (non-failing per fail-on-block/dry-run): ${reasons.join("; ")}`,
      );
    }
  } else {
    core.info(`Rollout decision: ${decision}`);
  }
}

export async function run(): Promise<void> {
  // FAIL CLOSED on the exit knob: anything except an explicit 'false' fails
  // the job on block. Legacy `dry-run: 'true'` (v0.0.x input) also disables
  // the failing exit — same observable contract the stub documented.
  const failOnBlock =
    core.getInput("fail-on-block").trim().toLowerCase() !== "false" &&
    core.getInput("dry-run").trim().toLowerCase() !== "true";

  try {
    const bundlePath = core.getInput("bundle-path", { required: true });
    const policyPathInput = core.getInput("policy-path").trim();
    const policyFileAlias = core.getInput("policy-file").trim(); // deprecated v0.0.x name
    const policyJson = core.getInput("policy-json").trim();

    if (policyFileAlias !== "" && policyPathInput === "") {
      core.warning(
        "input 'policy-file' is deprecated; use 'policy-path' (treated as policy-path for this run)",
      );
    }
    const policyPath =
      policyPathInput !== "" ? policyPathInput : policyFileAlias;

    // Reserved v0.0.x inputs that have no behavior yet — honest no-ops.
    const predicateUri = core.getInput("predicate-uri").trim();
    if (predicateUri !== "" && predicateUri !== SUPPORTED_PREDICATE_URI) {
      await conclude(
        "block",
        [
          `unsupported predicate-uri '${predicateUri}': v0.3.0 evaluates only ${SUPPORTED_PREDICATE_URI}`,
        ],
        null,
        failOnBlock,
      );
      return;
    }
    if (core.getInput("cosign-key").trim() !== "") {
      core.warning(
        "input 'cosign-key' is reserved: decision-row signing is not implemented at v0.3.0; no signing performed, signed-decision-row-path stays empty",
      );
    }

    // Exactly one policy source — both or neither is a wiring error → block.
    const hasPath = policyPath !== "";
    const hasJson = policyJson !== "";
    if (hasPath === hasJson) {
      await conclude(
        "block",
        [
          hasPath
            ? "both 'policy-path' (or legacy 'policy-file') and 'policy-json' were provided; set exactly one"
            : "no policy provided; set exactly one of 'policy-path' or 'policy-json'",
        ],
        null,
        failOnBlock,
      );
      return;
    }

    // Bundle file: missing / unreadable / non-JSON → block (fail closed).
    let bundle: unknown;
    try {
      bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as unknown;
    } catch (err) {
      await conclude(
        "block",
        [
          `unreadable or invalid-JSON Evidence Bundle at '${bundlePath}': ${errMessage(err)}`,
        ],
        null,
        failOnBlock,
      );
      return;
    }

    // Policy: parsePolicy throws on garbage — never fall back to a default
    // policy (fail closed, per the package contract).
    let policy: RolloutPolicy;
    try {
      const rawPolicy: unknown = hasJson
        ? JSON.parse(policyJson)
        : JSON.parse(readFileSync(policyPath, "utf8"));
      policy = parsePolicy(rawPolicy);
    } catch (err) {
      await conclude(
        "block",
        [`invalid rollout policy: ${errMessage(err)}`],
        null,
        failOnBlock,
      );
      return;
    }

    // OPTIONAL kernel-side narrowing (cab3) — ADVISORY, never blocking. Flags
    // gate-result/v1 predicate bodies that the kernel Zod schema rejects so the
    // kernel stays the single source of truth for body validity. The decision
    // itself is unaffected (still 100% delegated below).
    const kernelInvalid = countKernelInvalidPredicates(bundle);
    if (kernelInvalid > 0) {
      core.warning(
        `${kernelInvalid} gate-result/v1 predicate body(ies) failed kernel ` +
          `@intentsolutions/core GateResultV1Schema validation (advisory only; ` +
          `decision is unaffected)`,
      );
    }

    // ADVISORY skill-refiner-pass/v1 enrichment (bead r8ir.1). Extract the valid
    // refiner-pass rows for a read-only summary section, then STRIP them from the
    // bundle before delegating. Stripping is what guarantees verdict-invariance:
    // decide()'s schema is strict on gate-result/v1, so a refiner row reaching it
    // would score schema-invalid → block. Feeding decide() the gate-result-only
    // remainder means the decision is identical with or without refiner rows.
    const refinerRows = extractRefinerPassRows(bundle);
    if (refinerRows.length > 0) {
      const acceptedCount = refinerRows.filter(
        (row) => row.verdict === "accept",
      ).length;
      core.info(
        `Skill Refiner: ${acceptedCount} accepted refinement(s) attested ` +
          `(advisory only; ship/no-ship decision is unaffected)`,
      );
    }
    const decisionBundle = stripRefinerPassRows(bundle);

    // ALL decision logic lives in @intentsolutions/rollout-gate.
    // decide() never throws; the outer try/catch is belt-and-suspenders.
    const result = decide(decisionBundle, policy);
    await conclude(
      result.decision,
      result.reasons,
      result,
      failOnBlock,
      refinerRows,
    );
  } catch (err) {
    // Unexpected wiring error → block (fail closed), never a silent pass.
    await conclude(
      "block",
      [`unexpected error: ${errMessage(err)}`],
      null,
      failOnBlock,
    );
  }
}
