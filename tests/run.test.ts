/**
 * Unit tests for the Action SHELL wiring only. Decision semantics belong to
 * the @intentsolutions/rollout-gate package and are tested upstream; here we
 * prove the wiring: input validation, policy-source resolution, fail-closed
 * file handling, output plumbing, summary rendering, and exit behavior.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// @actions/core mock (state hoisted so the vi.mock factory can reference it)
// ---------------------------------------------------------------------------
const { inputs, outputs, summaryRaw, setFailed, info, warning, summaryWrite } =
  vi.hoisted(() => ({
    inputs: new Map<string, string>(),
    outputs: new Map<string, string>(),
    summaryRaw: [] as string[],
    setFailed: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    summaryWrite: vi.fn(async () => undefined),
  }));

vi.mock("@actions/core", () => {
  const summary = {
    addRaw(text: string) {
      summaryRaw.push(text);
      return summary;
    },
    write: summaryWrite,
  };
  return {
    getInput: (name: string, options?: { required?: boolean }) => {
      const value = inputs.get(name) ?? "";
      if (options?.required && value === "") {
        throw new Error(`Input required and not supplied: ${name}`);
      }
      return value;
    },
    setOutput: (name: string, value: string) => {
      outputs.set(name, value);
    },
    setFailed,
    info,
    warning,
    summary,
  };
});

import {
  GATE_RESULT_V1_URI,
  SKILL_REFINER_PASS_V1_URI,
} from "@intentsolutions/core";
import {
  ADVISORY_REFINER_PASS_URI,
  countKernelInvalidPredicates,
  extractRefinerPassRows,
  renderSummary,
  run,
  stripRefinerPassRows,
  SUPPORTED_PREDICATE_URI,
} from "../src/run";

const fixture = (...parts: string[]): string =>
  join(__dirname, "fixtures", ...parts);

const ALLOW_BUNDLE = fixture("evidence", "allow-bundle.json");
const FAIL_ROW_BUNDLE = fixture("evidence", "fail-row-bundle.json");
const MALFORMED_BUNDLE = fixture("evidence", "malformed-bundle.json");
const ADVISORY_BUNDLE = fixture("evidence", "advisory-bundle.json");
const KERNEL_INVALID_BUNDLE = fixture(
  "evidence",
  "kernel-invalid-predicate-bundle.json",
);
const REFINER_PASS_BUNDLE = fixture("evidence", "refiner-pass-bundle.json");
const REFINER_PASS_MALFORMED_BUNDLE = fixture(
  "evidence",
  "refiner-pass-malformed-bundle.json",
);
const POLICY = fixture("policy.json");
const POLICY_INVALID = fixture("policy-invalid.json");

function reasonsOutput(): string[] {
  return JSON.parse(outputs.get("reasons") ?? "null") as string[];
}

beforeEach(() => {
  inputs.clear();
  outputs.clear();
  summaryRaw.length = 0;
  vi.clearAllMocks();
  delete process.env.GITHUB_STEP_SUMMARY;
});

describe("allow path", () => {
  it("emits decision=allow with empty reasons and does not fail the job", async () => {
    inputs.set("bundle-path", ALLOW_BUNDLE);
    inputs.set("policy-path", POLICY);

    await run();

    expect(outputs.get("decision")).toBe("allow");
    expect(reasonsOutput()).toEqual([]);
    expect(outputs.get("signed-decision-row-path")).toBe("");
    expect(outputs.get("summary")).toContain("`allow`");
    expect(setFailed).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalled();
  });

  it("accepts an inline policy via policy-json", async () => {
    inputs.set("bundle-path", ALLOW_BUNDLE);
    inputs.set(
      "policy-json",
      JSON.stringify({ required_gates: ["synth-tool:ci:*"] }),
    );

    await run();

    expect(outputs.get("decision")).toBe("allow");
    expect(setFailed).not.toHaveBeenCalled();
  });

  it("treats the deprecated policy-file input as policy-path and warns", async () => {
    inputs.set("bundle-path", ALLOW_BUNDLE);
    inputs.set("policy-file", POLICY);

    await run();

    expect(outputs.get("decision")).toBe("allow");
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("deprecated"));
    expect(setFailed).not.toHaveBeenCalled();
  });
});

describe("block path — bundle contents", () => {
  it("blocks and fails the job on a bundle containing a fail row (fail-on-block default)", async () => {
    inputs.set("bundle-path", FAIL_ROW_BUNDLE);
    inputs.set("policy-path", POLICY);

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(reasonsOutput().length).toBeGreaterThan(0);
    expect(reasonsOutput().join(" ")).toContain("synth-tool:ci:synth-gate-2");
    expect(setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Rollout blocked"),
    );
  });

  it("blocks WITHOUT failing the job when fail-on-block=false", async () => {
    inputs.set("bundle-path", FAIL_ROW_BUNDLE);
    inputs.set("policy-path", POLICY);
    inputs.set("fail-on-block", "false");

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(reasonsOutput().length).toBeGreaterThan(0);
    expect(setFailed).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("non-failing"));
  });

  it("blocks WITHOUT failing the job under the legacy dry-run=true input", async () => {
    inputs.set("bundle-path", FAIL_ROW_BUNDLE);
    inputs.set("policy-path", POLICY);
    inputs.set("dry-run", "true");

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(setFailed).not.toHaveBeenCalled();
  });

  it("blocks on a malformed (wrong-shape) bundle", async () => {
    inputs.set("bundle-path", MALFORMED_BUNDLE);
    inputs.set("policy-path", POLICY);

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(reasonsOutput().length).toBeGreaterThan(0);
    expect(setFailed).toHaveBeenCalled();
  });
});

describe("block path — fail-closed input validation", () => {
  it("blocks when the bundle file does not exist", async () => {
    inputs.set("bundle-path", fixture("evidence", "does-not-exist.json"));
    inputs.set("policy-path", POLICY);

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(reasonsOutput()[0]).toContain(
      "unreadable or invalid-JSON Evidence Bundle",
    );
    expect(setFailed).toHaveBeenCalled();
  });

  it("blocks when BOTH policy-path and policy-json are provided", async () => {
    inputs.set("bundle-path", ALLOW_BUNDLE);
    inputs.set("policy-path", POLICY);
    inputs.set("policy-json", "{}");

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(reasonsOutput()[0]).toContain("set exactly one");
    expect(setFailed).toHaveBeenCalled();
  });

  it("blocks when NEITHER policy input is provided", async () => {
    inputs.set("bundle-path", ALLOW_BUNDLE);

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(reasonsOutput()[0]).toContain("no policy provided");
    expect(setFailed).toHaveBeenCalled();
  });

  it("blocks when the policy file fails parsePolicy validation", async () => {
    inputs.set("bundle-path", ALLOW_BUNDLE);
    inputs.set("policy-path", POLICY_INVALID);

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(reasonsOutput()[0]).toContain("invalid rollout policy");
    expect(setFailed).toHaveBeenCalled();
  });

  it("blocks when the required bundle-path input is missing (unexpected-error path)", async () => {
    inputs.set("policy-path", POLICY);

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(reasonsOutput()[0]).toContain("unexpected error");
    expect(setFailed).toHaveBeenCalled();
  });

  it("blocks on a non-default predicate-uri (only gate-result/v1 is supported)", async () => {
    inputs.set("bundle-path", ALLOW_BUNDLE);
    inputs.set("policy-path", POLICY);
    inputs.set(
      "predicate-uri",
      "https://evals.intentsolutions.io/gate-result/v2",
    );

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(reasonsOutput()[0]).toContain("unsupported predicate-uri");
    expect(setFailed).toHaveBeenCalled();
  });
});

describe("step summary", () => {
  it("writes the markdown summary when GITHUB_STEP_SUMMARY is set", async () => {
    process.env.GITHUB_STEP_SUMMARY = "/tmp/summary-test";
    inputs.set("bundle-path", FAIL_ROW_BUNDLE);
    inputs.set("policy-path", POLICY);

    await run();

    expect(summaryWrite).toHaveBeenCalled();
    const md = summaryRaw.join("\n");
    expect(md).toContain("## Intent Rollout Gate");
    expect(md).toContain("| Pattern | Status | Matched gate IDs |");
    expect(md).toContain("synth-tool:ci:*");
    expect(md).toContain("### Blocking rows");
  });

  it("skips the summary writer when GITHUB_STEP_SUMMARY is unset, but still sets the summary output", async () => {
    inputs.set("bundle-path", ALLOW_BUNDLE);
    inputs.set("policy-path", POLICY);

    await run();

    expect(summaryWrite).not.toHaveBeenCalled();
    expect(outputs.get("summary")).toContain("## Intent Rollout Gate");
  });
});

describe("renderSummary", () => {
  it("renders required-gate and blocking-row tables from a DecideResult shape", () => {
    const md = renderSummary("block", ["reason-1 | piped"], {
      decision: "block",
      reasons: ["reason-1 | piped"],
      evaluated: {
        required_gates: [
          {
            pattern: "synth-tool:ci:*",
            status: "not-passing",
            matched_gate_ids: ["synth-tool:ci:synth-gate-2"],
          },
        ],
        rows: [
          {
            index: 0,
            gate_id: "synth-tool:ci:synth-gate-2",
            gate_decision: "fail",
            valid: true,
            blocking: true,
            reasons: ["forbidden | decision"],
          },
        ],
      },
    });

    expect(md).toContain("**Decision:** `block`");
    expect(md).toContain(
      "| `synth-tool:ci:*` | not-passing | `synth-tool:ci:synth-gate-2` |",
    );
    // pipes inside table cells are escaped so the table doesn't break
    expect(md).toContain(
      "| 0 | `synth-tool:ci:synth-gate-2` | forbidden \\| decision |",
    );
    // the flat bullet list keeps reasons verbatim
    expect(md).toContain("- reason-1 | piped");
  });

  it("renders a no-result (input-validation) block without tables", () => {
    const md = renderSummary("block", ["no policy provided"], null);
    expect(md).toContain("**Decision:** `block`");
    expect(md).not.toContain("### Required gates");
    expect(md).toContain("- no policy provided");
  });
});

// ===========================================================================
// cab3 — kernel is the single source of truth for the supported predicate URI.
// The previously hand-rolled local string constant is gone; SUPPORTED_PREDICATE_URI
// is now re-exported VERBATIM from @intentsolutions/core (GATE_RESULT_V1_URI).
// ===========================================================================
describe("kernel source of truth (cab3)", () => {
  it("re-exports the predicate URI verbatim from @intentsolutions/core", () => {
    // Identity, not a hard-coded copy: if the kernel ever changes the URI, this
    // shell's constant changes with it (and this test still passes), proving no
    // local duplicate survives.
    expect(SUPPORTED_PREDICATE_URI).toBe(GATE_RESULT_V1_URI);
  });

  it("the kernel URI is the exact value the fixtures + action.yml declare", () => {
    expect(GATE_RESULT_V1_URI).toBe(
      "https://evals.intentsolutions.io/gate-result/v1",
    );
  });
});

describe("kernel Zod narrowing of consumed rows (cab3, advisory only)", () => {
  it("reports zero invalid predicates for a kernel-valid bundle (v2 array form)", () => {
    const rows = [
      {
        predicateType: GATE_RESULT_V1_URI,
        predicate: {
          gate_id: "synth-tool:ci:synth-gate-1",
          gate_name: "synth-gate-1",
          gate_version: "1.0.0",
          gate_decision: "pass",
          gate_reasons: [],
          coverage: {
            dimensions_evaluated: ["static"],
            dimensions_skipped: [],
          },
          policy_ref: `sha256:${"a".repeat(64)}:tests/TESTING.md`,
          policy_hash: `sha256:${"a".repeat(64)}`,
          input_hash: `sha256:${"a".repeat(64)}`,
          evaluated_at: "2026-06-10T12:00:00Z",
          runner: "github-actions@1.0.0",
          commit_sha: "b".repeat(40),
        },
      },
    ];
    expect(countKernelInvalidPredicates(rows)).toBe(0);
  });

  it("counts a gate-result/v1 row whose predicate body the kernel rejects", () => {
    const rows = [
      {
        predicateType: GATE_RESULT_V1_URI,
        // policy_ref violates the kernel's sha256:<hex>:<path> format
        predicate: {
          gate_id: "synth-tool:ci:synth-gate-1",
          gate_name: "synth-gate-1",
          gate_version: "1.0.0",
          gate_decision: "pass",
          gate_reasons: [],
          coverage: {
            dimensions_evaluated: ["static"],
            dimensions_skipped: [],
          },
          policy_ref: "not-a-sha256-prefixed-ref",
          policy_hash: `sha256:${"a".repeat(64)}`,
          input_hash: `sha256:${"a".repeat(64)}`,
          evaluated_at: "2026-06-10T12:00:00Z",
          runner: "github-actions@1.0.0",
          commit_sha: "b".repeat(40),
        },
      },
    ];
    expect(countKernelInvalidPredicates(rows)).toBe(1);
  });

  it("ignores rows whose predicateType is not gate-result/v1", () => {
    const rows = [
      {
        predicateType: "https://example.com/other/v1",
        predicate: { junk: true },
      },
    ];
    expect(countKernelInvalidPredicates(rows)).toBe(0);
  });

  it("never throws on a non-bundle shape (returns 0)", () => {
    expect(countKernelInvalidPredicates(null)).toBe(0);
    expect(countKernelInvalidPredicates(42)).toBe(0);
    expect(countKernelInvalidPredicates({ no: "rows" })).toBe(0);
  });

  it("handles the v1 legacy container form ({rows:[...]})", () => {
    const container = {
      bundle_format: "json-array",
      rows: [
        {
          predicateType: GATE_RESULT_V1_URI,
          predicate: { broken: "predicate" },
        },
      ],
    };
    expect(countKernelInvalidPredicates(container)).toBe(1);
  });

  it("emits an advisory kernel warning that is ADDITIVE to (never overrides) the delegated decision", async () => {
    inputs.set("bundle-path", KERNEL_INVALID_BUNDLE);
    inputs.set("policy-path", POLICY);

    await run();

    // The kernel narrowing surfaces a `core.warning` for the malformed predicate
    // body. The DECISION itself is still 100% the rollout-gate package's call
    // (here: block, because the package also rejects the bad policy_ref). The
    // point of this assertion is that the advisory warning is ADDITIVE — it
    // appears alongside whatever the package decided, and never substitutes for it.
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("failed kernel"),
    );
    // decision is verbatim from the delegated package, not from the kernel pass
    expect(outputs.get("decision")).toBe("block");
  });
});

// ===========================================================================
// 4hk3 — ACTION SELF-TEST, FIXTURE DOMINANT. A fixture EvidenceBundle + policy
// fed through the real decide()/run, asserting the EXACT ship / no-ship /
// advisory output. Asymmetric inputs (the SAME advisory bundle flips on policy);
// no tautologies — every assertion pins a specific decision string + reason.
// ===========================================================================
describe("action self-test — exact ship / no-ship / advisory output (4hk3)", () => {
  it("SHIP: an all-pass bundle yields decision=allow, empty reasons, no failure", async () => {
    inputs.set("bundle-path", ALLOW_BUNDLE);
    inputs.set("policy-path", POLICY);

    await run();

    expect(outputs.get("decision")).toBe("allow");
    expect(reasonsOutput()).toEqual([]);
    expect(setFailed).not.toHaveBeenCalled();
  });

  it("NO-SHIP: a bundle with a fail row yields decision=block naming the offending gate, and fails the job", async () => {
    inputs.set("bundle-path", FAIL_ROW_BUNDLE);
    inputs.set("policy-path", POLICY);

    await run();

    expect(outputs.get("decision")).toBe("block");
    // exact gate id, not just "non-empty" — pins the decision to the input
    expect(reasonsOutput().join(" ")).toContain("synth-tool:ci:synth-gate-2");
    expect(setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Rollout blocked"),
    );
  });

  // The advisory bundle pairs a PASSING required gate (synth-gate-1) with a
  // NON-required advisory gate (synth-gate-2). Under the default policy the
  // advisory row is non-blocking → SHIP; flipping advisory_blocks=true on the
  // SAME bundle makes that exact row block → NO-SHIP. The required gate stays
  // green in both, so the asymmetry isolates advisory_blocks as the sole cause.
  it("ADVISORY → SHIP under default policy: a non-required advisory row does NOT block when advisory_blocks is unset", async () => {
    inputs.set("bundle-path", ADVISORY_BUNDLE);
    inputs.set(
      "policy-json",
      JSON.stringify({ required_gates: ["synth-tool:ci:synth-gate-1"] }),
    );

    await run();

    expect(outputs.get("decision")).toBe("allow");
    expect(reasonsOutput()).toEqual([]);
    expect(setFailed).not.toHaveBeenCalled();
  });

  it("ADVISORY → NO-SHIP when advisory_blocks=true: the SAME bundle flips to block purely on policy (asymmetry proof)", async () => {
    inputs.set("bundle-path", ADVISORY_BUNDLE);
    inputs.set(
      "policy-json",
      JSON.stringify({
        required_gates: ["synth-tool:ci:synth-gate-1"],
        advisory_blocks: true,
      }),
    );

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(reasonsOutput().length).toBeGreaterThan(0);
    // names the advisory gate + the advisory_blocks cause, proving the block
    // came from THIS row under THIS policy knob, not a default or the required gate
    expect(reasonsOutput().join(" ")).toContain("synth-tool:ci:synth-gate-2");
    expect(reasonsOutput().join(" ")).toContain("advisory_blocks=true");
    expect(setFailed).toHaveBeenCalled();
  });
});

// ===========================================================================
// criterion 3 (second half) — CREDENTIAL REDACTION. The action must never leak
// secrets / credentials through its outputs, step summary, or info/warning
// logs. We feed a credential-bearing input (reserved cosign-key input + a
// secret embedded in policy-json) and assert the secret never appears in any
// emitted surface.
// ===========================================================================
describe("credential redaction — secrets never reach outputs/logs", () => {
  const SECRET = "ghp_SUPERSECRETtoken1234567890ABCDEFGHIJ";

  function assertNoSecretAnywhere(): void {
    // outputs (decision, reasons, summary, signed-decision-row-path)
    for (const [, value] of outputs) {
      expect(value).not.toContain(SECRET);
    }
    // step-summary markdown
    expect(summaryRaw.join("\n")).not.toContain(SECRET);
    // info() / warning() / setFailed() log call arguments
    const allLogArgs = [
      ...info.mock.calls,
      ...warning.mock.calls,
      ...setFailed.mock.calls,
    ]
      .flat()
      .map((a) => String(a))
      .join("\n");
    expect(allLogArgs).not.toContain(SECRET);
  }

  it("does not echo a reserved cosign-key value into any output, summary, or log (block path)", async () => {
    inputs.set("bundle-path", FAIL_ROW_BUNDLE);
    inputs.set("policy-path", POLICY);
    inputs.set("cosign-key", SECRET);
    process.env.GITHUB_STEP_SUMMARY = "/tmp/redaction-summary";

    await run();

    // sanity: the action still produced a decision (so we're exercising the
    // real emit paths, not an early no-op)
    expect(outputs.get("decision")).toBe("block");
    // the cosign-key warning must mention the INPUT NAME but never the VALUE
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("'cosign-key' is reserved"),
    );
    assertNoSecretAnywhere();
  });

  it("does not echo a secret smuggled into an UNKNOWN policy field through the rejected-policy block reason", async () => {
    inputs.set("bundle-path", ALLOW_BUNDLE);
    // a secret smuggled into an UNKNOWN policy field — parsePolicy is strict and
    // rejects it (→ block), and crucially the resulting "invalid rollout policy"
    // reason must not reflect the secret VALUE back into any surface
    inputs.set(
      "policy-json",
      JSON.stringify({
        required_gates: ["synth-tool:ci:*"],
        _leaked_token: SECRET,
      }),
    );
    process.env.GITHUB_STEP_SUMMARY = "/tmp/redaction-summary";

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(reasonsOutput()[0]).toContain("invalid rollout policy");
    assertNoSecretAnywhere();
  });

  it("does not leak a secret embedded in an INVALID policy-json through the block-reason error message", async () => {
    inputs.set("bundle-path", ALLOW_BUNDLE);
    // invalid policy (required_gates wrong type) carrying a secret — the
    // resulting "invalid rollout policy" block reason must not echo the secret
    inputs.set("policy-json", JSON.stringify({ required_gates: SECRET }));

    await run();

    expect(outputs.get("decision")).toBe("block");
    expect(reasonsOutput()[0]).toContain("invalid rollout policy");
    assertNoSecretAnywhere();
  });
});

// ===========================================================================
// r8ir.1 — ADVISORY skill-refiner-pass/v1 enrichment. When the incoming bundle
// carries skill-refiner-pass/v1 rows, the action surfaces them in the step
// summary as a read-only "Skill Refiner" section AND strips them before the
// decision engine sees the bundle — so the ship/no-ship verdict is IDENTICAL
// with or without the refiner rows present (verdict-invariant by construction).
// ===========================================================================
describe("skill-refiner-pass advisory — kernel source of truth (r8ir.1)", () => {
  it("re-exports the advisory URI verbatim from @intentsolutions/core (no local copy)", () => {
    // Identity, not a hard-coded string: if the kernel changes the URI, this
    // shell's constant changes with it, proving no local duplicate survives.
    expect(ADVISORY_REFINER_PASS_URI).toBe(SKILL_REFINER_PASS_V1_URI);
  });

  it("the kernel URI is the exact value the fixtures declare", () => {
    expect(SKILL_REFINER_PASS_V1_URI).toBe(
      "https://evals.intentsolutions.io/skill-refiner-pass/v1",
    );
  });
});

describe("extractRefinerPassRows — validate-and-project (r8ir.1)", () => {
  it("returns only the kernel-VALID skill-refiner-pass rows, projected to display fields", () => {
    const bundle = JSON.parse(
      readFileSync(REFINER_PASS_BUNDLE, "utf8"),
    ) as unknown;
    const rows = extractRefinerPassRows(bundle);

    // fixture has one accept + one reject refiner row (both kernel-valid)
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.verdict).sort()).toEqual(["accept", "reject"]);

    const accept = rows.find((r) => r.verdict === "accept");
    expect(accept?.skillVersionId).toBe("018f6b1e-7c00-7aaa-8bbb-000000000001");
    expect(accept?.behavioralDelta).toBe(0.12);
    // staging-first predicate → no rekor_log_index on the fixture body → null
    expect(accept?.rekorRef).toBeNull();
  });

  it("DROPS a malformed skill-refiner-pass row (advisory, never surfaced, never a fail)", () => {
    const bundle = JSON.parse(
      readFileSync(REFINER_PASS_MALFORMED_BUNDLE, "utf8"),
    ) as unknown;
    // the fixture's lone refiner row has a bad verdict/skill_version_id/delta
    expect(extractRefinerPassRows(bundle)).toEqual([]);
  });

  it("ignores gate-result rows and returns [] when no refiner rows are present", () => {
    const bundle = JSON.parse(readFileSync(ALLOW_BUNDLE, "utf8")) as unknown;
    expect(extractRefinerPassRows(bundle)).toEqual([]);
  });

  it("handles the v1 legacy container form ({rows:[...]})", () => {
    const arr = JSON.parse(
      readFileSync(REFINER_PASS_BUNDLE, "utf8"),
    ) as unknown[];
    const container = { bundle_format: "json-array", rows: arr };
    expect(extractRefinerPassRows(container)).toHaveLength(2);
  });

  it("never throws on a non-bundle shape (returns [])", () => {
    expect(extractRefinerPassRows(null)).toEqual([]);
    expect(extractRefinerPassRows(42)).toEqual([]);
    expect(extractRefinerPassRows({ no: "rows" })).toEqual([]);
  });

  it("surfaces the Rekor index as a string when the STATEMENT carries rekor_log_index (envelope-time metadata, not the body)", () => {
    const rows = extractRefinerPassRows([
      {
        _type: "https://in-toto.io/Statement/v1",
        subject: [
          { name: "skill-refiner:x", digest: { sha256: "b".repeat(64) } },
        ],
        predicateType: SKILL_REFINER_PASS_V1_URI,
        // rekor_log_index lives on the STATEMENT (sibling to predicate) — the
        // signed body schema is .strict() and rejects it; the Rekor reference is
        // envelope-time verification metadata, not a determinant of the body.
        rekor_log_index: 1809941980,
        predicate: {
          verdict: "accept",
          reason: ["ok"],
          refiner_strategy_id: "naive-in-context",
          skill_version_id: "018f6b1e-7c00-7aaa-8bbb-000000000009",
          parent_version_id: null,
          source_snapshot_hash: `sha256:${"a".repeat(64)}`,
          result_snapshot_hash: `sha256:${"b".repeat(64)}`,
          eval_set_ref: {
            hash: `sha256:${"c".repeat(64)}`,
            version: "1.0.0",
            lineage_id: "018f6b1e-7c00-7aaa-8bbb-00000000000a",
          },
          edit_proposal_hash: `sha256:${"d".repeat(64)}`,
          behavioral_delta: 0.2,
          named_dimension_deltas: [],
          alpha: 0.05,
          test_statistic_kind: "one-sided-z",
        },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rekorRef).toBe("1809941980");
  });
});

describe("stripRefinerPassRows — decision-path isolation (r8ir.1)", () => {
  it("removes skill-refiner-pass rows from the v2 array while keeping gate-result rows", () => {
    const bundle = JSON.parse(
      readFileSync(REFINER_PASS_BUNDLE, "utf8"),
    ) as unknown[];
    const stripped = stripRefinerPassRows(bundle) as unknown[];

    expect(Array.isArray(stripped)).toBe(true);
    // 4 rows in (2 gate-result + 2 refiner) → 2 gate-result rows out
    expect(stripped).toHaveLength(2);
    for (const row of stripped) {
      expect((row as { predicateType: string }).predicateType).toBe(
        GATE_RESULT_V1_URI,
      );
    }
  });

  it("removes refiner rows from the v1 container form, preserving sibling keys", () => {
    const arr = JSON.parse(
      readFileSync(REFINER_PASS_BUNDLE, "utf8"),
    ) as unknown[];
    const container = { bundle_format: "json-array", rows: arr };
    const stripped = stripRefinerPassRows(container) as {
      bundle_format: string;
      rows: unknown[];
    };

    expect(stripped.bundle_format).toBe("json-array");
    expect(stripped.rows).toHaveLength(2);
  });

  it("returns a non-bundle shape unchanged (leaves it for the fail-closed path)", () => {
    expect(stripRefinerPassRows(null)).toBeNull();
    expect(stripRefinerPassRows({ not: "a bundle" })).toEqual({
      not: "a bundle",
    });
  });
});

describe("renderSummary — advisory Skill Refiner section (r8ir.1)", () => {
  it("renders the advisory section with accepted count + per-row detail", () => {
    const md = renderSummary("allow", [], null, [
      {
        verdict: "accept",
        skillVersionId: "018f6b1e-7c00-7aaa-8bbb-000000000001",
        behavioralDelta: 0.12,
        rekorRef: null,
      },
      {
        verdict: "reject",
        skillVersionId: "018f6b1e-7c00-7aaa-8bbb-000000000003",
        behavioralDelta: 0.004,
        rekorRef: "1809941980",
      },
    ]);

    expect(md).toContain("### Skill Refiner (advisory)");
    // 1 accept of the 2 rows; explicitly states it does not affect the decision
    expect(md).toContain("**1** accepted refinement attested");
    expect(md).toContain("does not affect the ship/no-ship decision");
    expect(md).toContain("| Verdict | SkillVersion | Behavioral Δ | Rekor |");
    expect(md).toContain(
      "| accept | `018f6b1e-7c00-7aaa-8bbb-000000000001` | 0.12 | staging |",
    );
    expect(md).toContain(
      "| reject | `018f6b1e-7c00-7aaa-8bbb-000000000003` | 0.004 | `1809941980` |",
    );
  });

  it("omits the advisory section entirely when there are no refiner rows (back-compat)", () => {
    const md = renderSummary("allow", [], null);
    expect(md).not.toContain("### Skill Refiner");
  });
});

describe("action self-test — skill-refiner-pass is VERDICT-INVARIANT (r8ir.1)", () => {
  it("SHIP: a bundle carrying refiner-pass rows still yields decision=allow and surfaces the advisory section", async () => {
    process.env.GITHUB_STEP_SUMMARY = "/tmp/refiner-summary";
    inputs.set("bundle-path", REFINER_PASS_BUNDLE);
    inputs.set("policy-path", POLICY);

    await run();

    expect(outputs.get("decision")).toBe("allow");
    expect(reasonsOutput()).toEqual([]);
    expect(setFailed).not.toHaveBeenCalled();
    // advisory info log + summary section both fired
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("Skill Refiner: 1 accepted refinement(s)"),
    );
    expect(summaryRaw.join("\n")).toContain("### Skill Refiner (advisory)");
  });

  it("VERDICT-INVARIANCE: the SAME gate-result rows decide identically with vs without refiner-pass rows present", async () => {
    // Bundle A: gate-result rows ONLY (allow-bundle = synth-gate-1 + -2, both pass)
    inputs.set("bundle-path", ALLOW_BUNDLE);
    inputs.set("policy-path", POLICY);
    await run();
    const decisionWithout = outputs.get("decision");
    const reasonsWithout = reasonsOutput();

    // reset harness state between the two runs
    inputs.clear();
    outputs.clear();
    summaryRaw.length = 0;
    vi.clearAllMocks();

    // Bundle B: the EXACT same two gate-result rows + 2 refiner-pass rows
    inputs.set("bundle-path", REFINER_PASS_BUNDLE);
    inputs.set("policy-path", POLICY);
    await run();
    const decisionWith = outputs.get("decision");
    const reasonsWith = reasonsOutput();

    // decision + reasons are byte-identical: the refiner rows never touched the verdict
    expect(decisionWith).toBe(decisionWithout);
    expect(decisionWith).toBe("allow");
    expect(reasonsWith).toEqual(reasonsWithout);
    expect(reasonsWith).toEqual([]);
  });

  it("MALFORMED refiner row NEVER hard-fails: a bad refiner body is ignored and the gate-result decision stands", async () => {
    inputs.set("bundle-path", REFINER_PASS_MALFORMED_BUNDLE);
    inputs.set("policy-path", POLICY);

    await run();

    // the two gate-result rows both pass → allow; the malformed refiner row was
    // silently dropped (not surfaced, not a block, no advisory info log)
    expect(outputs.get("decision")).toBe("allow");
    expect(reasonsOutput()).toEqual([]);
    expect(setFailed).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalledWith(
      expect.stringContaining("Skill Refiner:"),
    );
    expect(outputs.get("summary")).not.toContain("### Skill Refiner");
  });
});
