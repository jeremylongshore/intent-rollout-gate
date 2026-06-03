# 001-DR-DESIGN—Rollout Gate Architecture

**Date:** 2026-05-12
**Status:** Authored at M4 substantive bootstrap. Implementation begins M5.
**Source narrative:** [`intent-eval-lab/000-docs/007-DR-BRIEF-intent-eval-platform-system-brief-2026-05-11.html`](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/007-DR-BRIEF-intent-eval-platform-system-brief-2026-05-11.html) § 8 ("The Rollout Gate") and § 9 ("How It All Works Together").
**Authoritative spec input:** [`intent-eval-lab/specs/evidence-bundle/v0.1.0-draft/SPEC.md`](https://github.com/jeremylongshore/intent-eval-lab/blob/main/specs/evidence-bundle/v0.1.0-draft/SPEC.md).

## 1. Purpose

The Rollout Gate is the **fourth and final repo** in the Intent Eval Platform convergence. Its role is to **close the loop from evaluation to deployment decision**: read the [Evidence Bundle](https://github.com/jeremylongshore/intent-eval-lab/tree/main/specs/evidence-bundle) produced by `audit-harness` and `j-rig-binary-eval`, evaluate it against a declared policy, and emit a ship / no-ship verdict that a CI pipeline can consume as a status check.

The gate makes no novel attestations of code quality. It's strictly a **decision tier** above the bundle: the bundle is the input, the policy is the threshold, the decision is the output. The decision itself is an attestation (signed in-toto row at `https://evals.intentsolutions.io/rollout-decision/v1`) so it's independently verifiable downstream.

## 2. What it consumes

A directory, JSONL file, or JSON-array file containing zero-or-more in-toto Statement v1 rows whose `predicateType` is `https://evals.intentsolutions.io/gate-result/v1`. Per Evidence Bundle SPEC R1–R3, the bundle is composable and rows are independently verifiable.

The bundle is produced upstream in the same CI pipeline. Typical producers:

| Producer | Surface | Predicate body fields populated |
| --- | --- | --- |
| `audit-harness emit-evidence` (planned, M5+ for AH) | Static gates: `escape-scan`, `harness-hash`, `crap-score`, `arch`, `bias`, `gherkin-lint` | `gate_id`, `result`, `policy_hash`, `input_hash`, `timestamp`, `runner`, `commit_sha` |
| `j-rig` (planned, M5+ for JRig) | Behavioral gates: MM-1..MM-6 verdicts, per-skill pass/fail | All of the above + `failure_mode` for FAIL rows + `advisory_severity` for ADVISORY rows |
| Third-party tools | Anything emitting `gate-result/v1` rows | Per spec R5 |

The gate **doesn't require complete coverage** (per Evidence Bundle SPEC R2 / system brief § 8 ¶3). A partial bundle is valid input; the policy decides whether the partial coverage is sufficient.

## 3. The policy interface—`tests/TESTING.md`

The policy the gate enforces is declared in the consuming repository's `tests/TESTING.md` file—the same file that `audit-harness` already reads for its thresholds. Coupling the gate to the existing policy file is intentional:

- **Enforcement travels with the code.** Anyone who clones the repo and runs CI gets the same gate with the same thresholds.
- **No external configuration.** No SaaS dashboard to log into. No vendor-specific YAML format to learn outside the repo.
- **Single source of truth.** The thresholds upstream tools enforce *as they emit rows* are the same thresholds the rollout gate enforces *when it composes the verdict*. Drift between "static gate threshold" and "rollout policy threshold" is impossible by construction.

The gate reads policy clauses out of `tests/TESTING.md` via:

| Clause shape | Example | Decision implication |
| --- | --- | --- |
| **Required-gate list** | `Required gates: escape-scan, harness-hash, MM-1, MM-4` | Each listed `gate_id` must appear in the bundle with `result == PASS`. Any FAIL → no-ship. Any missing → no-ship (unless explicitly waived). |
| **Coverage minimum** | `Minimum applicable coverage: 5/6 MM categories` | Of the rows whose `gate_id` is in the policy's applicable set, at least N must be present. NOT_APPLICABLE rows count as covered (per Evidence Bundle SPEC R6). |
| **Pass-rate floor** | `Behavioral pass rate: ≥ 80%` | Of rows with `result ∈ {PASS, FAIL}` in the named scope, the PASS fraction must meet the floor. |
| **Advisory elevation** | `Elevate advisory: bias-count when severity == error` | An ADVISORY row that would otherwise be informational becomes blocking under the named condition. |
| **Failure-mode block** | `Block on failure_mode: MM-4` | Even if the overall pass rate would meet the floor, any FAIL with this `failure_mode` blocks ship. |

The policy schema is **not** itself a peer spec module under the Evidence Bundle URI (per Evidence Bundle SPEC R14). This action's `action.yml` declares its expected inputs; the policy parser implementation in M5 defines the actual grammar accepted in `tests/TESTING.md`.

## 4. The decision algorithm

Pseudocode for the M5 implementation. Three stages:

### Stage 1—Verify

For each row in the bundle:

1. Validate the row is a well-formed in-toto Statement v1.
2. Validate the row's `predicateType` matches the configured `predicate-uri` input.
3. Validate the predicate body against the JSON Schema at `gate-result.schema.json`.
4. Validate `subject[].digest.sha256 == predicate.input_hash` (Evidence Bundle SPEC R9).
5. Validate the DSSE signature (Evidence Bundle SPEC R13.1).
6. If the row claims Rekor anchoring, confirm the entry exists (R13.4).

Rows that fail any check are dropped from the eligible set with a clear note in the decision summary. The bundle as a whole doesn't fail merely because some rows fail verification—partial verification is a recoverable condition, the policy decides whether the verified subset is sufficient.

### Stage 2—Evaluate

Given the verified row set + the parsed policy:

1. **Required-gate pass.** For each entry in `Required gates`, find the row with matching `gate_id`. PASS → continue. FAIL → block. Missing → block (unless waived).
2. **Applicable-only coverage.** For each named applicable set, count covered (rows present, regardless of PASS/FAIL/NOT_APPLICABLE). Compare to the minimum. Below → block.
3. **Pass-rate floor.** For each named scope, compute PASS / (PASS + FAIL). Below floor → block.
4. **Advisory elevation.** For each elevation rule, check whether matching ADVISORY rows meet the trigger. If so, treat as FAIL for blocking purposes.
5. **Failure-mode block.** For each blocked `failure_mode`, scan FAIL rows. Any match → block.

The decision is the AND of all stages: any block → `no-ship`. All clear → `ship`. Pure-advisory state (no blocks, but at least one un-elevated ADVISORY) → `advisory`.

### Stage 3—Emit

1. **PR comment.** Markdown summary: gate-by-gate result table, coverage table, list of failing rows with their `failure_mode`, list of advisories.
2. **GitHub status check.** Pass / fail mapped to the `decision`. `advisory` maps to a "neutral" status by default (configurable).
3. **Signed decision row.** A new in-toto Statement v1 row with `predicateType: https://evals.intentsolutions.io/rollout-decision/v1`. Predicate body includes the input bundle's content hash, the policy file's content hash, the verdict, the pass/fail row counts, and the commit SHA. Signed with Cosign (keyless OIDC by default; key-based via `cosign-key` input).
4. **Rekor anchor (optional).** If `rekor-url` is non-empty AND the DNSSEC + CAA pre-condition is met (see § 5), push to Rekor.
5. **OTel events.** Fire `agent.rollout.gate.decision_made` with attributes `gate.decision`, `gate.policy_hash`, `gate.bundle_row_count`, `gate.commit_sha` (per [`intent-eval-lab/000-docs/001-DR-RFC-otel-agent-rollout-gate-signals-draft.md`](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/001-DR-RFC-otel-agent-rollout-gate-signals-draft.md)).

## 5. CISO + compliance bindings

These constraints are inherited from ISEDC Decision Record 004 § 6 ([`intent-eval-lab/000-docs/004-AT-DECR-isedc-council-record-2026-05-10.md`](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/004-AT-DECR-isedc-council-record-2026-05-10.md)). They're **non-negotiable** for any implementation PR.

1. **Predicate URI immutability.** The strings `https://evals.intentsolutions.io/gate-result/v1` (consumed) and `https://evals.intentsolutions.io/rollout-decision/v1` (emitted) are permanent once any row referencing them is signed and pushed to Rekor. Breaking changes mint `/v2`. Never reformat, never namespace-rename.
2. **DNSSEC + CAA pre-condition for Rekor push.** Before this action pushes any signed attestation referencing a `evals.intentsolutions.io` URI to Rekor, it MUST verify (a) DNSSEC is enabled on the namespace, (b) CAA records are pinned to a single Certificate Authority. Failing the check, refuse the push with a clear error message that names the missing precondition. This check belongs in the Rekor-push code path; it's not optional.
3. **`labs.intentsolutions.io` reserved-don't-touch.** The action MUST refuse to operate against any predicate URI under `labs.intentsolutions.io`. That subdomain is reserved for content surface (blog, methodology landing pages); any attestation surface under it would create a DNS / brand-isolation violation.
4. **Credential redaction.** Error messages and PR-comment summary outputs MUST redact OIDC subjects, Fulcio cert content, signing key paths, and any other credential-adjacent data. A test in M5 must enforce this (carried from ISEDC PASS/FAIL gate posture for j-rig provider adapters).
5. **No partner names in test fixtures.** Per the partner-consent discipline in `intent-eval-lab/CLAUDE.md` § "Brand-name policy," no partner engagement is named in fixtures. Use synthetic gate IDs (`synth-gate-1`, `synth-gate-2`, etc.).

## 6. Output formats

### 6.1 PR comment (markdown)

```markdown
## Intent Rollout Gate — DECISION: no-ship

**Bundle:** evidence/ (12 rows, 12 verified)
**Policy:** tests/TESTING.md (sha256:abc123…)
**Commit:** def456…

### Required gates
| Gate | Result |
| --- | --- |
| escape-scan | ✅ PASS |
| harness-hash | ✅ PASS |
| MM-1 | ✅ PASS |
| MM-4 | ❌ FAIL — side-effect not verified |

### Coverage
- Static gates: 6/6 ✅
- Behavioral MM categories: 4/6 (MM-3, MM-6 → NOT_APPLICABLE) ✅

### Advisories
- bias-count → 2 (warn)

**Reason for no-ship:** MM-4 FAIL with failure_mode `MM-4` is a blocked failure mode in tests/TESTING.md.

[Signed decision row](evidence/rollout-decision-…json) · [Rekor entry pending DNSSEC]
```

### 6.2 GitHub status check

| Decision | Status | Description |
| --- | --- | --- |
| `ship` | success | "All gates met policy" |
| `no-ship` | failure | "<N> blockers; see PR comment" |
| `advisory` | neutral | "<N> advisories; no blockers" |
| `not-implemented` | success | "Rollout Gate v0.0.0 bootstrap—no enforcement" |

### 6.3 Signed decision row (in-toto)

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "predicateType": "https://evals.intentsolutions.io/rollout-decision/v1",
  "subject": [{
    "name": "intent-rollout-gate:ci:rollout-decision",
    "digest": {"sha256": "<bundle content hash>"}
  }],
  "predicate": {
    "decision": "no-ship",
    "bundle_row_count": 12,
    "verified_row_count": 12,
    "passed_required_gates": ["escape-scan", "harness-hash", "MM-1"],
    "failed_required_gates": ["MM-4"],
    "policy_hash": "sha256:abc123…",
    "input_hash": "sha256:bundle-content-hash",
    "timestamp": "2026-05-12T14:30:00Z",
    "runner": "intent-rollout-gate@0.1.0",
    "commit_sha": "def456…"
  }
}
```

## 7. OTel events fired

Per [`intent-eval-lab/000-docs/001-DR-RFC-otel-agent-rollout-gate-signals-draft.md`](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/001-DR-RFC-otel-agent-rollout-gate-signals-draft.md):

| Event | When | Key attributes |
| --- | --- | --- |
| `agent.rollout.gate.bundle_loaded` | After bundle read + parse | `gate.bundle_row_count`, `gate.bundle_format` (dir / jsonl / array) |
| `agent.rollout.gate.row_verified` | Per row, post-verify | `gate.id`, `gate.result`, `gate.runner`, `gate.verification_passed` |
| `agent.rollout.gate.policy_evaluated` | After policy eval | `gate.policy_hash`, `gate.required_gates_passed`, `gate.coverage_met`, `gate.pass_rate` |
| `agent.rollout.gate.decision_made` | After verdict | `gate.decision`, `gate.commit_sha`, `gate.signed_decision_row_path` |
| `agent.rollout.gate.rekor_anchored` | After successful Rekor push | `gate.rekor_url`, `gate.rekor_uuid` |

Spans correlate via the standard OTel trace context. Operators can filter on `gate.decision == "no-ship"` to alert on every blocked deployment, regardless of which repo emitted the event.

## 8. Language choice—DEFERRED to first M5 PR

Three viable runtimes. The first M5 PR will lock the choice; until then, `action.yml` runs as a composite shell stub.

| Track | Pros | Cons |
| --- | --- | --- |
| **TypeScript / Node 20+** | Sister-repo parity (j-rig is TS); easiest to share Zod schemas with j-rig (`@j-rig/core` already validates Evidence Bundle rows in JRIG-5); GitHub's `@actions/core` + `@actions/github` give ergonomic PR-comment + status-check APIs; npm distribution to `@intentsolutions/` org is set up. | Cold-start overhead in CI (vs. compiled binary); supply-chain surface area larger than Go. |
| **Go 1.26+** | Compiled binary, fast cold start; sigstore-go is mature for cosign keyless + Rekor verify; smallest supply-chain surface; in-toto Go libraries are first-class. | No sister-repo parity; can't directly share Zod schemas with j-rig (would need codegen or duplicate JSON Schema validation); `@actions/core` equivalents in Go are less ergonomic (raw `os.Setenv` + GITHUB_OUTPUT manipulation). |
| **Python 3.12+** | sigstore-python is the reference cosign keyless implementation; `tests/TESTING.md` parsing is easy in Python; partner repos that ship Python pre-commit hooks could vendor the parser. | No sister-repo parity (audit-harness is polyglot but Python is one of several); cold start similar to Node; packaging via PyPI adds another distribution channel to maintain. |

**Recommendation deferred until M5 PR.** Tradeoffs to explicitly weigh in the M5 lock decision:

- Schema-sharing with j-rig is a real win for TypeScript—but the Evidence Bundle Schema is JSON Schema, which is portable to any runtime via codegen. So "schema reuse" is a soft argument.
- The CISO binding for DNSSEC + CAA verification at runtime is straightforward in any of the three runtimes (each has a DNS library that exposes DNSSEC validation).
- The credential-redaction test surface (CISO binding § 5.4) is comparably easy in all three.
- **The strongest argument for Go is operational**: a compiled binary is the simplest supply-chain story for downstream adopters who pin action versions. The strongest argument for TS is **maintainer-time parity** with j-rig.

The decision belongs to the maintainer at the time of the M5 PR—not preemptively in this M4 doc. Both arguments are honest.

## 9. Why M4 ships only the bootstrap

Per the build journey master plan (`~/.claude/plans/se-the-council-bubbly-frog.md`, maintainer-side), M4 is "create the repo because there's actual code to put in it (Rollout Gate implementation lands in M5)." Three reasons to land the substantive bootstrap *now* rather than wait for M5:

1. **The repo URL must exist before any docs can link to it.** System brief § 8, the Evidence Bundle SPEC § 2.2 (out-of-scope statement that names this repo), the OTel RFC, and the convergence umbrella issue all reference `intent-rollout-gate` by name. Repo-not-found 404s in those references would be visible quality gaps.
2. **The action declaration must be wireable into CI workflows that adopters are already drafting.** Even with v0.0.0 being a no-op, downstream teams can wire `uses: jeremylongshore/intent-rollout-gate@v1` and have the workflow validate cleanly. When v0.1.0 lands, the wiring doesn't change—only the runtime behavior does.
3. **The architecture doc landing now** lets reviewers (council members, partner engineering leads, future contributors) react to the design before code is poured in. The deferred-decision callout for the runtime language is intentional: the M5 PR author should have read this doc and made the call deliberately.

## 10. Open questions deferred to M5

| Question | Owner of decision |
| --- | --- |
| Runtime language (TS / Go / Python) | First M5 PR |
| Whether the policy parser accepts a YAML block inside `tests/TESTING.md` or parses the markdown table directly | First M5 PR + audit-harness team |
| Default behavior when a bundle is empty (zero rows)—block, advisory, or pass | First M5 PR |
| Whether `advisory` decisions auto-elevate to `no-ship` when configurable thresholds are exceeded | M5 first-adopter feedback (`audit-harness` self-adoption in M6) |
| OTel exporter wiring—does the action ship its own exporter or rely on the runner's OTel collector | First M5 PR + OTel SIG-GenAI feedback |

---

## Cross-references

- Evidence Bundle SPEC: `intent-eval-lab/specs/evidence-bundle/v0.1.0-draft/SPEC.md`
- System brief: `intent-eval-lab/000-docs/007-DR-BRIEF-intent-eval-platform-system-brief-2026-05-11.html`
- OTel RFC draft: `intent-eval-lab/000-docs/001-DR-RFC-otel-agent-rollout-gate-signals-draft.md`
- ISEDC Decision Record (Phase B): `intent-eval-lab/000-docs/004-AT-DECR-isedc-council-record-2026-05-10.md` § 6 (CISO bindings)
- Convergence umbrella: [intent-eval-lab#4](https://github.com/jeremylongshore/intent-eval-lab/issues/4)
