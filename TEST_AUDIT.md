# TEST_AUDIT.md — intent-rollout-gate

Diagnostic-only test-suite audit (the `/audit-tests` output). Classifies the
repo, maps it against the 7-layer Intent Solutions testing taxonomy, and lists
the genuine gaps. The companion implementation (cluster bead `4hk3`) closes the
gaps marked **GAP** below; this file is the spec it implements against.

| Field | Value |
|---|---|
| Repo | `intent-rollout-gate` (`intent-rollout-gate-action`) |
| Classification | **GitHub Action** (composite delegate shell) — `audit-harness classify` → `kind: action`, signal `action.yml` |
| Runtime | `node24` action (`action.yml runs.using`); bundled to `dist/index.js` via esbuild |
| Role in platform | Thin GitHub Actions shell. ALL decision logic is delegated to `@intentsolutions/rollout-gate`; the kernel `@intentsolutions/core` owns the predicate URI + the `gate-result/v1` body schema. |
| Test framework | vitest 3 (`tests/**/*.test.ts`, `tests/setup.ts` shim) |
| Audited at | branch `feat/iar-kernel-and-test-suite`, base commit `ea77d6a` |

## What this repo IS (and is not)

This is a **delegating action shell**, not a decision engine. The architectural
contract (`src/run.ts` header, Blueprint A, DR-002 § 6.1) is:

- The shell owns **wiring only**: input reading + validation, file I/O,
  output + step-summary rendering, exit-code plumbing, fail-closed behavior.
- The shell owns **NO gate semantics**. `decide()` from
  `@intentsolutions/rollout-gate` is the sole source of the ship / no-ship call.
- The shell owns **NO predicate definition**. `GATE_RESULT_V1_URI` and
  `GateResultV1Schema` come from `@intentsolutions/core` (the SSoT kernel).

The testing strategy must therefore be **fixture-dominant**: an Evidence
Bundle + a policy fed through the real `decide()`/`run()` path, asserting the
EXACT emitted decision string + reasons + exit behavior. Re-testing the decision
algebra itself is out of scope (it is tested upstream in the package).

## 7-layer taxonomy mapping

| Layer | Applies? | Status | Notes |
|---|---|---|---|
| **L1 — git hooks / escape-scan** | Partial | ADVISORY | `audit-harness verify` runs in CI; no `.feature`/coverage-config files to pin by default → `.harness-hash` is hollow (see GAP-4). |
| **L2 — static (typecheck / lint)** | Yes | PRESENT | `pnpm run typecheck` (tsc `--noEmit`, strict + `noUncheckedIndexedAccess`). `action.yml` structural lint job in CI. |
| **L3 — unit** | Yes | PRESENT | `tests/run.test.ts` — pure helpers (`renderSummary`) + the wiring branches via a mocked `@actions/core`. |
| **L4 — integration** | Yes (PRIMARY) | PRESENT + **GAP** | The dominant layer for an action: fixture bundle + policy → real `decide()`/`run()` → exact output. Strong coverage of validation/fail-closed branches; **GAP-1** below adds the explicit ship/no-ship/advisory self-test fixture. |
| **L5 — system** | Yes | PRESENT (CI) | `ci.yml smoke-action` job runs the built action against fixtures end-to-end and asserts outputs. |
| **L6 — E2E** | N/A | — | No deployed surface; the action runs in a consumer workflow. CI smoke (L5) is the realistic ceiling. |
| **L7 — acceptance** | N/A | — | No `.feature`/BDD surface; the action's acceptance contract is the I/O of `action.yml`, exercised by L4 + L5. |

## Cross-cutting gates

| Gate | Status | Notes |
|---|---|---|
| Kernel as source of truth | **GAP-3** | `src/run.ts` carried a hand-rolled `SUPPORTED_PREDICATE_URI` string — a local duplicate of a kernel-owned artifact. Must import `GATE_RESULT_V1_URI` from `@intentsolutions/core` instead. |
| dist-sync | PRESENT | `ci.yml` rebuilds `dist/` and fails on any diff. The committed bundle must track source. |
| Credential redaction | **GAP-2** | No test asserts that secrets/credentials (e.g. the reserved `cosign-key` input, a secret smuggled into a policy field) never reach outputs / step summary / logs. |
| Testing policy spec | **GAP-4** | `tests/TESTING.md` and `.harness-hash` are 0-byte stubs — criterion 4 is hollow. |

## Genuine gaps (the `4hk3` + `ssqd` implementation targets)

- **GAP-1 — action self-test, fixture dominant.** Add a fixture EvidenceBundle +
  policy fed through `decide()`/`run()` asserting the EXACT `allow` / `block`
  output with non-tautological, asymmetric inputs. Specifically: an all-pass
  bundle → `allow`; a fail-row bundle → `block` naming the offending gate; and
  an advisory bundle that flips ship → no-ship purely on the `advisory_blocks`
  policy knob (the same bundle, two policies, two decisions — isolating the
  policy as the sole cause).
- **GAP-2 — credential redaction.** Assert that a secret fed via the reserved
  `cosign-key` input, or smuggled into a policy field, never appears in any
  output, the step-summary markdown, or any `info`/`warning`/`setFailed` log
  argument — on both the allow and block paths.
- **GAP-3 — kernel source of truth.** Replace the hand-rolled
  `SUPPORTED_PREDICATE_URI` with `GATE_RESULT_V1_URI` imported from
  `@intentsolutions/core`; assert (by identity, not a hard-coded copy) that the
  shell constant equals the kernel constant. Optionally narrow consumed
  gate-result rows through `GateResultV1Schema` as an ADDITIVE advisory that
  never overrides the delegated decision.
- **GAP-4 — testing policy + hash pin.** Author a real `tests/TESTING.md` (the
  coverage floor, the gates, the layers that apply to an action repo), and
  generate a real `.harness-hash` covering the policy-bearing tree
  (`action.yml`, `tests/TESTING.md`) via `audit-harness init` + a
  `.harness-hash-extra-patterns` file, AFTER the test files are final.

## Resolution

All four gaps are closed on branch `feat/iar-kernel-and-test-suite`:
`tests/run.test.ts` now carries the fixture-dominant self-test + redaction
suites; `src/run.ts` consumes the kernel constant + schema; `tests/TESTING.md`
is the real policy spec; `.harness-hash` pins the policy surface. See
`tests/TESTING.md` for the live policy and the CI wiring in `.github/workflows/ci.yml`.
