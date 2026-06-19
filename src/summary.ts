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
 */
export function renderSummary(
  decision: string,
  reasons: string[],
  result: DecideResult | null,
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

  if (reasons.length > 0) {
    lines.push("### Blocking reasons", "");
    for (const reason of reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
