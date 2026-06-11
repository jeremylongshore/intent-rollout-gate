---
title: Repo Blueprint — intent-rollout-gate
date: 2026-06-11
authors:
  - Jeremy Longshore (Intent Solutions)
status: NORMATIVE
binding_authority: iar-E01
inherits_from:
  - intent-eval-lab/000-docs/011-AT-ARCH-ecosystem-master-blueprint.md (Blueprint A)
  - intent-eval-lab/000-docs/012-AT-ARCH-platform-runtime-blueprint.md (Blueprint B)
  - intent-eval-lab/000-docs/013-AT-SPEC-repo-blueprint-template.md (Blueprint C — this template)
related_drs:
  - 004-AT-DECR (DR-002 — runtime language TypeScript-primary)
  - intent-eval-lab/000-docs/004-AT-DECR (S1 — provider PASS/FAIL gates, partner-consent, predicate URI namespace)
  - intent-eval-lab/000-docs/010-AT-DECR (S4 — § 13.5 TS-primary signing-surface lock)
related_glossary:
  - intent-eval-lab/000-docs/014-DR-GLOS-canonical-glossary.md
filing_standard: Document Filing Standard v4.3
---

# Repo Blueprint — intent-rollout-gate

**Beads:** `bd_000-projects-gxg`

This is the NORMATIVE per-repo blueprint for `intent-rollout-gate`, authored by applying Blueprint C (`intent-eval-lab/000-docs/013-AT-SPEC-repo-blueprint-template.md`). It is the single source of truth for this repo's identity, architecture, boundaries, and Definition of Done. It inherits Blueprint A's principles + anti-goals, declares which Blueprint B canonical entities it touches, and links — never redefines — terminology from the canonical glossary. The narrative source material is the architecture design record (`001-DR-DESIGN-rollout-gate-architecture-2026-05-12.md`) and the runtime decision record (`004-AT-DECR-runtime-language-typescript-2026-06-10.md`, DR-002).

## § 1 — Repo identity

| Field              | Value                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Repo name**      | `intent-rollout-gate` (matches `gh repo view` and the local working-dir name)                                                          |
| **Type**           | `action-shell`                                                                                                                         |
| **Owner**          | `@jeremylongshore` (no `CODEOWNERS` file yet — owner is the maintainer of record until one is added)                                   |
| **Maturity**       | `pre-release` — `action.yml` is a no-op composite-shell bootstrap (v0.0.x) that emits `decision=not-implemented` and exits 0           |
| **Ecosystem role** | The fourth repo in the convergence: it consumes an Evidence Bundle plus a policy and emits a ship / no-ship / advisory CI decision.    |
| **Bead prefix**    | `iar-` (per Blueprint A § 2.1 taxonomy)                                                                                                 |
| **Plane module**   | LAB project → "Intent Eval Platform" module (IAR work is mirrored under the LAB Plane project per the ecosystem three-layer discipline) |

### 1.1 Dependencies (peer repos consumed)

Strict SemVer per Blueprint A § 4.2 — pinned to a known-good range. These dependencies land with the M5 TypeScript implementation (per DR-002); at the current v0.0.x bootstrap the composite shell consumes nothing at runtime.

| Peer repo                   | Consumed at | Pinned range                                | Cited blueprint                                                     |
| --------------------------- | ----------- | ------------------------------------------- | ------------------------------------------------------------------- |
| `intent-eval-core`          | build + test | `@intentsolutions/core >=0.2.0, <1.0.0` (planned, M5) | `intent-eval-core/000-docs/` per-repo blueprint (forward-ref) |
| `j-rig-skill-binary-eval`   | build       | `@j-rig/rollout-gate >=2.0.0, <3.0.0` (planned, gated on j-rig v2.0.0 per DR-018 § 9.2) | `j-rig-binary-eval/000-docs/` per-repo blueprint (forward-ref) |
| `audit-harness`             | test (dev)  | `@intentsolutions/audit-harness` latest (dev dependency, installed at M5 per the Testing SOP) | `audit-harness/000-docs/` per-repo blueprint (forward-ref) |

The decision logic itself is delegated to `@j-rig/rollout-gate`; this repo retains only the GitHub Action shell that wires that package into a CI job. The shell's own LOC stays ≤ 200 (see § 3.4).

### 1.2 Non-goals (inherited + repo-specific)

This repo inherits every anti-goal locked in Blueprint A § 3 (NOT a generalized autonomous agent platform; NOT a workflow automation competitor; NOT a distributed compute platform; NOT a no-code builder; NOT infinite orchestration; NOT trying to be the union of every adjacent category; AISE 5-domain stack is internal scope-map, NOT separate-brand surface). In addition, this repo specifically does NOT:

- **Re-implement decision logic.** The ship / no-ship algorithm lives in `@j-rig/rollout-gate`; this repo is a thin Action shell that delegates to it. Porting or forking that logic into this repo is a scope-creep trigger.
- **Make novel attestations of code quality.** The gate sits strictly above the bundle as a decision tier — the bundle is the input, the policy is the threshold, the decision is the output. It never re-judges the underlying gates that produced the rows.

Scope-creep into any item above triggers ISEDC re-convene per Blueprint A § 2.3 governance routing.

---

## § 2 — Problem statement

A CI pipeline that runs static gates (`audit-harness`) and behavioral gates (`j-rig`) produces an Evidence Bundle — a collection of signed, independently-verifiable in-toto rows. But a bundle is not a decision. Someone still has to read the rows, evaluate them against a declared threshold, and decide whether the change ships. Done by hand, that step is the weakest link: it is unauditable, inconsistent across repos, and drifts from the thresholds the upstream gates actually enforced.

`intent-rollout-gate` closes that loop. It reads the Evidence Bundle produced earlier in the same pipeline, evaluates it against a policy declared in the consuming repository's `tests/TESTING.md` (the same file `audit-harness` reads for its thresholds), and emits a ship / no-ship / advisory verdict that a CI pipeline consumes as a status check. The decision itself is signed (a new in-toto row at `https://evals.intentsolutions.io/rollout-decision/v1`) so it is independently verifiable downstream. This mission descends from Blueprint A § 1.1 — every verdict in the ecosystem is signed, replayable evidence, not an opaque human call.

No other ecosystem repo owns the consume-decide-emit boundary. `audit-harness` and `j-rig` *produce* rows; the kernel *defines* the schemas; the lab *specifies* the methodology. This repo is the only one that turns a bundle plus a policy into a deployment decision and hands off back to the consuming repo's CI as a status check.

---

## § 3 — Scope boundaries

### 3.1 In scope

What this repo ships, end-to-end:

- A GitHub Action (`action.yml` manifest at the repo root) that adopters wire with `uses: jeremylongshore/intent-rollout-gate@v1`.
- A thin TypeScript shell (lands at M5 per DR-002) that reads the bundle path + policy file inputs, calls `@j-rig/rollout-gate` for the decision, and renders the three outputs: a PR comment, a GitHub status check, and a signed `rollout-decision/v1` row.
- The CISO-binding enforcement at the Rekor-push boundary (DNSSEC + CAA pre-condition check, credential redaction) — implemented in code at M5, not just documented.

### 3.2 Out of scope (permanent, no FUTURE flag)

What this repo refuses to do, full stop:

- **Producing `gate-result/v1` rows.** This repo only consumes them. Emitting static or behavioral gate rows belongs to `audit-harness` and `j-rig` — moving that here would collapse the producer/consumer boundary the convergence depends on.
- **Hosting an attestation surface under `labs.intentsolutions.io`.** Predicate URIs live only at `evals.intentsolutions.io`; `labs.` is reserved-don't-touch for content surface (per ISEDC CISO binding). The action must refuse to operate against any predicate URI under `labs.intentsolutions.io`.
- **Carrying its own decision algorithm.** The decision logic is delegated to `@j-rig/rollout-gate` (see § 1.2); this repo never owns a second copy.

### 3.3 Deferred (FUTURE flag required)

What this repo defers to a later milestone.

| Deferred item                                                                  | Earliest milestone | FUTURE.md reference                                       |
| ------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------- |
| Policy-parser grammar — YAML block in `tests/TESTING.md` vs. markdown-table parse | M5 first PR        | this repo's `FUTURE.md#policy-parser-grammar` (to be filed at M5) |
| Empty-bundle (zero-rows) default behavior — block / advisory / pass            | M5 first PR        | this repo's `FUTURE.md#empty-bundle-default` (to be filed at M5)  |
| Advisory auto-elevation to no-ship when configurable thresholds exceeded       | M6 (first adopter) | this repo's `FUTURE.md#advisory-elevation` (to be filed at M5)    |
| OTel exporter wiring — ship-own-exporter vs. rely-on-runner-collector          | M5 first PR        | this repo's `FUTURE.md#otel-exporter-wiring` (to be filed at M5)  |

### 3.4 Anti-goals (binding-scope-control)

The anti-goals here are binding in the same sense as Blueprint A § 3 — scope-creep into any one triggers ISEDC re-convene.

- **Inherited from Blueprint A § 3**: NOT infinite orchestration. The gate is a single decision tier above the bundle; it does not chain, schedule, or orchestrate downstream actions beyond emitting one status check.
- **Inherited from Blueprint A § 3**: NOT a workflow automation competitor. The action is a CI status check, not a general-purpose pipeline engine.
- **Repo-specific — shell stays thin**: the Action shell's own logic stays ≤ 200 LOC. The failure mode prevented is silently re-growing a parallel decision engine inside the shell (the exact drift surface DR-002 + the kernel SSoT exist to eliminate). Any PR that pushes shell LOC past that floor by re-implementing decision logic instead of delegating to `@j-rig/rollout-gate` is out of order.

---

## § 4 — Architecture

### 4.1 Module layout

Top-level structure at the current bootstrap. The M5 TypeScript implementation adds a `src/` shell + `tests/` per DR-002; the layout below reflects what is on `main` today plus the planned M5 additions in italics.

```text
intent-rollout-gate/
├── action.yml          — the GitHub Action manifest (public contract: inputs/outputs/runs)
├── 000-docs/           — design record (001), appaudit playbook (002), release report (003), runtime DR (004), this blueprint (005)
├── README.md           — adopter-facing overview + forward-pointer to M5 wiring
├── CHANGELOG.md        — Keep a Changelog discipline
├── LICENSE / NOTICE    — Apache 2.0
├── .github/workflows/  — ci.yml (action.yml lint + stub smoke), doc-quality.yml (advisory markdown/prose/link lint)
└── src/                — (M5, planned) TypeScript shell delegating to @j-rig/rollout-gate
```

### 4.2 Data flow

The action's pipeline is a linear consume → verify → evaluate → emit flow (the algorithm detail lives in the design record § 4; the shell delegates the verify+evaluate stages to `@j-rig/rollout-gate`):

```text
Evidence Bundle (dir / JSONL / JSON array)  ─┐
tests/TESTING.md policy                      ─┤→ verify rows → evaluate vs policy → decision
                                              │                                     │
                                              └──────────────────────────────┐      ▼
                                                                             emit: PR comment
                                                                                   GitHub status check
                                                                                   signed rollout-decision/v1 row
                                                                                   (optional Rekor anchor)
                                                                                   OTel events
```

A partial bundle is valid input (Evidence Bundle SPEC R2): the policy decides whether the partial coverage is sufficient, the bundle does not fail merely because some rows are absent or fail verification.

### 4.3 Runtime boundaries

| Concern                          | Specification                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Process model**                | GitHub Action runtime — a single composite step (bootstrap) becoming a Node entrypoint at M5; one-shot, exits per verdict |
| **IPC**                          | file-based (reads the bundle path + policy file) + GitHub Actions environment (`GITHUB_OUTPUT`, `::notice::` annotations) |
| **External services consumed**   | Sigstore Fulcio + Rekor (for signing + transparency anchoring of the emitted decision row), at M5; none at bootstrap     |
| **Process isolation guarantees** | runs inside the consuming repo's CI runner; the signing-credential broker boundary (Blueprint B § 4.1) keeps plaintext OIDC material out of the echoed decision-row JSON and out of subprocess environments |

### 4.4 Storage needs

| Storage class | Backing store | Retention | Reference        |
| ------------- | ------------- | --------- | ---------------- |
| (none)        | N/A           | N/A       | N/A — this repo persists nothing at rest; it reads ephemeral CI artifacts and emits a row that the consuming repo's CI archives |

The signed decision row is written to a path the consuming repo's workflow archives (Rekor anchoring is optional and gated on the DNSSEC + CAA pre-condition, § 8). This repo holds no database, cache, or object store of its own.

### 4.5 External dependencies (cite by version)

Strict SemVer per Blueprint A § 4.2. MAJOR bumps require a Class-2 pair Decision Record before they land. These land at M5; the bootstrap shell has no runtime dependencies beyond `bash` + `jq` already present on GitHub runners.

| Dependency                      | Range                          | Purpose                                          | Notes                                                          |
| ------------------------------- | ------------------------------ | ------------------------------------------------ | -------------------------------------------------------------- |
| `@j-rig/rollout-gate`           | `>=2.0.0, <3.0.0` (M5, gated)  | the ship/no-ship decision logic this shell delegates to | gated on j-rig v2.0.0 release per DR-018 § 9.2                 |
| `@intentsolutions/core`         | `>=0.2.0, <1.0.0` (M5)         | `gate-result/v1` + `rollout-decision/v1` row schemas + Zod validators | Apache 2.0; kernel SSoT — eliminates a cross-language schema-drift surface |
| `@actions/core` + `@actions/github` | `>=1.x` (M5)               | PR-comment + status-check ergonomics             | MIT; first-class GitHub Action helpers                         |

### 4.6 Failure boundaries

- **Crash boundary**: a failure in the action fails the consuming repo's CI job; it does not corrupt any persisted state because this repo persists nothing. The bootstrap stub exits 0 by design so adopters wiring early are never blocked.
- **Retry boundary**: row verification and Rekor anchoring are bounded-retryable at M5; a verification failure on one row drops that row from the eligible set (a recoverable condition) rather than failing the whole bundle.
- **Isolation guarantees**: a failure here cannot poison the Evidence Bundle (this repo only reads it) and cannot mint a misleading attestation (a signed `rollout-decision/v1` row is only emitted after the decision succeeds; a crash before emit produces no row).
- **Emitted FailureTaxonomy categories**: N/A at bootstrap. At M5 the action may surface a verification-failure category for rows that fail DSSE/schema/subject-digest checks; the exact `FailureTaxonomy` mapping (Blueprint B § 2.13) is resolved in the M5 PR.

---

## § 5 — Canonical entities used

This repo touches exactly two of Blueprint B's 13 canonical entities. It does not redefine either — the canonical definitions live in the glossary and Blueprint B § 2.N.

| Entity        | Direction | Blueprint B Ref | Attributes implemented                                                                                                                                  | Glossary ref                              |
| ------------- | --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `EvidenceBundle` | consumes | `Blueprint B § 2.4` | reads the bundle in any container form (dir / JSONL / JSON array); verifies each in-toto Statement v1 row's predicate body against the kernel schema; honors composable-partial-attestation (no required complete coverage) | `intent-eval-lab/000-docs/014-DR-GLOS-canonical-glossary.md` § 2.4 |
| `RolloutGate`    | produces | `Blueprint B § 2.8` | produces the decision as a signed `rollout-decision/v1` row carrying the bundle content hash, policy hash, verdict, pass/fail row counts, runner, and commit SHA; provenance + audit via DSSE signature + optional Rekor anchor | `intent-eval-lab/000-docs/014-DR-GLOS-canonical-glossary.md` § 2.8 |

**Entities NOT touched by this repo:** EvalSpec, EvalRun, MatcherMap, JudgeDecision, RuntimeReceipt, RegressionPack, SkillSnapshot, SessionTrace, ToolInvocation, CostRecord, FailureTaxonomy — this repo neither persists nor authors these; it reads only the bundle and produces only the decision. (FailureTaxonomy is read-adjacent at M5 per § 4.6 but this repo does not author canonical FailureTaxonomy rows.)

---

## § 6 — Interfaces

### 6.1 CLI

N/A — this repo ships a GitHub Action, not a standalone CLI. The action is invoked through the GitHub Actions runtime (`uses:`), not a shell command surface.

### 6.2 HTTP / gRPC APIs

N/A — no HTTP or gRPC server. The action reads files and writes to `GITHUB_OUTPUT`; it talks to Sigstore Fulcio/Rekor (at M5) as a client, not a server.

### 6.3 Config files

| File               | Schema                                                                                       | Canonical example   |
| ------------------ | -------------------------------------------------------------------------------------------- | ------------------- |
| `action.yml`       | GitHub Action manifest (name / description / inputs / outputs / runs) — validated in `ci.yml` | `action.yml` (repo root) |
| `tests/TESTING.md` (consumer-side) | policy grammar resolved at M5 (YAML block vs. markdown-table parse, deferred per § 3.3) | declared by the consuming repo, not shipped here |

### 6.4 Output formats

| Output              | Shape                                                                          | Reference                                           |
| ------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| Signed decision row | in-toto Statement v1 over DSSE; predicateType `https://evals.intentsolutions.io/rollout-decision/v1`; predicate body per Blueprint B § 7 | `Blueprint B § 7` (do NOT redefine the body locally) |
| `decision` output   | one of `ship` / `no-ship` / `advisory` / `not-implemented` (the bootstrap always emits `not-implemented`) | `action.yml` outputs block + design record § 6.2 |
| PR comment (markdown) | gate-by-gate result table, coverage table, failing rows with `failure_mode`, advisories | design record § 6.1 |

The action's three declared outputs (`decision`, `summary`, `signed-decision-row-path`) are the stable public surface; at the v0.0.0 bootstrap `summary` and `signed-decision-row-path` are empty and `decision` is `not-implemented`.

### 6.5 Event schemas

OpenTelemetry attributes emitted by this repo. Event names are drawn from the OTel RFC draft (`intent-eval-lab/000-docs/001-DR-RFC-otel-agent-rollout-gate-signals-draft.md`); the taxonomy is not yet locked — forward-reference `iel-E12` until the `agent.rollout.gate.*` taxonomy is filed.

| Event                                | Attributes                                                                 | OTel taxonomy                                              |
| ------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| `agent.rollout.gate.bundle_loaded`   | `gate.bundle_row_count`, `gate.bundle_format`                              | `agent.rollout.gate.<subkey>` (per iel-E12, forward-ref)  |
| `agent.rollout.gate.policy_evaluated`| `gate.policy_hash`, `gate.required_gates_passed`, `gate.coverage_met`       | `agent.rollout.gate.<subkey>` (per iel-E12, forward-ref)  |
| `agent.rollout.gate.decision_made`   | `gate.decision`, `gate.commit_sha`, `gate.signed_decision_row_path`         | `agent.rollout.gate.<subkey>` (per iel-E12, forward-ref)  |
| `agent.rollout.gate.rekor_anchored`  | `gate.rekor_url`, `gate.rekor_uuid`                                         | `agent.rollout.gate.<subkey>` (per iel-E12, forward-ref)  |

### 6.6 Public-API stability promise

What this repo guarantees across SemVer minor bumps:

- **The `action.yml` `uses:` interface** — input names + output names. Adopters who wire `uses: jeremylongshore/intent-rollout-gate@v1` keep working when behavior lands at M5; only the runtime behavior changes, not the wiring (DR-002 § 2).
- **The two predicate URIs** — `gate-result/v1` (consumed) and `rollout-decision/v1` (emitted) are permanent strings once any row referencing them is signed and pushed to Rekor. Breaking changes mint `/v2`; never reformat or namespace-rename.

Breaking changes to anything in the stability promise require MAJOR bump (Blueprint A § 4.2) AND a Class-2 pair Decision Record (Blueprint A § 2.3) before merge.

---

## § 7 — Testing strategy

This section applies the Intent Solutions Testing SOP. Layer applicability is per-repo-type. As an `action-shell` repo at the bootstrap stage, the executable-code layers (L3–L7) land with the M5 TypeScript shell; the current gates are the action-manifest lint, stub smoke, and advisory doc-quality lint.

### 7.1 L0 — git hooks (pre-commit)

- **In-scope checks**: escape-scan, partner-name grep, markdown lint (lands at M5 with the harness install).
- **Enforcement**: `pnpm exec audit-harness <subcommand>` (M5, once the harness is a dev dependency) or `scripts/audit-harness <subcommand>` (vendored). NEVER `~/.claude/` paths.

### 7.2 L1–L2 — static analysis (lint + typecheck + escape-scan)

- **Lint**: `action.yml` YAML well-formedness + required-key validation (`ci.yml` `lint-action-yaml` job, active now); ESLint flat config for the TS shell (M5); markdownlint-cli2 + Vale for docs (advisory, `doc-quality.yml`).
- **Typecheck**: `tsc --noEmit` (M5 TS shell); N/A at bootstrap (no TS code yet).
- **Escape-scan**: `pnpm exec audit-harness escape-scan --staged` (M5) or `scripts/audit-harness escape-scan --staged` (vendored).

### 7.3 L3 — unit tests

| Concern                | Target                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| **Framework**          | vitest (M5 TS shell)                                                   |
| **Coverage floor**     | declared in the M5 PR's `tests/TESTING.md` (the repo's own policy)    |
| **Mutation kill rate** | declared in the M5 PR (or N/A if mutation testing is inapplicable to a thin shell) |
| **CI gate**            | `pnpm run check` (M5)                                                  |

### 7.4 L4 — integration tests

What is exercised end-to-end inside the repo (no external services):

- The bootstrap smoke test (`ci.yml` `smoke-action-stub` job, active now): runs the action against a synthetic empty bundle dir and asserts `decision == not-implemented`.
- At M5: the full consume → evaluate → emit path against a synthetic Evidence Bundle of `synth-gate-*` rows, asserting the verdict + the emitted-row shape, with no external Rekor push.

### 7.5 L5 — system tests

What is exercised against external services (Sigstore Fulcio/Rekor staging):

- At M5: signing the `rollout-decision/v1` row keyless against Sigstore staging, and the DNSSEC + CAA pre-condition refusal path against a deliberately-unconfigured namespace.
- **Provider PASS/FAIL gates**: see § 8.3 — N/A for this repo (it touches no LLM providers); the section is present-but-marked-N/A per the Class-1 ISEDC requirement, not deleted.

### 7.6 L6 — acceptance tests

| Concern           | Specification                                                                     |
| ----------------- | --------------------------------------------------------------------------------- |
| **Gherkin scope** | the adopter wiring flow (wire the action → bundle present → decision rendered) is codified as a Gherkin feature at M5 |
| **Lint**          | `pnpm exec audit-harness gherkin-lint` (M5)                                        |
| **RTM**           | filed at M5 alongside the first behavioral implementation (`tests/` directory)     |
| **Personas**      | filed at M5                                                                        |
| **Journeys**      | filed at M5                                                                        |

### 7.7 L7 — chaos / property / fuzz

- **Applicability**: N/A at bootstrap. A thin Action shell has a small property surface; if property testing of the policy-evaluation edge cases proves warranted at M5, the gap is filed as an `iar-` bead and linked here.
- **Framework**: fast-check (candidate, M5 if adopted).
- **Scope**: policy-evaluation invariants (partial-bundle sufficiency, advisory-elevation determinism) — candidate only.

### 7.8 CI gates

The exact checks a PR runs on merge today:

```text
ci.yml: lint-action-yaml   (action.yml YAML + required-key validation — HARD gate)
ci.yml: smoke-action-stub  (action stub exits 0 with decision=not-implemented — HARD gate)
doc-quality.yml: markdownlint-cli2 / Vale / lychee  (advisory — continue-on-error)
```

At M5 the gate set adds `pnpm run check` (lint + typecheck + test) per the Testing SOP.

**Hash-pin discipline**: after any policy edit in `tests/TESTING.md` (lands at M5), re-run `pnpm exec audit-harness init` (or `scripts/audit-harness init` vendored) and commit the updated `.harness-hash` in the same commit. Pre-commit refuses unsigned policy edits by design.

### 7.9 Fixtures

| Concern                       | Specification                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Location**                  | `tests/fixtures/` (M5)                                                                                                              |
| **Naming convention**         | synthetic gate IDs only — `synth-gate-1`, `synth-gate-2`, … per the repo `CLAUDE.md` operational rule                              |
| **Vendor-generic discipline** | all fixtures scrubbed per DR-004 S1Q2 + DR-010 § 10 reaffirmation; the partner-name grep guard runs against this repo in CI         |

### 7.10 Golden files (if applicable)

N/A at bootstrap. If the M5 PR-comment renderer adopts snapshot golden files, mass-regenerate is refused at CI by design and snapshots are reviewed line-by-line.

---

## § 8 — Security / isolation

### 8.1 Secrets management

The only secret this repo touches is the signing credential for the emitted decision row, and it is handled via the broker pattern (Blueprint B § 4.1): plaintext OIDC / cosign material never crosses the subprocess boundary, and the echoed decision-row JSON is built with `jq` so input values are quoted/escaped rather than concatenated into the shell string.

| Secret class            | Storage                                                       | Broker                                  | Repo-specific                                                       |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| signing credential      | Sigstore keyless OIDC (default) or `cosign-key` path input    | Fulcio short-lived cert — no long-lived key at rest | optional key-based mode via the `cosign-key` action input |

**SOPS + age standard**: this repo persists no secrets at rest, so the `.env.sops` pattern is not exercised here. If that ever changes, it adopts SOPS + age per the parent `~/.claude/CLAUDE.md` standard — `.env.sops` committed, `.env` git-ignored, CI receives the age key via `SOPS_AGE_KEY`, never decrypt to disk.

### 8.2 Sandbox model

This repo executes no user-supplied artifacts — it reads a bundle (data) and a policy file (data) and emits a decision. No user-code execution path exists.

| Concern                 | Default per Blueprint B § 4.1                                | This repo's override (if any)                              |
| ----------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| **Filesystem**          | per-Run scratch directory; no host-FS access outside scratch | default — reads only the bundle path + policy file inputs  |
| **Network egress**      | declared egress allowlist per EvalSpec                       | egress limited to Sigstore Fulcio + Rekor (signing/anchoring) |
| **Wall-clock ceiling**  | 30 minutes default; 4 hours hard ceiling                     | default                                                    |
| **Memory ceiling**      | 2 GiB default; 8 GiB hard ceiling                            | default                                                    |
| **Credential boundary** | broker-pattern; plaintext never crosses subprocess boundary  | default — enforced in the `action.yml` env-passthrough + `jq`-built JSON |

### 8.3 Provider PASS/FAIL gates

N/A — this repo does not touch LLM providers. It consumes signed evidence and emits a signed decision; there is no provider abstraction, no model call, no provider credential. This section is present-but-marked-N/A per the Class-1 ISEDC requirement that the gate-restatement be visible even when not exercised (per Blueprint C § 8.3); silently deleting it would itself be an ISEDC trigger. Were a provider surface ever added, the two non-negotiable gates (credential-redaction test + env-var spillover test, per DR-004 S1Q5 / DR-010 reaffirmation) would apply verbatim as HARD STOPs.

### 8.4 Audit logging

| Concern            | Specification                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| **What is logged** | verdict emissions, signing events, and verification failures (the decision row is itself the primary audit artifact) |
| **Append-only**    | yes — a signed decision row is never amended in place per Blueprint A § 1.2 principle 3; a corrected decision mints a new row |
| **Signing**        | the decision row is DSSE-signed per Blueprint B § 7; optional Rekor anchor for transparency-log inclusion      |
| **Retention**      | the consuming repo's CI archives the row; this repo holds no retention window of its own                       |

### 8.5 Threat model

An adversary with control over the Evidence Bundle input could present a bundle with forged rows; this repo defends by verifying each row's DSSE signature, JSON-Schema-validating the predicate body against the kernel schema, and matching the subject digest before a row enters the eligible set — forged rows are dropped, not trusted. An adversary with write access to the npm registry could publish a poisoned `@j-rig/rollout-gate` or `@intentsolutions/core`; this repo defends with sigstore provenance verification on those packages, a GC license audit at release, and a pinned strict-SemVer range. An adversary cannot use this repo to mint a misleading attestation: the DNSSEC + CAA pre-condition gates any Rekor push, and a crash before the emit stage produces no row at all.

---

## § 9 — Observability

### 9.1 OpenTelemetry events

Event names are drawn from the OTel RFC draft; the taxonomy is not yet locked — events emitted before `iel-E12` is filed carry a `taxonomy_status: draft` attribute so they are distinguishable from post-lock emissions.

| Event                              | Trigger                              | Attributes                                                       |
| ---------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `agent.rollout.gate.bundle_loaded` | after bundle read + parse            | `gate.bundle_row_count`, `gate.bundle_format`                   |
| `agent.rollout.gate.policy_evaluated` | after policy evaluation           | `gate.policy_hash`, `gate.required_gates_passed`, `gate.coverage_met` |
| `agent.rollout.gate.decision_made` | after the verdict                    | `gate.decision`, `gate.commit_sha`, `gate.signed_decision_row_path` |
| `agent.rollout.gate.rekor_anchored`| after a successful Rekor push        | `gate.rekor_url`, `gate.rekor_uuid`                             |

### 9.2 Trace propagation

| Concern               | Specification                                                                          |
| --------------------- | ------------------------------------------------------------------------------------- |
| **Incoming trace ID** | honored from the CI runner's OTel context when present; otherwise the action starts a root span |
| **Span hierarchy**    | the action's spans nest under the consuming workflow's job span                       |
| **Span attributes**   | the `gate.*` attributes above, per the iel-E12 RFC (forward-ref until locked)          |

### 9.3 Lineage capture

How this repo's outputs map to Blueprint B § 2 canonical entities for lineage purposes:

- **SessionTrace**: N/A — this repo populates no session-trace fields (it is a one-shot CI step, not a session runtime).
- **RuntimeReceipt**: N/A — this repo emits no runtime receipt.
- **ToolInvocation rows**: N/A — this repo emits no ToolInvocation rows. Its lineage contribution is the single `RolloutGate` decision row (§ 5), which references the input bundle's content hash and the policy hash for full provenance.

### 9.4 Log levels

| Level   | When                                                                 |
| ------- | -------------------------------------------------------------------- |
| `ERROR` | unrecoverable failure — operator action required                     |
| `WARN`  | degraded state — operation continues but signal is reduced           |
| `INFO`  | high-level lifecycle events — start, end, terminal state transitions |
| `DEBUG` | per-step diagnostics — disabled by default in production             |
| `TRACE` | per-operation diagnostics — enabled only in test environments        |

### 9.5 Failure taxonomy

N/A at bootstrap — this repo does not author canonical `FailureTaxonomy` rows. At M5 it may surface a row-verification-failure signal in the decision summary (Blueprint B § 2.13), but the canonical FailureTaxonomy entity is owned by the producing repos, not the consuming gate.

---

## § 10 — Cost governance

N/A — no paid surface is touched on the hot path. This repo makes no LLM provider calls, runs no paid compute beyond the consuming repo's CI runner, and does not maintain a paid storage tier. The only externally-billable surface is optional Rekor anchoring (public Sigstore Rekor is free; a private Rekor instance, if an adopter configures one via `rekor-url`, is the adopter's cost, not this repo's). Token ceilings, cost attribution, retention lifecycle, cache strategy, and budget ceilings are therefore not applicable. If a paid surface is ever added, this section is re-walked per Blueprint C § 10.

---

## § 11 — Release strategy

### 11.1 Versioning

**Strict SemVer** per Blueprint A § 4.2. The runtime ships first as v0.1.0-experimental (behavior present, contract not yet frozen) and graduates to v0.2.0 (stable consumption contract) only when the five DR-002 § 6 acceptance criteria all hold.

| Bump  | When                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| MAJOR | breaking change to the § 6.6 stability promise; a `gate-result/v1` or `rollout-decision/v1` predicate-URI grammar change   |
| MINOR | additive feature; new optional input/output; new event emission; deprecation notice without removal                       |
| PATCH | bug fix; documentation polish; internal refactor with no public-API change                                                |

### 11.2 Changelog

`CHANGELOG.md` follows Keep a Changelog format (already present). Every PR that merges to main updates the `## [Unreleased]` section; the release commit promotes `[Unreleased]` to the new version + date.

### 11.3 Migration notes

| Concern                      | Location                                                          |
| ---------------------------- | ----------------------------------------------------------------- |
| **Migration guide location** | `MIGRATING.md` (authored at the first MAJOR bump; none yet)        |
| **Migration generator**      | hand-authored                                                     |
| **Required for**             | every MAJOR bump                                                  |

### 11.4 Compatibility guarantees

Across minor bumps, downstream consumers can rely on:

- The `action.yml` `uses:` interface (input + output names) staying stable — wiring does not change when behavior lands.
- The two predicate URIs staying byte-stable.

Across MAJOR bumps: only the items explicitly preserved in the MAJOR release notes.

### 11.5 Evidence retention discipline

Per Blueprint A § 4.2 + DR-010 § 7 Q5 CISO non-negotiable: production-Rekor signing for any predicate URI is gated on that predicate's SPEC.md normative section landing.

- **v0.x releases** anchor to Sigstore staging (`rekor.sigstage.dev`) — EXPERIMENTAL mode.
- **v0.2+ releases** anchor to production Rekor per-predicate, only once that predicate's SPEC.md normative section is merged on `intent-eval-lab` main.

This repo's predicate-URI inventory and per-predicate cutover status:

| Predicate URI                                            | Status      | SPEC.md ref                                                          | Signing mode       |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------- | ------------------ |
| `evals.intentsolutions.io/gate-result/v1` (consumed)     | conditional | `intent-eval-lab/specs/evidence-bundle/v0.1.0-draft/SPEC.md` (Phase B normative content gated) | n/a — consumed, not signed here |
| `evals.intentsolutions.io/rollout-decision/v1` (emitted) | deferred    | SPEC.md normative section for this predicate to land at M5           | `sigstore_staging` until its SPEC.md lands |

### 11.6 License audit

Every release runs `npm-license-checker` (the M5 TS shell is a Node package) on the resolved dependency tree per DR-010 § 7 Q2 GC non-negotiable. GPL / AGPL dependencies are blocked at CI absent explicit GC waiver. A `LICENSES.md` enumerating each direct dependency with license name + upstream license link is authored alongside the M5 dependency landing. This repo's own license is Apache 2.0 (`LICENSE` + `NOTICE` at the repo root).

---

## § 12 — Beads / work breakdown

| Concern               | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| **Bead prefix**       | `iar-` (per Blueprint A § 2.1)                                              |
| **bd workspace**      | umbrella `~/000-projects/.beads/` (default for the Intent Eval Platform)    |
| **Epic naming**       | `iar-E<NN>` (e.g., `iar-E01` — this blueprint)                             |
| **Plane project**     | LAB                                                                         |
| **Plane module**      | "Intent Eval Platform" module                                              |
| **GH ↔ Plane mirror** | via `bd-sync` per global CLAUDE.md three-layer discipline                   |

### 12.1 Cross-repo bead dependencies

Other ecosystem repos' beads this repo's work depends on (all bd-sync-mirrored):

- `iaj-E02b` — the j-rig schema upgrade that releases `@j-rig/rollout-gate@2.0.0`; this repo's M5 decision-logic consumption is gated on it per DR-018 § 9.2.
- `iec-E12` — the kernel v0.2.0 release that lands `gate-result/v1` + `rollout-decision/v1` validators this repo imports at M5.

### 12.2 In-repo epic inventory

| Epic       | Status      | Purpose                                                              |
| ---------- | ----------- | ------------------------------------------------------------------- |
| `iar-E01`  | in-progress | Repo blueprint (this document — Blueprint C application)            |

(Subsequent `iar-` epics for the M5 TypeScript runtime land when M5 work opens; this blueprint is the first.)

---

## § 13 — Definition of Done

This repo is "complete enough to release" (the v0.2.0 stable-contract bar per DR-002 § 6) when **every** check below passes:

- [ ] All tests pass at the L0–L7 policy floors declared in § 7 (coverage, integration scenarios, system tests) once the M5 TS shell lands.
- [ ] Provider PASS/FAIL gates (§ 8.3) — N/A for this repo; the gate-restatement section is present-but-marked-N/A, not deleted.
- [ ] All canonical entities consumed (§ 5 — `EvidenceBundle`) have their schema versions pinned to a known-good range (`@intentsolutions/core >=0.2.0, <1.0.0`).
- [ ] License audit clean per § 11.6 (no GPL / AGPL absent explicit GC waiver); `LICENSES.md` present.
- [ ] Partner-name vendor-generic grep returns 0 against all public-facing directories — using the current partner-name pattern maintained in the ecosystem CLAUDE.md.
- [ ] Evidence Bundle round-trip verified — emit → DSSE wrap → cosign sign → cosign verify-attestation → consume succeeds end-to-end against a synthetic bundle.
- [ ] `CHANGELOG.md` entry written under `## [Unreleased]` (or promoted to the new version for the release commit).
- [ ] This per-repo blueprint matches reality — `/validate-consistency` clean against this repo's `000-docs/`, `README.md`, and `CHANGELOG.md`.
- [ ] Acting head of board sign-off (or designated approver per `CODEOWNERS` once one is added).

---

## Cross-references

- Architecture design record: `001-DR-DESIGN-rollout-gate-architecture-2026-05-12.md`
- Runtime decision record (DR-002): `004-AT-DECR-runtime-language-typescript-2026-06-10.md`
- Blueprint A (constitution): `intent-eval-lab/000-docs/011-AT-ARCH-ecosystem-master-blueprint.md`
- Blueprint B (kernel + 13-entity domain model + `gate-result/v1` spec): `intent-eval-lab/000-docs/012-AT-ARCH-platform-runtime-blueprint.md`
- Blueprint C (this template): `intent-eval-lab/000-docs/013-AT-SPEC-repo-blueprint-template.md`
- Canonical glossary: `intent-eval-lab/000-docs/014-DR-GLOS-canonical-glossary.md`
- ISEDC DR-004 (Phase B, § 6 CISO bindings): `intent-eval-lab/000-docs/004-AT-DECR-isedc-council-record-2026-05-10.md`
- ISEDC DR-010 (§ 13.5 TS-primary signing-surface lock): `intent-eval-lab/000-docs/010-AT-DECR-isedc-council-session-4-widened-scope-2026-05-13.md`
- OTel RFC draft (forward-ref iel-E12): `intent-eval-lab/000-docs/001-DR-RFC-otel-agent-rollout-gate-signals-draft.md`
- Convergence umbrella: [intent-eval-lab#4](https://github.com/jeremylongshore/intent-eval-lab/issues/4)
