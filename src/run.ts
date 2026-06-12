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

/** The only predicate URI this shell supports (Evidence Bundle SPEC R17). */
export const SUPPORTED_PREDICATE_URI =
  "https://evals.intentsolutions.io/gate-result/v1";

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Render the step-summary markdown: decision headline, a table of evaluated
 * required gates, a table of blocking rows, and the flat reason list.
 * Pure function — unit-tested directly.
 */
export function renderSummary(
  decision: string,
  reasons: string[],
  result: DecideResult | null
): string {
  const esc = (s: string): string => s.replace(/\|/g, "\\|");
  const lines: string[] = [
    "## Intent Rollout Gate",
    "",
    `**Decision:** \`${decision}\``,
    "",
  ];

  if (result !== null) {
    lines.push("### Required gates", "");
    lines.push("| Pattern | Status | Matched gate IDs |");
    lines.push("| --- | --- | --- |");
    if (result.evaluated.required_gates.length === 0) {
      lines.push("| _(none declared)_ | — | — |");
    }
    for (const gate of result.evaluated.required_gates) {
      const matched =
        gate.matched_gate_ids.length > 0
          ? gate.matched_gate_ids.map((id) => `\`${esc(id)}\``).join(", ")
          : "—";
      lines.push(`| \`${esc(gate.pattern)}\` | ${gate.status} | ${matched} |`);
    }
    lines.push("");

    const blockingRows = result.evaluated.rows.filter((row) => row.blocking);
    lines.push("### Blocking rows", "");
    if (blockingRows.length === 0) {
      lines.push("_None._");
    } else {
      lines.push("| Row | Gate ID | Reasons |");
      lines.push("| --- | --- | --- |");
      for (const row of blockingRows) {
        const gateId = row.gate_id === null ? "_(schema-invalid)_" : `\`${esc(row.gate_id)}\``;
        lines.push(`| ${row.index} | ${gateId} | ${esc(row.reasons.join("; "))} |`);
      }
    }
    lines.push("");
  }

  if (reasons.length > 0) {
    lines.push("### Blocking reasons", "");
    for (const reason of reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Set every declared output, write the step summary, and wire the exit code.
 * `signed-decision-row-path` is reserved (always empty at v0.2.0 — decision-row
 * signing lands with the DNSSEC + CAA pre-condition work per DR-002 § 6.3).
 */
async function conclude(
  decision: string,
  reasons: string[],
  result: DecideResult | null,
  failOnBlock: boolean
): Promise<void> {
  const summary = renderSummary(decision, reasons, result);

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
        `Rollout blocked (non-failing per fail-on-block/dry-run): ${reasons.join("; ")}`
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
        "input 'policy-file' is deprecated; use 'policy-path' (treated as policy-path for this run)"
      );
    }
    const policyPath = policyPathInput !== "" ? policyPathInput : policyFileAlias;

    // Reserved v0.0.x inputs that have no behavior yet — honest no-ops.
    const predicateUri = core.getInput("predicate-uri").trim();
    if (predicateUri !== "" && predicateUri !== SUPPORTED_PREDICATE_URI) {
      await conclude(
        "block",
        [
          `unsupported predicate-uri '${predicateUri}': v0.2.0 evaluates only ${SUPPORTED_PREDICATE_URI}`,
        ],
        null,
        failOnBlock
      );
      return;
    }
    if (core.getInput("cosign-key").trim() !== "") {
      core.warning(
        "input 'cosign-key' is reserved: decision-row signing is not implemented at v0.2.0; no signing performed, signed-decision-row-path stays empty"
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
        failOnBlock
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
        [`unreadable or invalid-JSON Evidence Bundle at '${bundlePath}': ${errMessage(err)}`],
        null,
        failOnBlock
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
        failOnBlock
      );
      return;
    }

    // ALL decision logic lives in @intentsolutions/rollout-gate.
    // decide() never throws; the outer try/catch is belt-and-suspenders.
    const result = decide(bundle, policy);
    await conclude(result.decision, result.reasons, result, failOnBlock);
  } catch (err) {
    // Unexpected wiring error → block (fail closed), never a silent pass.
    await conclude("block", [`unexpected error: ${errMessage(err)}`], null, failOnBlock);
  }
}
