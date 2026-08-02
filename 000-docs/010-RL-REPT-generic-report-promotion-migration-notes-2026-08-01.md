# Migration notes — generic report promotion binding

**Bead:** `bd_000-projects-htjt.13.1`

| Field | Value |
| --- | --- |
| Record type | RL (Release Report) — migration notes |
| File | `010-RL-REPT-generic-report-promotion-migration-notes-2026-08-01.md` |
| Date | 2026-08-01 |
| Status | UNRELEASED — additive feature on the current v0.3.x line |
| Governs | The optional `report-path` promotion preflight |

## 1. What changes

The action keeps its existing Evidence Bundle + policy contract and adds an
optional `report-path` input. When supplied, the action reads the exact local
JSON bytes and requires one passing `audit-harness:ci:report-lineage` statement
that proves:

- `input_hash` and the in-toto subject digest match those exact bytes;
- the report schema is `j-rig/unified-report/v1` or `j-rig/suite-report/v1`;
- the selected Grader identity matches the lineage metadata;
- all deterministic Run counts match the report summary;
- sample-balance metadata reports zero duplicate sample indexes; and
- suite reports have a verified audit-manifest source.

For `j-rig/suite-report/v1`, pass `audit-manifest-path` as well. The producer
hashes `report bytes + NUL + audit-manifest bytes`; the action recomputes that
same byte sequence before accepting the statement.

The rollout decision remains delegated to `@intentsolutions/rollout-gate`.
The preflight only binds provenance and fails closed on missing or malformed
evidence. When the policy requires a `j-rig:local:*` row, the companion
skill-promotion preflight also requires the producer's versioned
`j-rig/skill-promotion/v1` identity and clean regression evidence. Neither
preflight replaces the delegated rollout algebra.

## 2. Generic report promotion path

The producer/consumer hand-off is:

1. J-Rig emits a generic unified or suite report.
2. `audit-harness report-lineage --json --strict` validates the report and
   emits the `audit-harness:ci:report-lineage` gate result with the selected Grader, Run counts,
   sample-balance result, schema, and exact input hash.
3. `audit-harness emit-evidence` places that row beside the real-skill J-Rig
   rollout row in an Evidence Bundle.
4. The consumer passes `bundle-path`, `report-path`, and a policy requiring
   both `audit-harness:ci:report-lineage` and the actual J-Rig
   `j-rig:local:*` skill-row pattern.

The report remains a local unsigned projection. The attested Evidence Bundle
is the provenance boundary; the action never treats a report path by itself as
evidence of a passing evaluation.

## 3. Adopter migration

Existing skill-only callers can still omit `report-path` and may continue using
a policy that explicitly requires their skill gate, but the producer row must
now carry valid `j-rig/skill-promotion/v1` metadata. Legacy hand-authored or
pre-contract rows fail closed when a required policy pattern matches them; this
prevents an old bundle from being mistaken for a verified promotion.

To adopt report promotion:

1. Preserve the report file until the rollout action completes; changing even
   whitespace changes its hash and must block promotion.
2. Add `report-path` beside `bundle-path`; add `audit-manifest-path` for a
   suite report.
3. Require both lineage and skill gate IDs in the policy.
4. Emit the lineage row from the audit-harness producer and keep the generated
   bundle tied to the same report bytes.
5. Upgrade the j-rig producer so its local row carries the promotion contract,
   including an executed no-regression baseline for a clean `pass`.
6. Verify the promotion fixture and end-to-end smoke lane before enforcement.

This is additive under Evidence Bundle SPEC R18. No predicate URI or existing
output changes. A report-binding failure returns `decision=block` and an
actionable reason; `fail-on-block: 'false'` remains available for observation.

## 4. Rollback and compatibility

If a consumer is not ready to promote generic reports, remove `report-path`
and use its explicit skill-only policy with current producer evidence. Do not
remove the lineage requirement from a policy while continuing to pass
`report-path`: the action intentionally blocks that incomplete configuration.
Re-pin to the prior action tag if the consumer cannot deploy the additive
preflight yet; no state migration is needed.

## Cross-references

- `README.md` — generic report promotion quickstart and input contract
- `tests/TESTING.md` — promotion provenance test property and CI lanes
- `CHANGELOG.md` — unreleased change entry
- `011-AT-SPEC-skill-promotion-consumer-compatibility-2026-08-02.md` — required
  real-skill producer contract and compatibility matrix
- Evidence Bundle SPEC R17/R18 — predicate identity and additive input rules
- `bd_000-projects-htjt.13.1` — implementation and acceptance record
