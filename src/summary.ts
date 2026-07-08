/**
 * intent-rollout-gate — GITHUB_STEP_SUMMARY markdown renderer.
 *
 * Option C carve-out (iar-summary-renderer): the rollout DECISION is owned and
 * tested upstream in `@intentsolutions/rollout-gate`; this module is ONLY the
 * Action-layer rendering of that decision (ship / no-ship / advisory + the gate
 * + blocking-row summary) into a human-scannable markdown block written to
 * `$GITHUB_STEP_SUMMARY` by the shell (`run.ts`).
 *
 * Pure + side-effect-free by design: `renderSummary` returns a string and is
 * unit-tested directly. The actual `$GITHUB_STEP_SUMMARY` write stays in
 * `run.ts` (it owns the `@actions/core` summary I/O + exit wiring).
 */

import type { DecideResult } from "@intentsolutions/rollout-gate";

/**
 * Advisory-only projection of a single validated skill-refiner-pass/v1 predicate
 * body, carrying exactly the fields the step-summary surfaces. Kept minimal (a
 * projection, not the full kernel type) so the renderer stays a pure string
 * function with no kernel dependency — the shell owns extraction + kernel
 * validation in `run.ts` and hands the renderer only display-ready data.
 */
export interface RefinerAdvisoryRow {
  /** `accept` | `reject` — the row is emitted on a real verdict. */
  readonly verdict: string;
  /** UUIDv7 of the attested SkillVersion. */
  readonly skillVersionId: string;
  /** Observed behavioral-dimension delta (Pareto-dominance surface). */
  readonly behavioralDelta: number;
  /**
   * Rekor transparency-log reference for the row, or `null` when the row was
   * signed staging-first (skill-refiner-pass/v1 runs in `sigstore_staging`
   * until the DR-082 Q3 production triggers hold, so `rekor_log_index` is
   * typically null). Rendered as `staging` when null.
   */
  readonly rekorRef: string | null;
}

/** Escape `|` so a cell value can never break a markdown table row. */
function esc(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/**
 * Render the step-summary markdown: a decision headline (ship/no-ship/advisory
 * as the verbatim decision string), a table of evaluated required gates, a
 * table of blocking rows, and the flat reason list.
 *
 * `result` is the full `DecideResult` from `@intentsolutions/rollout-gate` when
 * the gate actually ran, or `null` for an input-validation block (no gate
 * evaluation happened) — in which case only the headline + reason list render.
 *
 * `refinerRows` is the ADVISORY skill-refiner-pass/v1 enrichment (iar-consume
 * per bead r8ir.1). These rows are surfaced as a read-only "Skill Refiner"
 * section and are PURELY informational — they never touch the ship/no-ship
 * decision (which is 100% owned by `@intentsolutions/rollout-gate` over the
 * gate-result rows). Defaults to `[]` so existing callers/tests keep their
 * two-arg + three-arg signatures unchanged.
 */
export function renderSummary(
  decision: string,
  reasons: string[],
  result: DecideResult | null,
  refinerRows: readonly RefinerAdvisoryRow[] = [],
): string {
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
        const gateId =
          row.gate_id === null
            ? "_(schema-invalid)_"
            : `\`${esc(row.gate_id)}\``;
        lines.push(
          `| ${row.index} | ${gateId} | ${esc(row.reasons.join("; "))} |`,
        );
      }
    }
    lines.push("");
  }

  if (refinerRows.length > 0) {
    const accepted = refinerRows.filter(
      (row) => row.verdict === "accept",
    ).length;
    lines.push(
      "### Skill Refiner (advisory)",
      "",
      `**${accepted}** accepted refinement${accepted === 1 ? "" : "s"} attested ` +
        `(does not affect the ship/no-ship decision).`,
      "",
    );
    lines.push("| Verdict | SkillVersion | Behavioral Δ | Rekor |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of refinerRows) {
      lines.push(
        `| ${esc(row.verdict)} | \`${esc(row.skillVersionId)}\` | ` +
          `${row.behavioralDelta} | ${row.rekorRef === null ? "staging" : `\`${esc(row.rekorRef)}\``} |`,
      );
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
