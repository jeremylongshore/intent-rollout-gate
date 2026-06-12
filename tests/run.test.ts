/**
 * Unit tests for the Action SHELL wiring only. Decision semantics belong to
 * the @intentsolutions/rollout-gate package and are tested upstream; here we
 * prove the wiring: input validation, policy-source resolution, fail-closed
 * file handling, output plumbing, summary rendering, and exit behavior.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { renderSummary, run } from "../src/run";

const fixture = (...parts: string[]): string =>
  join(__dirname, "fixtures", ...parts);

const ALLOW_BUNDLE = fixture("evidence", "allow-bundle.json");
const FAIL_ROW_BUNDLE = fixture("evidence", "fail-row-bundle.json");
const MALFORMED_BUNDLE = fixture("evidence", "malformed-bundle.json");
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
    inputs.set("policy-json", JSON.stringify({ required_gates: ["synth-tool:ci:*"] }));

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
    expect(setFailed).toHaveBeenCalledWith(expect.stringContaining("Rollout blocked"));
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
    expect(reasonsOutput()[0]).toContain("unreadable or invalid-JSON Evidence Bundle");
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
    inputs.set("predicate-uri", "https://evals.intentsolutions.io/gate-result/v2");

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
    expect(md).toContain("| `synth-tool:ci:*` | not-passing | `synth-tool:ci:synth-gate-2` |");
    // pipes inside table cells are escaped so the table doesn't break
    expect(md).toContain("| 0 | `synth-tool:ci:synth-gate-2` | forbidden \\| decision |");
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
