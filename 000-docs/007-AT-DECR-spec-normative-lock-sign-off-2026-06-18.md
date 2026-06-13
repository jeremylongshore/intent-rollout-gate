---
date: 2026-06-18
status: RATIFIED — acting-head-of-board sign-off under explicit owner delegation. Ratifies the Evidence Bundle SPEC normative-content lock for the intent-rollout-gate consumption surface ahead of the v0.2.0 contract freeze.
class: Class-2 acting-head adjudication (single-surface sign-off), NOT a 7-seat ISEDC convening
author: Jeremy Longshore (acting head of board — Claude per explicit owner delegation, 2026-06-18; same delegation basis as DR-062 and the pre-Rekor governance ratified this session)
basis: 006-AT-SPEC verification record (i59m/xyrr/d1va/pf4) confirming SPEC R14–R18 + kernel gate-result.schema.json + audit-harness DNSSEC/CAA pre-flight all present and locked
relates: DR-002 § 6 (004-AT-DECR acceptance criteria); DR-018 § 6.4 (kernel schema authority, Option α-minus); DR-004 § 6.1 (DNSSEC/CAA CISO binding)
---

# SPEC normative-lock sign-off (intent-rollout-gate consumption surface)

## Tri-link block

```text
Beads: 3knk (sign-off); i59m / xyrr / d1va / pf4 (verification — 006-AT-SPEC)
GitHub: jeremylongshore/intent-rollout-gate#<TBA>
```

## 1. The sign-off

> I ratify, as acting head of board under explicit owner delegation, that the Evidence
> Bundle SPEC normative content the `intent-rollout-gate` action consumes is **locked**
> for the purpose of freezing the v0.2.0 consumption contract. Specifically: the SPEC's
> `R14`–`R18` (consumption interface + version-evolution rules), the kernel
> `gate-result/v1` JSON Schema, and the audit-harness DNSSEC + CAA emit-evidence
> pre-flight are all present, verified, and binding on the v0.2.0 graduation.

**Delegation basis.** Explicit owner instruction 2026-06-18 designating Claude as acting
head of board for this sign-off — the **same delegation basis** as DR-062 (acting-CTO
adjudication of the tier-3 reconciliation queue, 2026-06-12) and the pre-Rekor governance
ratified during this session. This is a Class-2 single-surface sign-off, not a charter
change and not a 7-seat ISEDC convening. The acting-head authority here is scoped to
**ratifying an already-verified lock**, not to minting new normative content.

## 2. Scope — what this sign-off does and does NOT cover

**Covers (in scope):**

- Ratifies that SPEC `R14`–`R18` are the binding consumption / version-evolution
  requirements the Rollout Gate implements, as verified in `006-AT-SPEC` § 2.
- Ratifies that the kernel `@intentsolutions/core` `schemas/v1/gate-result.schema.json`
  (kernel `0.6.0`) is the canonical consumed-row schema per the SPEC schema-authority
  banner (DR-018 § 6.4, Option α-minus), as verified in `006-AT-SPEC` § 3.
- Ratifies that the DNSSEC + CAA refuse-on-unverified pre-flight, inherited by the gate's
  signing path from audit-harness `emit-evidence` (#70 on `origin/main`), satisfies the
  DNSSEC/CAA half of DR-002 § 6 criterion 3, as verified in `006-AT-SPEC` § 4.
- Authorizes treating the SPEC normative content above as **frozen input** to the v0.2.0
  consumption-contract freeze — i.e., the v0.2.0 graduation is not blocked on absent or
  unratified upstream SPEC content.

**Does NOT cover (explicitly out of scope — no overclaim):**

- Does **not** freeze the Evidence Bundle SPEC itself. The SPEC remains `v0.1.0-draft`
  ("NORMATIVE DRAFT"); the SPEC's own `v0.1.0-rc` / `v0.1.0` graduation (R19) is the lab's
  to ratify, not this repo's. This sign-off ratifies only that the *current normative
  content* the gate consumes is stable enough to pin the gate's v0.2.0 contract.
- Does **not** ratify the v0.2.0 release of `intent-rollout-gate`. That release additionally
  requires DR-002 § 6 criteria C2 (policy consumption — partially landed at v0.1.0), C4
  (in-repo Testing SOP gate green), and C5 (M6 first adopter), none of which this sign-off
  speaks to.
- Does **not** alter any predicate URI, attestation envelope, or CISO binding. The URIs
  `https://evals.intentsolutions.io/gate-result/v1` and `.../rollout-decision/v1` remain
  immutable per SPEC R17 / Blueprint B § 7.2. No Rekor push is authorized by this record.
- Does **not** speak to the credential-redaction half of DR-002 § 6 criterion 3 beyond
  noting it is implemented in this repo's own test suite (cluster A) and cross-referenced
  in `006-AT-SPEC` § 4.2.

## 3. Why a sign-off, not a re-decision

The substantive decisions were already made: the SPEC normative shape (Blueprint B § 7,
2026-05-15), the kernel-as-SSoT schema authority (DR-018 § 6.4, 2026-05-21), and the
DNSSEC/CAA CISO binding (DR-004 § 6.1, 2026-05-10). This record does not re-open any of
them. It performs the **governance act** DR-002 § 6 implies but did not itself schedule:
an explicit acting-head confirmation that those external preconditions are met **before**
the gate freezes its v0.2.0 contract, so the freeze rests on a ratified lock rather than
an undocumented assumption. The verification that grounds it is `006-AT-SPEC` (§ 6,
"Verification method" — all confirmations made against checked-out source).

## 4. Consequences

- The v0.2.0 consumption-contract freeze may proceed treating SPEC `R14`–`R18` + the kernel
  `gate-result/v1` schema + the audit-harness DNSSEC/CAA pre-flight as ratified, locked
  inputs.
- Any future change to those upstream surfaces that would break the gate's consumed-row
  shape MUST mint a new predicate URI per SPEC R17 and re-open this sign-off; additive
  changes per SPEC R18 do not.
- Future readers should treat `006-AT-SPEC` as the evidence and this DR as the ratification
  of the lock it documents.

## Cross-references

- Verification record (evidence): `006-AT-SPEC-evidence-bundle-normative-lock-verification-2026-06-18.md`
- Acceptance criteria source: `004-AT-DECR-runtime-language-typescript-2026-06-10.md` § 6
- v0.2.0 migration notes: `008-RL-REPT-v0.2.0-migration-notes-2026-06-18.md`
- Kernel schema authority: `intent-eval-lab/000-docs/018-AT-DECR-isedc-council-session-5-jrig-reconciliation-2026-05-21.md` § 6.4
- DNSSEC/CAA CISO binding: `intent-eval-lab/000-docs/004-AT-DECR-isedc-council-record-2026-05-10.md` § 6.1
- Delegation-basis precedent: `intent-eval-lab/000-docs/062-AT-DECR-tier3-reconciliation-authoring-v2-bases-2026-06-12.md`
