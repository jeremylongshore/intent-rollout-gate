# Migration notes — v0.1.0-experimental -> v0.2.0

**Beads:** `60nu`

| Field | Value |
| --- | --- |
| Record type | RL (Release Report) — migration notes |
| File | `008-RL-REPT-v0.2.0-migration-notes-2026-06-18.md` |
| Date | 2026-06-18 |
| Status | RELEASED — v0.2.0 shipped (CHANGELOG `[0.2.0]`); current line is v0.3.0. Authored as forward-looking migration guidance before the v0.2.0 cut; the transition it describes is now live. |
| Governs | The `v0.1.0` (M5 TypeScript MVP, "experimental" per DR-002 § 6) -> `v0.2.0` (stable consumption contract) transition |

---

## 1. What "v0.1.0-experimental" means here

DR-002 § 6 frames the M5 implementation as shipping first as **v0.1.0-experimental**
("behavior present, contract not yet frozen") and graduating to **v0.2.0** ("stable
consumption contract") only when all five acceptance criteria hold. In practice the M5 MVP
released as the concrete tag **`v0.1.0`** (CHANGELOG `[0.1.0]`, 2026-06-11). This document
treats that `v0.1.0` release as the "experimental" step DR-002 names, and `v0.2.0` as the
graduation target.

The action's public `uses:` interface is **forward-compatible** across this transition:
inputs/outputs are additive only (Evidence Bundle SPEC R18), and no breaking change ships
without a new predicate URI per SPEC R17. Adopters pinned to `v0.1.0` do not need to change
workflow wiring to adopt `v0.2.0` — they upgrade the pin.

## 2. What changes for an adopter at v0.2.0

`v0.2.0` graduates the **contract**, not the wiring. The changes an adopter should expect:

| Area | v0.1.0 (experimental) | v0.2.0 (stable contract) |
| --- | --- | --- |
| Consumed-row schema | Kernel `gate-result/v1` reused for row validation | Same kernel schema, now a **frozen** consumption contract pinned for v0.2.0 (006-AT-SPEC + 007-AT-DECR lock) |
| Decision logic | Delegated to `@intentsolutions/rollout-gate@2.0.0` | Unchanged delegation; thin shell preserved |
| Inputs/outputs | `policy-path` / `policy-json` / `fail-on-block`; reserved signing inputs no-op | Additive only per SPEC R18; reserved signing inputs remain reserved until decision-row signing lands |
| Decision-row signing | Not emitted (`signed-decision-row-path` empty) | Still gated on the DNSSEC + CAA pre-condition; emits only once that pre-condition is met (delegated to audit-harness `emit-evidence`) |
| Fail-closed posture | Block on missing/invalid bundle, ambiguous policy, garbage policy, non-default predicate URI | Unchanged — fail-closed is part of the frozen contract |

**No breaking input/output rename or removal** is part of v0.2.0. The `policy-file` and
`dry-run` deprecated aliases introduced at v0.1.0 remain accepted (they are deprecated, not
removed). A removal would be a SemVer-major event and would require its own migration note.

## 3. Migration steps for an adopter

1. **Bump the action pin.** Change `uses: jeremylongshore/intent-rollout-gate@v0.1.0`
   (or the v0.1.0 SHA) to the `v0.2.0` tag — or, for highest assurance, the `v0.2.0`
   commit SHA. SHA-pinning is recommended per SECURITY.md.
2. **No policy change required.** The policy you pass (`policy-path` / `policy-json`) is
   unchanged. `tests/TESTING.md` markdown-table parsing stays deferred (DR-002 § 5); v0.2.0
   continues to consume JSON policy documents only.
3. **No predicate-URI change.** The action still accepts only the default
   `https://evals.intentsolutions.io/gate-result/v1` consumed-row URI; passing any other
   value still blocks (fail-closed).
4. **If you rely on decision-row signing:** it remains unavailable until the DNSSEC + CAA
   pre-condition on the predicate namespace is satisfied. `signed-decision-row-path` stays
   empty until then; this is intentional fail-closed behavior, not a regression.

## 4. Graduation gate — what must hold before v0.2.0 ships

Per DR-002 § 6, ratified-locked for the external preconditions by 006-AT-SPEC + 007-AT-DECR:

- **C1 (kernel-pinned contract):** SPEC `R14`–`R18` + kernel `gate-result.schema.json`
  present and locked. **Met** (006-AT-SPEC § 2 + § 3).
- **C2 (policy consumption implemented):** real ship / no-ship / advisory decision for a
  non-empty bundle. **Landed at v0.1.0** (`decision` emits `allow` / `block`).
- **C3 (DNSSEC + CAA enforced before Rekor push):** DNSSEC/CAA half **met** by inheritance
  from audit-harness `emit-evidence` (#70); credential-redaction half implemented in the
  in-repo test suite (cluster A). (006-AT-SPEC § 4.)
- **C4 (Testing SOP gate green):** in-repo `@intentsolutions/audit-harness` wired into CI
  and pre-commit; `pnpm run check` green with coverage + mutation floors. **In-repo, must
  stay green.**
- **C5 (first downstream adopter, M6):** `audit-harness` self-adopts the gate end-to-end.
  **Future** — gates v0.2.0 graduation.

When C4 and C5 close (C1–C3 already locked), the action graduates to v0.2.0 and the
consumption contract is frozen.

## 5. Rollback

`v0.2.0` is additive over `v0.1.0`. An adopter who hits an issue can re-pin to `v0.1.0`
(tag or SHA) with no workflow change, since v0.2.0 introduces no breaking input/output
change. There is no data-migration or state to unwind — the action is stateless per
invocation.

## Cross-references

- Acceptance criteria: `004-AT-DECR-runtime-language-typescript-2026-06-10.md` § 6
- Normative-lock verification: `006-AT-SPEC-evidence-bundle-normative-lock-verification-2026-06-18.md`
- Acting-head sign-off: `007-AT-DECR-spec-normative-lock-sign-off-2026-06-18.md`
- CHANGELOG `[Unreleased]` / `[0.2.0]` section: `../CHANGELOG.md`
- Evidence Bundle SPEC R17 (URI immutability) + R18 (additive minor): `intent-eval-lab/specs/evidence-bundle/v0.1.0-draft/SPEC.md` § 9
