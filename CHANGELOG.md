# Changelog

All notable changes to `intent-rollout-gate` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pending

- Phase 7.5 gist (deferred per release-sweep CTO call — `iep-gist-coverage` follow-up bead; each landing-page gist deserves bespoke `/appaudit` treatment).

## [0.3.0] - 2026-06-15

**Release-pipeline hardening + provenance correctness.** No change to the action's public `uses:` interface (inputs/outputs are byte-identical to v0.2.0) — this release hardens the release/signing pipeline itself and fixes a provenance-correctness bug in the dispatch re-release path. Adopters upgrade the pin; no workflow rewiring is required.

### Fixed

- **Checkout now pins to the dispatched tag, not `main` (provenance one-way-door fix).** On `workflow_dispatch` the `build`, `release`, and `sign` jobs previously resolved `GITHUB_REF` (the default branch) — so a re-release / sign dispatch would rebuild and attest `dist/index.js` bytes from `main`, NOT the bytes consumers resolve via `uses: jeremylongshore/intent-rollout-gate@<tag>`. Every checkout now sets `ref: ${{ inputs.tag }}`; on a plain tag-push event `inputs.tag` is empty and checkout correctly falls back to the pushed tag. This closes a wrong-bytes attestation class — a signed-provenance one-way door (CISO reproducible-from-tag invariant). (#32)

### Changed

- **Production signing is dispatch-only with a reversible dry-run; the sigstage path is removed.** The `sign` job runs ONLY on `workflow_dispatch` — a plain tag push does build + GitHub Release + floating-major retag and stops, never signing. Signing always targets the PRODUCTION sigstore public-good trust root (cosign defaults: `fulcio.sigstore.dev` + `rekor.sigstore.dev`, GitHub Actions ambient OIDC); `dry-run` (default `true`) controls only whether a permanent Rekor transparency-log entry is written. The non-representative sigstage path was dropped (its SCT verification failed against cosign's production-default TUF trust root). (#27)
- **The iah-E06 DNSSEC/CAA pre-flight always gates production signing (fail-closed).** Because production is the only target, the read-only DNSSEC + CAA verification against `evals.intentsolutions.io` runs on EVERY dispatch (dry-run and real fire); either non-zero exit aborts before cosign runs. (#27)

### Added

- **`release.sh` helper + extracted `GITHUB_STEP_SUMMARY` renderer.** Step-summary rendering moved out of `src/main.ts` into a dedicated `src/summary.ts` module (unit-tested independently); a `release.sh` script standardizes the local bump-tag-push flow. (#29)
- **ntfy CI-failure alert over the tailnet.** A new `alert-on-failure` job joins the tailnet via Tailscale OIDC and pushes a high-priority alert to the `prod-deploys` ntfy topic when a tag-release build or release job fails. (#28)
- **Advisory `actionlint` CI lane** — non-blocking workflow-manifest linting. (#31)
- **Advisory `typos` spell-check CI lane** — non-blocking. (#30)

### Architectural bindings

- [DR-004 § 6.1](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/004-AT-DECR-isedc-council-record-2026-05-10.md) — CISO DNSSEC + CAA pre-condition for any Rekor push referencing an `evals.intentsolutions.io` predicate URI; the always-on pre-flight enforces it
- ISEDC E09 DR / CISO reproducible-from-tag invariant — the #32 checkout-tag-pin fix closes the wrong-bytes attestation class

## [0.2.0] - 2026-06-18

**Stable consumption contract + production-Rekor signing enabled.** Graduates the M5 TypeScript MVP from `v0.1.0` ("experimental" per [DR-002](000-docs/004-AT-DECR-runtime-language-typescript-2026-06-10.md) § 6 — behavior present, contract not yet frozen) to a frozen consumption contract, and enables the previously-HELD sigstore PRODUCTION transparency-log signing path behind the iah-E06 DNSSEC/CAA pre-flight (fail-closed). The action's public `uses:` interface stays forward-compatible: inputs/outputs are additive only ([Evidence Bundle SPEC](https://github.com/jeremylongshore/intent-eval-lab/blob/main/specs/evidence-bundle/v0.1.0-draft/SPEC.md) R18); no breaking change ships without a new predicate URI (SPEC R17). Adopters upgrade the pin; no workflow rewiring is required. Full migration guidance: [`000-docs/008-RL-REPT-v0.2.0-migration-notes-2026-06-18.md`](000-docs/008-RL-REPT-v0.2.0-migration-notes-2026-06-18.md).

This release satisfies DR-002 § 6 acceptance criteria **1** (frozen consumption contract), **3** (decision-signing preconditions met — both gates now land), **4** (Testing SOP gate green), and **5** (M6 first-adopter path) for the signing surface; criterion **2** (additive-only `uses:` interface) is preserved.

### Added

- **Production-Rekor signing ENABLED (fail-closed).** The `release.yml` `sign` job previously HARD-REFUSED production (`use-production-rekor=true` → `exit 1`, HELD pending the CISO pre-flight). Both former preconditions are now met:
  - **iah-E06 DNSSEC/CAA pre-flight is live and published** — [`@intentsolutions/audit-harness@1.1.8`](https://www.npmjs.com/package/@intentsolutions/audit-harness) ships `scripts/dnssec-check.sh` + `scripts/caa-check.sh` (read-only, fail-closed verification against trusted public resolvers).
  - **`evals.intentsolutions.io` has DNSSEC enabled + CAA pinned** (CISO binding, DR-004 § 6.1) — verified live (DNSSEC fully validated; CAA pins the IS issuing CA).
  - A new **iah-E06 production pre-flight** step (gated `if: inputs.use-production-rekor == true`) fetches the published scripts and runs BOTH against the predicate-URI host (`evals.intentsolutions.io`) under `set -euo pipefail`. EITHER non-zero exit fails the job → cosign NEVER anchors to production Rekor. Production is reachable ONLY via the explicit `use-production-rekor=true` workflow_dispatch; a plain tag push still goes to STAGING (byte-unchanged from v0.1.0). Production cosign uses the public-good trust root (`rekor.sigstore.dev` / `fulcio.sigstore.dev`) with the GitHub Actions ambient OIDC issuer (`token.actions.githubusercontent.com`).

### Changed

- **Consumed-row contract frozen.** The kernel `@intentsolutions/core` `gate-result/v1` JSON Schema (`schemas/v1/gate-result.schema.json`, kernel 0.6.0) is pinned as the stable consumed-row contract for v0.2.0. Verified present and locked in [`000-docs/006-AT-SPEC-evidence-bundle-normative-lock-verification-2026-06-18.md`](000-docs/006-AT-SPEC-evidence-bundle-normative-lock-verification-2026-06-18.md) and ratified by the acting-head sign-off [`000-docs/007-AT-DECR-spec-normative-lock-sign-off-2026-06-18.md`](000-docs/007-AT-DECR-spec-normative-lock-sign-off-2026-06-18.md).
- **`@intentsolutions/audit-harness` dev-dependency bumped `^1.1.7` → `^1.1.8`** — 1.1.8 is the first release to ship the iah-E06 pre-flight scripts the production gate consumes.
- Decision logic remains delegated to [`@intentsolutions/rollout-gate@2.0.0`](https://www.npmjs.com/package/@intentsolutions/rollout-gate) (thin shell preserved); no gate semantics added to this repo.
- The `policy-file` and `dry-run` deprecated aliases (introduced at v0.1.0) remain accepted — deprecated, not removed. Removing them would be a SemVer-major event with its own migration note.

### Pending (post-v0.2.0)

- **Decision-row signing (`rollout-decision/v1`)** — emit + sign the action's own in-toto decision row (distinct from signing the committed `dist/index.js` artifact, which this release enables). It delegates to `audit-harness` `emit-evidence`, inheriting the same DNSSEC/CAA pre-flight now wired here. `signed-decision-row-path` output stays empty until that lands.
- **`tests/TESTING.md` policy parsing** — deferred per DR-002 § 5; v0.2.0 continues to consume JSON policy documents only.
- **M6 first adopter** — `audit-harness` self-adopts the gate end-to-end before any partner repo (DR-002 § 6 criterion 5).

### Architectural bindings

- [DR-002 § 6](000-docs/004-AT-DECR-runtime-language-typescript-2026-06-10.md) — the v0.1.0-experimental -> v0.2.0 acceptance criteria
- [006-AT-SPEC](000-docs/006-AT-SPEC-evidence-bundle-normative-lock-verification-2026-06-18.md) — SPEC R14–R18 + kernel schema + DNSSEC/CAA pre-flight verification (E08 acceptance record)
- [007-AT-DECR](000-docs/007-AT-DECR-spec-normative-lock-sign-off-2026-06-18.md) — acting-head-of-board sign-off ratifying the SPEC normative lock

## [0.1.0] - 2026-06-11

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
- `predicate-uri`, `rekor-url`, `cosign-key` inputs are retained additively (Evidence Bundle SPEC R18) as **reserved**: only the default v1 predicate URI is accepted (anything else blocks), no Rekor push ever happens at v0.1.0, and `cosign-key` warns + no-ops. `signed-decision-row-path` output stays empty until decision-row signing lands.
- `.gitignore` rewritten for the locked TS runtime (Go/Python sections removed; `dist/` now tracked).

### Architectural bindings

- [DR-002](000-docs/004-AT-DECR-runtime-language-typescript-2026-06-10.md) — runtime language TypeScript on Node 20+; § 6 acceptance criteria frame the v0.1.0-experimental → v0.2.0 transition (this release is the v0.1.0-experimental step: criteria 1 + 2 land, criterion 4 (Testing SOP gate) is installed here and must stay green, criteria 3 (signing preconditions) + 5 (M6 adoption) gate the future v0.2.0 graduation, tracked in [Unreleased])
- [DR-018 § 9.2](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/018-AT-DECR-isedc-council-session-5-jrig-reconciliation-2026-05-21.md) — decision-logic delegation to the j-rig-published rollout-gate package; this repo is the thin shell

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
[0.2.0]: https://github.com/jeremylongshore/intent-rollout-gate/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jeremylongshore/intent-rollout-gate/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/jeremylongshore/intent-rollout-gate/releases/tag/v0.0.1
