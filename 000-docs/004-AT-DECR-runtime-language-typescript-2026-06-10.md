# DR-002 — Runtime language: TypeScript-primary

**Beads:** `bd_000-projects-5qd`

| Field | Value |
| --- | --- |
| Decision Record | DR-002 (intent-rollout-gate) |
| File | `004-AT-DECR-runtime-language-typescript-2026-06-10.md` |
| Date | 2026-06-10 |
| Status | RATIFIED (records a decision already locked upstream by DR-010 § 13.5) |
| Scope | The runtime language for the `intent-rollout-gate` M5 implementation |
| Supersedes | The "DEFERRED to first M5 PR" callout in `001-DR-DESIGN-rollout-gate-architecture-2026-05-12.md` § 8 ("Language choice") |
| Upstream authority | `intent-eval-lab/000-docs/010-AT-DECR-isedc-council-session-4-widened-scope-2026-05-13.md` § 13.5 (TS-primary lock for signing surfaces) |

---

## 1. Context

The M4 architecture record (`001-DR-DESIGN-…` § 8) listed the runtime language as a
deferred decision with three viable tracks — TypeScript / Node 20+, Go 1.26+, and
Python 3.12+ — and stated that the choice would be locked by the first M5 PR. Until
that lock, `action.yml` runs as a composite shell stub that emits
`decision=not-implemented` and exits 0.

That deferral is now resolved. The platform-wide language posture was settled at the
ecosystem level — not in this repo in isolation — by **ISEDC Session 4 (DR-010)
§ 13.5**, which locks **TypeScript-primary for signing surfaces** across the Intent
Eval Platform, with Python permitted only for ML-internal code paths that never touch
the signing surface. The Rollout Gate's reason for existing **is** a signing surface:
it consumes the Evidence Bundle, decides ship / no-ship, and emits a *new* signed
in-toto row attesting the rollout decision (predicateType
`https://evals.intentsolutions.io/rollout-decision/v1`). It therefore falls squarely
inside the TS-primary lock.

This DR records that already-ratified choice at the repo level, documents the
alternatives considered, names what stays deferred, and states the acceptance criteria
for the `v0.1.0-experimental → v0.2.0` transition. It is documentation of a settled
decision — not a new design choice opened for re-litigation.

## 2. Decision

**The `intent-rollout-gate` M5 implementation is authored in TypeScript on Node 20+.**

The composite-shell `action.yml` declaration stays the action's public contract
(`uses:` interface unchanged). M5 replaces the no-op `decide` step's behavior with a
Node entrypoint; adopters' workflow wiring does not change when behavior lands.

## 3. Rationale (why TypeScript, beyond the upstream lock)

The upstream DR-010 § 13.5 lock is binding on its own. The repo-level reasons that
make TS the right call here — and that the architecture record already weighed in § 8 —
are:

1. **Sister-repo parity.** `j-rig-binary-eval` is a TypeScript pnpm monorepo; the
   canonical contracts kernel `@intentsolutions/core` (the SSoT for the 13-entity
   domain model and the `gate-result/v1` predicate contract) is published as a TS
   package with JSON Schemas + Zod validators. The Rollout Gate consumes those
   contracts. Staying in TS lets it import the kernel's types and validators directly
   rather than regenerating them via codegen in a second language.
2. **Maintainer-time parity.** One runtime across the behavioral-eval repo, the
   contracts kernel, and the gate keeps the maintenance surface single-language for the
   surfaces that share schemas. This is the strongest repo-level argument and the one
   the architecture record flagged as decisive (§ 8, "maintainer-time parity with
   j-rig").
3. **Ergonomic Action APIs.** `@actions/core` + `@actions/github` give first-class
   PR-comment and status-check ergonomics for a GitHub Action, which the decision
   summary + advisory output paths need.

## 4. Alternatives considered

| Track | Why it was a real candidate | Why deferred / rejected |
| --- | --- | --- |
| **Go 1.26+** | Compiled binary → fastest cold start and smallest supply-chain surface; `sigstore-go` is mature for cosign keyless + Rekor verify; first-class in-toto libraries. Operationally the simplest supply-chain story for adopters who pin action versions. | No sister-repo parity. Cannot directly consume the `@intentsolutions/core` TS types / Zod validators — would require JSON-Schema codegen or duplicate validation, doubling the schema-drift surface the kernel SSoT exists to eliminate. The operational win does not outweigh losing single-language parity on the signing surfaces, which is exactly what DR-010 § 13.5 optimizes for. |
| **Python 3.12+** | `sigstore-python` is the reference cosign keyless implementation; `tests/TESTING.md` policy parsing is easy; partner repos shipping Python pre-commit hooks could vendor the parser. | DR-010 § 13.5 permits Python only for ML-internal paths, **not** signing surfaces — and the gate is a signing surface. No sister-repo parity for the schema-sharing surface. Adds a PyPI distribution channel to maintain alongside npm. |

Both alternatives were honest candidates (the architecture record steel-manned each).
The deciding factors are the binding upstream lock plus the schema-sharing parity with
the kernel and j-rig.

## 5. What stays deferred (NOT resolved by this DR)

This DR locks only the language. The following remain open for the M5 PR(s), exactly as
enumerated in `001-DR-DESIGN-…` § 10:

- Whether the policy parser accepts a YAML block inside `tests/TESTING.md` or parses
  the markdown table directly (M5 + audit-harness team).
- Default behavior when a bundle is empty / zero rows — block, advisory, or pass (M5).
- Whether `advisory` decisions auto-elevate to `no-ship` when configurable thresholds
  are exceeded (M5 first-adopter feedback during `audit-harness` self-adoption in M6).
- OTel exporter wiring — ship-own-exporter vs. rely-on-runner-collector (M5 + OTel
  SIG-GenAI feedback).

The CISO bindings from ISEDC DR-004 § 6 (predicate-URI immutability, DNSSEC + CAA
pre-condition before any Rekor push, `labs.intentsolutions.io` reserved-don't-touch,
no partner-name leakage, credential redaction in error messages) are unchanged and apply
to the TS implementation as written in `CLAUDE.md` § "CISO + compliance bindings".

## 6. Acceptance criteria — v0.1.0-experimental → v0.2.0 transition

The TS implementation ships first as **v0.1.0-experimental** (behavior present, contract
not yet frozen) and graduates to **v0.2.0** (stable consumption contract) only when all
of the following hold:

1. **Kernel-pinned contract.** The action imports `@intentsolutions/core` for the
   `gate-result/v1` consumed-row shape and for the `rollout-decision/v1` emitted-row
   shape, rather than carrying a hand-rolled schema. Schema validation passes against
   the kernel's published Zod validators.
2. **Policy consumption implemented.** The gate reads `tests/TESTING.md` (or the chosen
   policy expression resolved per § 5) and produces a real `ship` / `no-ship` /
   `advisory` decision for a non-empty bundle, replacing the `not-implemented` stub
   verdict.
3. **CISO bindings enforced in code, not just documented.** The DNSSEC + CAA
   pre-condition check (DR-004 § 6.1) runs before any Rekor push and refuses with a
   clear, credential-redacted error if unmet; the credential-redaction test exists and
   passes.
4. **Testing SOP gate green.** `@intentsolutions/audit-harness` is installed as a dev
   dependency, wired into `.github/workflows/ci.yml` and the pre-commit hook, and
   `pnpm run check` (lint + typecheck + test) passes with the repo's coverage and
   mutation floors met. Enforcement references the in-repo harness copy, never a
   `~/.claude/` path.
5. **First downstream adopter (M6) wired without contract change.** `audit-harness`
   self-adopts the gate before any partner repo, exercising the consume-decide-emit loop
   end-to-end against a real Evidence Bundle.

Until all five hold, the action stays at v0.1.0-experimental and the public `uses:`
interface remains forward-compatible (inputs/outputs additive only, per Evidence Bundle
SPEC R18; no breaking changes without a `/v2` predicate-URI mint per R17).

## 7. Consequences

- The architecture record's § 8 deferral is now closed; future readers should treat this
  DR as the authority for "what language is the gate" and § 8 as historical context for
  the tradeoff analysis.
- M5 PRs that propose a non-TS runtime are out of order and should be closed with a
  pointer to this DR + DR-010 § 13.5.
- The gate gains direct access to the kernel's contracts, eliminating a cross-language
  schema-drift surface that would otherwise need its own drift-watch.

## Cross-references

- Architecture record (deferred-decision source): `001-DR-DESIGN-rollout-gate-architecture-2026-05-12.md` § 8 "Language choice", § 10 "Open questions deferred to M5"
- Upstream language lock: `intent-eval-lab/000-docs/010-AT-DECR-isedc-council-session-4-widened-scope-2026-05-13.md` § 13.5
- CISO compliance bindings: `intent-eval-lab/000-docs/004-AT-DECR-isedc-council-record-2026-05-10.md` § 6 and this repo's `CLAUDE.md` § "CISO + compliance bindings"
- Canonical contracts kernel: `@intentsolutions/core` (TS types + JSON Schemas + Zod validators for the 13-entity domain model and `gate-result/v1`)
- Evidence Bundle SPEC (consumed contract): `intent-eval-lab/specs/evidence-bundle/v0.1.0-draft/SPEC.md` R14–R18
