# Evidence Bundle SPEC normative-lock verification (E08 acceptance record)

**Beads:** `i59m` · `xyrr` · `d1va` · `pf4` (consolidation) · `3knk` (sign-off, separate doc)

| Field | Value |
| --- | --- |
| Record type | AT-SPEC — acceptance / verification record |
| File | `006-AT-SPEC-evidence-bundle-normative-lock-verification-2026-06-18.md` |
| Date | 2026-06-18 |
| Status | VERIFIED — three acceptance criteria confirmed against checked-out source |
| Scope | Confirms the SPEC normative content + kernel schema + DNSSEC/CAA pre-flight that gate the `v0.1.0-experimental → v0.2.0` transition (DR-002 § 6) are all present and locked **before** v0.2.0 |
| Acting-head sign-off | `007-AT-DECR-spec-normative-lock-sign-off-2026-06-18.md` (ratifies this record) |

---

## 1. Purpose

DR-002 § 6 ("Acceptance criteria — v0.1.0-experimental → v0.2.0 transition") names five
conditions the Rollout Gate must satisfy before it graduates from the experimental
v0.1.0 step to the stable-contract v0.2.0. Three of those conditions depend on artifacts
that live **outside** this repo:

- the **Evidence Bundle SPEC** normative requirements `R14`–`R18` (the consumption
  interface this action implements),
- the **kernel JSON Schema** for the `gate-result/v1` consumed-row body, and
- the **audit-harness DNSSEC + CAA pre-flight** that the gate's eventual signing path
  delegates to.

This record verifies each of those three external preconditions is present and locked,
so the v0.2.0 graduation is not blocked on missing or unratified upstream content. It is
a verification record — it confirms existing state; it does not author new normative
content.

## 2. Acceptance criterion 1 — SPEC R14–R18 normative gate-result/v1 section present (i59m)

**Confirmed present.**

| Item | Value |
| --- | --- |
| File | `intent-eval-lab/specs/evidence-bundle/v0.1.0-draft/SPEC.md` |
| Status banner | "NORMATIVE DRAFT" (top of file) |
| `R14` | § 8 "Policy consumption — `tests/TESTING.md`" → "Policy is NOT part of this spec" |
| `R15` | § 8 "Consumption interface" — the 5-step MUST sequence a consumer (named: the `intent-rollout-gate` GitHub Action) follows: read → verify-per-R13 → read policy → evaluate → emit ship/no-ship/advisory; MUST NOT modify the bundle |
| `R16` | § 8 "Example policy shape" — `examples/policy.yaml` is informative, not normative |
| `R17` | § 9 "URI immutability" — `https://evals.intentsolutions.io/gate-result/v1` permanent once signed; breaking changes mint `/v2`; both MAY coexist |
| `R18` | § 9 "Additive minor versions" — additive optional fields / new optional-enum values / prose clarifications MUST NOT bump the URI; the JSON Schema MUST stay backward-compatible across minor revisions |

The `gate-result/v1` predicate itself is specified in § 5 of the SPEC; its predicate URI
is `https://evals.intentsolutions.io/gate-result/v1`. The schema-authority banner at the
top of the SPEC records (effective 2026-05-21, ISEDC Session 5 § 6.4, Option α-minus)
that the canonical JSON Schema is the **kernel** copy and that the in-directory
`schema/gate-result.schema.json` is a redirect stub — **the kernel schema wins on
conflict**. This is the binding that makes criterion 2 the source of truth.

**Verdict for criterion 1: PRESENT.** `R14`–`R18` are the normative consumption /
version-evolution requirements the Rollout Gate consumes; they map directly onto the
DR-002 § 6 acceptance criteria (the action implements R15's 5-step interface and respects
R17/R18 immutability + additive-minor rules — see CHANGELOG `[0.1.0]` "Changed" → reserved
inputs retained additively "per Evidence Bundle SPEC R18").

## 3. Acceptance criterion 2 — kernel ships `schemas/v1/gate-result.schema.json` (xyrr)

**Confirmed shipped.**

| Item | Value |
| --- | --- |
| Package | `@intentsolutions/core` |
| Version (checked-out) | `0.6.0` |
| Schema file | `intent-eval-core/schemas/v1/gate-result.schema.json` (present on disk) |
| Export map | `package.json` exposes `"./schemas/v1/*.json"` and `"./schemas/v1"` (index), so a consumer can `import schema from '@intentsolutions/core/schemas/v1/gate-result.schema.json' with { type: 'json' }` |
| Generated validators | `codegen:validators` script emits Zod validators from `schemas/v1/*.schema.json` into `src/validators/v1/_generated/` |

The kernel is the SSoT for the `gate-result/v1` consumed-row shape per the SPEC
schema-authority banner (§ 2 above) and per DR-002 § 6 criterion 1, which requires the
action to import `@intentsolutions/core` for the consumed-row shape rather than
hand-rolling a schema. The v0.1.0 release already wires this: CHANGELOG `[0.1.0]` notes
"row validation reuses the kernel `@intentsolutions/core` gate-result/v1 statement schema."

**Verdict for criterion 2: SHIPPED** at kernel `0.6.0`.

## 4. Acceptance criterion 3 — audit-harness DNSSEC + CAA emit-evidence pre-flight on main (d1va)

**Confirmed merged to `audit-harness` `origin/main`.**

| Item | Value |
| --- | --- |
| Merge | "feat(emit-evidence): add DNSSEC + CAA pre-flight gate before production signing (iah-E06) (#70)" — commit `0095d84` on `audit-harness` `origin/main` |
| `scripts/dnssec-check.sh` | present on `origin/main` (mode `100755`) |
| `scripts/caa-check.sh` | present on `origin/main` (mode `100755`) |
| `scripts/emit-evidence.sh` | present on `origin/main` (mode `100755`); carries the pre-flight gate |

### 4.1 The pre-flight gate's behavior (verified in `emit-evidence.sh` on `origin/main`)

- Before any **production Rekor push**, the script runs `dnssec-check.sh` then
  `caa-check.sh` against the predicate namespace and **REFUSES to sign (exit 4)** if
  either fails — fail-closed, "nothing was signed."
- The gate is **read-only** — it inspects DNS state; it mutates nothing.
- The opt-out `EVIDENCE_SKIP_DNS_PREFLIGHT=1` is honored **only** for non-production
  (no production Rekor push). When a production Rekor push is requested, the env var is
  explicitly **ignored** — a production attestation cannot skip the pre-flight.
- The gate is annotated as **CISO binding DR-010 Q5** in the script, consistent with the
  ISEDC DR-004 § 6.1 DNSSEC + CAA pre-condition this repo's SECURITY.md and DR-002 § 5
  cite.

### 4.2 Why this satisfies the Rollout Gate's criterion 3 (inheritance)

DR-002 § 6 criterion 3 requires that "the DNSSEC + CAA pre-condition check runs before any
Rekor push and refuses with a clear, credential-redacted error if unmet." The Rollout
Gate is the **thin shell** (Blueprint A); its signing path **delegates to audit-harness
`emit-evidence`** for the actual signing + Rekor push. Because the signing happens inside
`emit-evidence.sh`, the gate **inherits** the refuse-on-unverified DNSSEC/CAA behavior
verified in § 4.1 — it does not need to (and must not) re-implement a second pre-flight.
This is the same single-emitter principle that keeps the gate from duplicating kernel
contracts.

The **credential-redaction-test half** of criterion 3 is implemented in this repo's own
test suite (cluster A's work). This record cross-references it: the DNSSEC/CAA half is
satisfied by inheritance from audit-harness `emit-evidence` (verified here); the
credential-redaction half is satisfied by the redaction test in `tests/` authored under
the cluster-A test track. Both halves together close criterion 3.

**Verdict for criterion 3: SATISFIED** — DNSSEC/CAA refuse-on-unverified inherited from
audit-harness `emit-evidence` (#70 on main); credential-redaction test cross-referenced
to cluster A's suite.

## 5. E08 acceptance roll-up (pf4)

Consolidating i59m + xyrr + d1va + the sign-off (3knk, `007-AT-DECR-…`):

| # | DR-002 § 6 criterion | External precondition | State |
| --- | --- | --- | --- |
| C1 | Kernel-pinned consumed-row contract | SPEC `R14`–`R18` normative + kernel `gate-result.schema.json` | **PRESENT** (§ 2 + § 3) |
| C2 | Policy consumption implemented | (in-repo, v0.1.0 shipped — not an external precondition) | tracked in CHANGELOG `[0.1.0]` |
| C3 | DNSSEC + CAA pre-condition enforced before Rekor push | audit-harness `emit-evidence` pre-flight (#70) + in-repo redaction test | **SATISFIED** by inheritance + cross-ref (§ 4) |
| C4 | Testing SOP gate green | (in-repo harness) | out of this record's scope |
| C5 | First downstream adopter (M6) wired | (future — audit-harness self-adoption) | gates v0.2.0, not this record |

**Net:** the three **externally-sourced** normative preconditions that gate the v0.2.0
contract freeze — the SPEC's `R14`–`R18`, the kernel schema, and the audit-harness
DNSSEC/CAA pre-flight — are all present and locked **before v0.2.0**. The remaining
criteria (C2 partially landed at v0.1.0; C4 in-repo; C5 future) are tracked in the
CHANGELOG `[Unreleased]` section and DR-002 § 6, not blocked on missing upstream content.

This record establishes that the SPEC normative content is **locked before v0.2.0**, which
is the gate this E08 acceptance check exists to confirm. The acting-head-of-board sign-off
ratifying this lock is `007-AT-DECR-spec-normative-lock-sign-off-2026-06-18.md`.

## 6. Verification method

All three confirmations were made against the **checked-out source** in the local
`intent-eval-platform` tree (not against memory or prose summaries):

- SPEC: `intent-eval-lab/specs/evidence-bundle/v0.1.0-draft/SPEC.md` § 8 + § 9 read directly.
- Kernel: `intent-eval-core/schemas/v1/gate-result.schema.json` on disk + `package.json` `version` + `exports`.
- audit-harness: `git ls-tree origin/main scripts/` + `git show origin/main:scripts/emit-evidence.sh` (the local working-tree HEAD was behind `origin/main`; verification used the `origin/main` tree where #70 is merged).

## Cross-references

- DR-002 § 6 (acceptance criteria): `004-AT-DECR-runtime-language-typescript-2026-06-10.md`
- Acting-head sign-off ratifying this lock: `007-AT-DECR-spec-normative-lock-sign-off-2026-06-18.md`
- v0.1.0-experimental → v0.2.0 migration notes: `008-RL-REPT-v0.2.0-migration-notes-2026-06-18.md`
- Evidence Bundle SPEC: `intent-eval-lab/specs/evidence-bundle/v0.1.0-draft/SPEC.md` (`R14`–`R18`; § 5 `gate-result/v1` predicate; schema-authority banner)
- Kernel schema authority: ISEDC Session 5 DR-018 § 6.4 (Option α-minus), `intent-eval-lab/000-docs/018-AT-DECR-isedc-council-session-5-jrig-reconciliation-2026-05-21.md`
- DNSSEC/CAA CISO binding: `intent-eval-lab/000-docs/004-AT-DECR-isedc-council-record-2026-05-10.md` § 6.1
- audit-harness pre-flight: `audit-harness` `scripts/{dnssec-check.sh,caa-check.sh,emit-evidence.sh}` (#70, `origin/main`)
