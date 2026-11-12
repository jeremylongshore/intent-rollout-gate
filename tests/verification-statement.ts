export function statement() {
  return {
    _type: "https://in-toto.io/Statement/v1",
    predicateType: "https://evals.intentsolutions.io/gate-result/v1",
    subject: [
      {
        name: "synth-tool:ci:synth-gate-1",
        digest: { sha256: "a".repeat(64) },
      },
    ],
    predicate: {
      gate_id: "synth-tool:ci:synth-gate-1",
      gate_name: "synth-gate-1",
      gate_version: "1.0.0",
      gate_decision: "pass",
      gate_reasons: [],
      coverage: { dimensions_evaluated: ["static"], dimensions_skipped: [] },
      policy_ref: `sha256:${"a".repeat(64)}:tests/TESTING.md`,
      policy_hash: `sha256:${"a".repeat(64)}`,
      input_hash: `sha256:${"a".repeat(64)}`,
      evaluated_at: "2026-06-10T12:00:00Z",
      runner: "synthetic-offline@1.0.0",
      commit_sha: "b".repeat(40),
    },
  };
}
