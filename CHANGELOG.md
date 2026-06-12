# Changelog

All notable changes to `intent-rollout-gate` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pending

- **Decision-row signing** — emit + sign the `rollout-decision/v1` in-toto row, behind the DNSSEC + CAA pre-condition (DR-004 § 6.1, DR-002 § 6.3). `signed-decision-row-path` output stays empty until then.
- **`tests/TESTING.md` policy parsing** — deferred per DR-002 § 5; v0.2.0 consumes JSON policy documents only.
- **M6 first adopter** — `audit-harness` self-adopts the gate (DR-002 § 6.5).
- Phase 7.5 gist (deferred per release-sweep CTO call — `iep-gist-coverage` follow-up bead; each landing-page gist deserves bespoke `/appaudit` treatment).

## [0.2.0] - 2026-06-11

**M5 TypeScript MVP.** The action graduates from the v0.0.x composite no-op stub to a real Node-runtime action. Runtime language locked to TypeScript by [DR-002](000-docs/004-AT-DECR-runtime-language-typescript-2026-06-10.md) (recording the upstream DR-010 § 13.5 TS-primary lock). **Thin shell by design (Blueprint A):** every line of decision logic is delegated to the published [`@intentsolutions/rollout-gate@2.0.0`](https://www.npmjs.com/package/@intentsolutions/rollout-gate) package (Apache-2.0, sigstore provenance) — `decide()` / `parsePolicy()`; row validation reuses the kernel `@intentsolutions/core` gate-result/v1 statement schema. Zero gate semantics live in this repo.

### Added

- **Node runtime action** — `runs.using: node24`, `main: dist/index.js` (esbuild CJS bundle, node20-compatible transpile target per the DR-002 "Node 20+" lock). `dist/` is committed per GitHub Actions convention; CI enforces dist↔src sync (rebuild + `git diff --exit-code dist/`).
- **Inputs:** `policy-path` (JSON policy file), `policy-json` (inline policy), `fail-on-block` (default `'true'`). Exactly one of `policy-path` / `policy-json` is required — both or neither blocks (fail closed).
- **Outputs:** `reasons` (JSON array string of every blocking reason; `[]` exactly when allowed). `decision` now emits `allow` / `block` verbatim from the package (`allow` ≙ ship, `block` ≙ no-ship; the stub-era `not-implemented` value is retired).
- **Step summary** — markdown table of evaluated required gates (pattern / status / matched gate IDs) + blocking rows + flat reason list; also exposed as the `summary` output.
- **Fail-closed wiring** — missing/unreadable/invalid-JSON bundle file, ambiguous policy inputs, garbage policy (`parsePolicy` throws; no default-policy fallback), non-default `predicate-uri`, and any unexpected error all produce `decision=block`. The job fails on block unless `fail-on-block: 'false'` (or legacy `dry-run: 'true'`).
- **Unit tests** — vitest suite over the shell wiring (input validation, policy resolution, summary rendering, exit behavior) against synthetic-gate-ID fixtures: an allow bundle, a fail-row bundle, a malformed bundle.
- **CI** — `check` job (pnpm frozen install → typecheck → vitest → dist-sync), retained `lint-action-yaml` job (extended for the node runtime), new `smoke-action` job running the real action against the fixtures (allow path + non-failing block path).

### Changed

- **BREAKING (stub-era behavior):** the action no longer unconditionally exits 0. A `block` decision fails the job by default. The v0.0.x always-exit-0 contract was explicitly a bootstrap affordance ("substantive enforcement begins at v0.1.0").
- `policy-file` input is now a **deprecated alias** for `policy-path` and its `tests/TESTING.md` default is removed (TESTING.md parsing stays deferred per DR-002 § 5; a markdown policy would fail closed anyway).
- `dry-run` input is now a **deprecated alias** for `fail-on-block: 'false'`.
- `predicate-uri`, `rekor-url`, `cosign-key` inputs are retained additively (Evidence Bundle SPEC R18) as **reserved**: only the default v1 predicate URI is accepted (anything else blocks), no Rekor push ever happens at v0.2.0, and `cosign-key` warns + no-ops. `signed-decision-row-path` output stays empty until decision-row signing lands.
- `.gitignore` rewritten for the locked TS runtime (Go/Python sections removed; `dist/` now tracked).

### Architectural bindings

- [DR-002](000-docs/004-AT-DECR-runtime-language-typescript-2026-06-10.md) — runtime language TypeScript on Node 20+; § 6 acceptance criteria frame the v0.1.0-experimental → v0.2.0 transition (criteria 1 + 2 + 4 land here; criterion 3 signing-side and criterion 5 M6 adoption remain open, tracked in [Unreleased])
- [DR-018 § 9.2](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/018-AT-DECR-isedc-council-session-5-jrig-reconciliation-2026-05-21.md) — decision-logic delegation to the j-rig-published rollout-gate package; this repo is the thin shell

## [0.0.1] - 2026-05-26

## [0.0.1] - 2026-05-26

**Baseline release.** Establishes the tag + CHANGELOG baseline for this repo. No npm-publish surface yet — this is a GitHub Action distributed via the `action.yml` manifest at the repo root. Tag enables GitHub Marketplace listing.

### Added

- **Initial repo scaffold** (commit `8abcfdc`) — repository bootstrap
- **Beads issue tracking** initialized (commit `fc40b3f`)
- **M4 substantive bootstrap** (commit `87de651`) — repository, `action.yml` Action manifest (Intent Rollout Gate — consume Evidence Bundle + policy → ship/no-ship decision per the consuming repo's `tests/TESTING.md`), initial design doc at `000-docs/001-DR-DESIGN-rollout-gate-architecture-2026-05-12.md`. Predicate URI is the stable v1 form `https://evals.intentsolutions.io/gate-result/v1`; consumers MUST NOT change unless consuming a different predicate type.
- **First IEP /appaudit baseline** (PR #13) — operator-grade devops playbook filed at `000-docs/002-AA-AUDT-appaudit-devops-playbook.md` + `.pdf`
- **Repo scaffolding** for baseline release: `CHANGELOG.md` (this file), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)
- **Baseline release AAR** at `000-docs/003-RL-REPT-baseline-release-v0.0.1-2026-05-26.md` (first `RL` filing-code use in this repo — Release Report)
- `version.txt` tracking baseline as `0.0.1`

### Changed

- **License relicensed from MIT to Apache 2.0** (PR #12, commit `295cbe4`) — BREAKING. Mirrors the audit-harness (#32) and `j-rig-skill-binary-eval` (#73) relicenses. Per Blueprint A, the 5-repo IEP taxonomy standardizes on Apache 2.0 for downstream-friendly patent grant.

### Architectural bindings

- [Blueprint A](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/011-AT-ARCH-ecosystem-master-blueprint.md) — 12 binding principles, 5-repo taxonomy (this repo is the GitHub Action shell layer)
- [Blueprint B § 7](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/012-AT-ARCH-platform-runtime-blueprint.md) — `gate-result/v1` NORMATIVE predicate spec (the Action consumes this predicate from Evidence Bundles)
- [DR-018 § 9.2](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/018-AT-DECR-isedc-council-session-5-jrig-reconciliation-2026-05-21.md) — `@j-rig/rollout-gate` decision-logic delegation (M5 consumes; this repo is the thin shell)

### Quality posture

- CI workflow (`.github/workflows/ci.yml`) — `yamllint action.yml` for manifest validation. M5 substantive runtime adds the full TS gate chain.
- Scaffolding files present: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `LICENSE` (Apache 2.0), `NOTICE`, `README.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` (this release)

[Unreleased]: https://github.com/jeremylongshore/intent-rollout-gate/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jeremylongshore/intent-rollout-gate/compare/v0.0.1...v0.2.0
[0.0.1]: https://github.com/jeremylongshore/intent-rollout-gate/releases/tag/v0.0.1
