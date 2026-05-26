# Changelog

All notable changes to `intent-rollout-gate` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pending

- **M5 — TypeScript runtime** (the substantive shell that consumes a bundle + a policy → ship/no-ship decision). Currently in flight on a feature branch (`feat/m5-typescript-runtime-lock-and-mvp` per repo CLAUDE.md). After M5.1 lands: this becomes a pnpm package and ships with proper `pnpm install + pnpm run check + pnpm run build`.
- **`@j-rig/rollout-gate` consumption** per DR-018 § 9.2 (gated on j-rig v2.0.0 release of `iaj-E02b`). M5 runtime delegates decision logic to that package; this repo retains only the GitHub Action shell.
- Phase 7.5 gist (deferred per release-sweep CTO call — `iep-gist-coverage` follow-up bead; each landing-page gist deserves bespoke `/appaudit` treatment).

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

[Unreleased]: https://github.com/jeremylongshore/intent-rollout-gate/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/jeremylongshore/intent-rollout-gate/releases/tag/v0.0.1
