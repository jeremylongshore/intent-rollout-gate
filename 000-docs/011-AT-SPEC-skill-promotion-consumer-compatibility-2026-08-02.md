# Skill-promotion consumer compatibility

**Bead:** `bd_000-projects-htjt.13.4`
**Plan:** `IEP-EVAL-EVOLUTION-001`
**Date:** 2026-08-02
**Status:** IMPLEMENTED ON STACKED FEATURE BRANCH

## Purpose

The rollout Action consumes real-skill `j-rig:local:<skill>.<model>` rows,
but the generic `gate-result/v1` predicate does not by itself prove which
skill snapshot, profile, Grader, thresholds, or regression comparison produced
the row. The consumer therefore verifies the producer's additive
`j-rig/skill-promotion/v1` metadata before delegating the rollout decision.

This is a provenance preflight, not a second rollout engine. Threshold and
regression semantics remain owned by the producer and the published
`@intentsolutions/rollout-gate` package; the Action checks that the declared
promotion evidence is present, internally consistent, and eligible.

## Activation boundary

The preflight activates for a `j-rig:local:*` row matched by a required policy
pattern. A local row that is merely unknown and not required retains the
delegated package's existing compatibility behavior. A policy that explicitly
requires a local row therefore opts into the stronger contract.

Required evidence includes:

| Area | Consumer check |
| --- | --- |
| Row binding | in-toto subject digest equals `predicate.input_hash`; the row decision is `pass` |
| Run identity | UUID `eval_run_id` is present in `run_ids`; positive storage IDs are linked |
| Skill identity | `skill.snapshot_sha256` equals `input_hash`; `skill_version_id` is content-addressed from that hash |
| Profile identity | `eval_spec.profile_sha256` equals `policy_hash`; `identity_kind` is `j-rig-skill-profile` |
| Grader identity | selected Grader ID/version/snapshot digest are present |
| Thresholds | required and observed pass rate are 1, criteria are non-empty, and no failed/unsure/blocker criteria exist |
| Regression | comparison is required and enabled, baseline is hashed, result is `no-regressions`, and counts are zero |
| Decision | producer says `ship`, `promotion_eligible: true`, and metadata gate decision is `pass` |

## Compatibility outcomes

| Input | Outcome |
| --- | --- |
| Current producer metadata, matching hashes, clean regression | Continue to delegated policy decision |
| Missing or legacy metadata on a required local row | `block` with an actionable preflight reason |
| Skipped regression or advisory producer row | `block`; it cannot be promoted as a clean pass |
| Sacred regression or producer `fail` row | `block`; the blocking evidence remains visible |
| Generic unified/suite report with passing lineage and a valid local row | Continue; both provenance boundaries are enforced |
| Local row not matched by any required policy pattern | Preserve delegated compatibility; the caller did not request promotion of that row |

No predicate URI changes. The metadata is additive under Evidence Bundle R18,
and the generic `j-rig/unified-report/v1` report path remains supported.

## Migration

1. Upgrade the j-rig producer to emit `j-rig/skill-promotion/v1`.
2. Supply a regression baseline when a local row is intended to promote.
3. Keep `report-path` and `audit-manifest-path` bindings unchanged for generic
   or suite reports.
4. Run the clean, skipped, malformed, stale, and sacred fixtures before
   changing a policy to enforce the local row.

The consumer intentionally rejects old hand-authored local fixtures once the
policy requires them. Re-pin the previous Action tag only as a temporary
rollback while the producer is upgraded; weakening the required gate would
hide the missing evidence rather than solve the compatibility gap.

## Verification

The contract is covered by `tests/run.test.ts` through the real Action wiring:
clean promotion, missing metadata, skipped regression, stale skill snapshot,
sacred regression, generic report plus suite-manifest binding, and the
non-required local-row compatibility path.
