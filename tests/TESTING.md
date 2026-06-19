# tests/TESTING.md — intent-rollout-gate testing policy

The canonical testing-policy spec for this repo. Per the Intent Solutions
Testing SOP, enforcement travels with the code: every gate below is wired in
`.github/workflows/ci.yml` and references the in-repo
`@intentsolutions/audit-harness` (never a `~/.claude/` path). The 7-layer
taxonomy mapping and the gap-analysis that produced this policy live in
`TEST_AUDIT.md` at the repo root.

## Repo classification

- **Type:** GitHub Action (composite delegate shell). `audit-harness classify`
  → `kind: action`, signal `action.yml`.
- **Architecture:** thin shell — ALL rollout-decision logic is delegated to
  `@intentsolutions/rollout-gate`; the predicate URI + `gate-result/v1` body
  schema come from `@intentsolutions/core` (the SSoT kernel). This repo owns
  wiring (input validation, file I/O, output + step-summary rendering,
  fail-closed exit plumbing) and nothing else.
- **Consequence for testing:** the suite is **fixture-dominant**. We assert the
  EXACT emitted decision for a given Evidence Bundle + policy; we do NOT
  re-test the decision algebra (owned + tested upstream in the package) or the
  predicate schema (owned + tested upstream in the kernel).

## Policy thresholds

These keys are read by `audit-harness escape-scan` (an explicit edit that
lowers any of them below the floor is treated as an escape attempt):

```yaml
coverage.line: 85
coverage.branch: 80
mutation.kill_rate: 70
```

Rationale: `src/run.ts` is small (~290 LOC) and entirely branch-driven
(fail-closed wiring), so a high line + branch floor is realistic. Mutation
testing is not yet wired in CI; the `mutation.kill_rate` floor is declared so
the policy is complete and any future Stryker config inherits a real target.
The decision-logic mutation budget lives upstream in `@intentsolutions/rollout-gate`.

## Layers that apply (and how they are enforced)

| Layer | Applies | Enforcement |
|---|---|---|
| L1 — git hooks / harness integrity | Yes (advisory) | `audit-harness verify` in CI (`.harness-hash` pins the policy surface — `action.yml`, `tests/TESTING.md` — via `.harness-hash-extra-patterns`). |
| L2 — static | Yes | `pnpm run typecheck` (tsc strict, `noUncheckedIndexedAccess`) + `action.yml` structural lint. |
| L3 — unit | Yes | `tests/run.test.ts` — pure helpers (`renderSummary`, `countKernelInvalidPredicates`) over a mocked `@actions/core`. |
| L4 — integration (PRIMARY) | Yes | Fixture Evidence Bundle + policy → real `decide()`/`run()` → exact decision + reasons + exit behavior. The dominant layer for this action. |
| L5 — system | Yes | `ci.yml smoke-action` runs the built action against fixtures end-to-end and asserts outputs. |
| L6 — E2E | N/A | No deployed surface; the consumer workflow is the real E2E, exercised by L5. |
| L7 — acceptance | N/A | No BDD/`.feature` surface; the action's acceptance contract is `action.yml`'s I/O, covered by L4 + L5. |

## Mandatory test properties

1. **Fixture-dominant self-test.** A fixture EvidenceBundle + policy MUST be
   fed through `decide()`/`run()` asserting the exact `allow` / `block` output.
   Inputs MUST be asymmetric and non-tautological — e.g. the SAME advisory
   bundle MUST flip ship → no-ship purely on the `advisory_blocks` policy knob.
2. **Fail-closed coverage.** Every wiring failure path (missing/unreadable
   bundle, both-or-neither policy source, invalid policy, unsupported
   predicate-uri, unexpected error) MUST assert a `block` decision.
3. **Credential redaction.** No secret/credential supplied via inputs (the
   reserved `cosign-key`, or a secret smuggled into a policy field) may appear
   in any output, the step-summary markdown, or any `info`/`warning`/`setFailed`
   log argument — on both allow and block paths.
4. **Kernel source of truth.** `SUPPORTED_PREDICATE_URI` MUST equal
   `GATE_RESULT_V1_URI` from `@intentsolutions/core` by identity (no local
   duplicate). Consumed gate-result rows MAY be narrowed through
   `GateResultV1Schema`, but only as an ADDITIVE advisory that never overrides
   the delegated decision.
5. **dist sync.** `dist/index.js` is a committed artifact. Any source change
   MUST be accompanied by a rebuild (`pnpm run build`); CI fails on a stale dist.

## CI gates (`.github/workflows/ci.yml`)

| Job | Gate |
|---|---|
| `check` | `audit-harness verify` → typecheck → `vitest run` → dist-sync (rebuild + `git diff --exit-code dist/`). |
| `lint-action-yaml` | `action.yml` is well-formed YAML with required `name`/`description`/`runs` + node `runs.main`. |
| `smoke-action` | runs the built action against `tests/fixtures/` allow + fail-row bundles and asserts the emitted `decision`/`reasons`. |

## Changing this policy

Editing a threshold above requires a paired re-init of the hash manifest in the
same commit:

```bash
pnpm exec audit-harness init   # re-pin after a reviewed policy edit
```

An AI-proposed threshold edit without a paired `init` fails `audit-harness verify`
in CI by design.
