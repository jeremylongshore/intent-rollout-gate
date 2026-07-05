# Release Report: intent-rollout-gate v0.3.1

## Executive Summary

- **Version:** 0.3.0 → **0.3.1**
- **Release date:** 2026-07-05
- **Type:** PATCH (dependency bump; no public-interface change)
- **Trigger:** `/release` ceremony (cluster-wide pass)
- **Result:** ✅ Tag released; dist reproducible; GitHub Release + floating `v0` retag

## What shipped

- **`@intentsolutions/core` `^0.7.0` → `^0.9.0`** (#50). The committed
  `dist/index.js` was rebuilt with the current kernel validators, so the
  action's advisory `GateResultV1Schema` check (`countKernelInvalidPredicates`)
  runs against the 0.9.0 predicate schema. **No change to the action's public
  `uses:` interface** — inputs/outputs are byte-identical to v0.3.0; adopters
  upgrade the pin, no rewiring. PATCH per SemVer.

Deferred follow-ups (decision-row signing, `tests/TESTING.md` policy parsing,
M6 first adopter) stay in `[Unreleased]`.

## Version bump

| Manifest | 0.3.0 → 0.3.1 |
|---|---|
| `package.json` (tag-drift-guard canonical) | ✓ |
| `version.txt` (mirror) | ✓ |

## Verification

| Check | Result |
|---|---|
| `pnpm run check` (prettier + tsc + vitest) | 40 tests pass |
| `dist:check` (rebuild + `git diff --exit-code dist/`) | in sync (dep rebuild landed in #50) |
| Verify tag + reproducible dist (release.yml) | `success` |
| GitHub Release + floating major retag | `success` — `v0` → `v0.3.1` (`d01c810`) |
| cosign keyless sign dist | **`skipped`** — signing is dispatch-only / dry-run-default / iah-E06-gated, correctly not run on a plain tag push |
| CHANGELOG/SemVer gate | dated `## [0.3.1]` header + `### Changed` + bullet; `0.3.1 > 0.3.0` |

## Notes

- This repo ships a GitHub **Action**, not an npm package — the committed
  `dist/index.js` IS the published artifact (`uses: …@v0`). There is no
  `npm publish` anywhere.
- Production sigstore/Rekor signing remains a **separate, deliberate,
  dry-run-default `workflow_dispatch`** — not triggered by this release.

## Rollback

```bash
git push origin --delete v0.3.1
git tag -d v0.3.1
gh release delete v0.3.1 --yes
git push origin :refs/tags/v0    # or retag v0 → v0.3.0
```
