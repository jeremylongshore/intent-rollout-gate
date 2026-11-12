import { describe, expect, it } from "vitest";
import { renderSummary } from "../src/summary";

const hostile =
  "literal\\|`\r\n## forged\n- extra\n<img src=x onerror=alert(1)>";

describe("untrusted summary display values cannot create Markdown structure", () => {
  it("keeps gate IDs, patterns and blocking reasons inside their original table cells", () => {
    const output = renderSummary("block", [], {
      decision: "block",
      reasons: [],
      evaluated: {
        required_gates: [
          {
            pattern: hostile,
            status: "not-passing",
            matched_gate_ids: [hostile],
          },
        ],
        rows: [
          {
            index: 0,
            gate_id: hostile,
            gate_decision: "fail",
            valid: true,
            blocking: true,
            reasons: [hostile],
          },
        ],
      },
    });
    expect(output.split("\n").filter((line) => line.startsWith("## "))).toEqual(
      ["## Intent Rollout Gate"],
    );
    const tableLines = output
      .split("\n")
      .filter((line) => line.startsWith("|"));
    expect(tableLines).toHaveLength(6);
    for (const line of tableLines) expect(line.split("|")).toHaveLength(5);
    expect(output).not.toContain("<img");
    expect(output).not.toContain("\\|");
  });
  it("keeps each reason in one list entry while displaying literal punctuation", () => {
    const output = renderSummary("block", [hostile], null);
    expect(
      output.split("\n").filter((line) => line.startsWith("- ")),
    ).toHaveLength(1);
    expect(output).not.toContain("\n## forged");
    expect(output).not.toContain("<img");
    expect(output).toContain("&#92;&#124;&#96;<br>");
    expect(output).toContain("&lt;img");
  });
  it("contains advisory and headline values without changing the decision supplied by the caller", () => {
    const output = renderSummary(hostile, [], null, [
      {
        verdict: hostile,
        skillVersionId: hostile,
        behavioralDelta: 0,
        rekorRef: hostile,
      },
    ]);
    expect(output.split("\n").filter((line) => line.startsWith("## "))).toEqual(
      ["## Intent Rollout Gate"],
    );
    expect(
      output.split("\n").filter((line) => line.startsWith("|")),
    ).toHaveLength(3);
    expect(output).toContain("**0** accepted refinements attested");
    expect(output).not.toContain("<img");
  });
});

it("preserves visible punctuation and Unicode through standard character references", () => {
  const output = renderSummary(
    "allow",
    ["A & \\ ` | < > 😀 漢字", "&lt;script&gt;"],
    null,
  );
  expect(output).toContain(
    "- A &amp; &#92; &#96; &#124; &lt; &gt; &#128512; 漢字",
  );
  expect(output).toContain("- &amp;lt&#59;script&amp;gt&#59;");
  expect(output).toContain("**Decision:** <code>allow</code>");
});
