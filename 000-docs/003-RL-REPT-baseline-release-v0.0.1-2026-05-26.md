# 003-RL-REPT—Baseline Release v0.0.1 (2026-05-26)

| Field | Value |
| --- | --- |
| **Doc code** | RL-REPT (Release Report) |
| **Date** | 2026-05-26 |
| **Author** | Jeremy Longshore (acting CTO Claude as drafting executor) |
| **Release** | v0.0.1 (baseline) |
| **Plan** | IEP cross-repo release-sweep ceremony, Step 6 |
| **Companion AAR (panel)** | `intent-eval-lab/000-docs/023-AA-AACR-thinker-panel-review-2026-05-25.md` |

## 1. Context

`intent-rollout-gate` is the GitHub Action shell of the Intent Eval Platform—consumes an Evidence Bundle (in-toto Statement v1 rows under predicateType `https://evals.intentsolutions.io/gate-result/v1`) plus the consuming repo's `tests/TESTING.md` policy, and emits a ship/no-ship decision.

Before today, this repo had:

- 5 commits since initial bootstrap
- No git tags
- No `CHANGELOG.md`
- Missing `CODE_OF_CONDUCT.md` (8/9 scaffolding files present)
- No `version.txt`

This release establishes the **baseline tag + CHANGELOG conformance** so future M5 (TypeScript runtime) work has a clean version-tracking foundation.

## 2. What landed in this release

Per Step 6 of the 2026-05-25/26 IEP cross-repo release-sweep ceremony:

| Action | Result |
| --- | --- |
| Create `CHANGELOG.md` per Keep-a-Changelog 1.1.0 | ✅ |
| Categorize 5 historical commits into `[0.0.1]` entry | ✅—Added (4 commits), Changed (1 commit: relicense) |
| Add missing `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) | ✅ |
| Create `version.txt` tracking `0.0.1` | ✅ |
| File this Release Report AAR | ✅ (this document) |
| Tag `v0.0.1` from main HEAD | (post-merge step) |

**Deferred** (per release-sweep CTO calls):

- npm-publish path—this repo is a GH Action, not an npm package. Marketplace listing is the deliverable.
- `.github/ISSUE_TEMPLATE/`—original plan called for these but the existing M4 substantive bootstrap doesn't need them yet; deferred until M5 TS runtime introduces user-facing issue surface
- Phase 7.5 gist—deferred per `iep-gist-coverage` follow-up bead

## 3. Phase 2.6 BLOCKING gate

| Check | Status |
| --- | --- |
| SemVer regex matches version headers | ✅ |
| Monotonic bump | ✅ (first release; baseline) |
| Dated header `## [0.0.1] - 2026-05-26` (hyphen form per Gemini PR #74 lab lesson) | ✅ |
| Section headers (`### Added`, `### Changed`, `### Architectural bindings`, `### Quality posture`) | ✅ |
| Bullet items in every populated section | ✅ |

## 4. Architectural bindings (anchored at release time)

- [DR-010](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/010-AT-DECR-isedc-council-session-4-widened-scope-2026-05-13.md)—ISEDC Session 4 widened-scope lock; unification thesis BINDING; TS-primary signing surfaces
- [Blueprint A](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/011-AT-ARCH-ecosystem-master-blueprint.md)—12 binding principles; this repo is the GH Action shell in the 5-repo taxonomy
- [Blueprint B § 7](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/012-AT-ARCH-platform-runtime-blueprint.md)—`gate-result/v1` NORMATIVE predicate spec; this Action consumes that predicate
- [DR-018 § 9.2](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/018-AT-DECR-isedc-council-session-5-jrig-reconciliation-2026-05-21.md)—`@j-rig/rollout-gate` decision-logic delegation; M5 consumes that package; this repo retains only the GH Action shell

## 5. Why v0.0.1, not v0.1.0

Convention: `v0.0.x` is for repos that exist but whose substantive runtime is still in flight (M5 here). `v0.1.0` would imply a usable surface beyond `action.yml`. Once M5 TS runtime lands and `pnpm install + pnpm run check + pnpm run build` actually produces a working consume-bundle → decision binary, the next minor bump (v0.1.0) marks "this Action actually does something end-to-end."

Per [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) § 9: "Major version zero (0.y.z) is for initial development. Anything MAY change at any time. The public API SHOULD NOT be considered stable."

## 6. Companion in-flight work

Part of the IEP cross-repo release-sweep ceremony (2026-05-25/26):

| Repo | Action | Status |
| --- | --- | --- |
| `j-rig-skill-binary-eval` | PR #76—CI build-before-test fix | ✅ MERGED |
| `intent-eval-core` | PR #11—v0.1.1 prep | ✅ MERGED; v0.1.1 published to npm with Sigstore provenance |
| `intent-eval-lab` | PR #73—panel review AAR | ✅ MERGED |
| `intent-eval-lab` | PR #74—CHANGELOG tidy (Beck Tidy First) | ✅ MERGED |
| `intent-eval-lab` | PR #75—v0.2.0 release (Phase A foundation + Phase B research) | 🟡 IN FLIGHT |
| `audit-harness` | PR #41—Step 5 verify appendix | 🟡 IN FLIGHT |
| `intent-rollout-gate` | this release (PR TBD) | 🟡 IN FLIGHT |

## 7. Cross-references

- Cross-repo release-sweep final summary AAR—will be filed at `intent-eval-lab/000-docs/024-AA-AACR-cross-repo-release-sweep-2026-05-26.md` as Step 7 of the ceremony
- Companion panel review AAR—`intent-eval-lab/000-docs/023-AA-AACR-thinker-panel-review-2026-05-25.md`

## 8. Status banding (per Cunningham finding #1)

**ACTIVE—baseline release.** Supersedes nothing; superseded by future v0.x.y releases as M5 TS runtime lands.

— end AAR —

— Jeremy Longshore
intentsolutions.io
