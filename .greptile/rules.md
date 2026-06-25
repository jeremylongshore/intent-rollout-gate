# Greptile reviewer orientation — intent-rollout-gate

You are reviewing PRs for `jeremylongshore/intent-rollout-gate`. Read this
before forming an opinion on any diff. The machine-checkable rules live in
`.greptile/config.json`; this file is the *why* behind them. When a diff
touches the Action wiring, predicate handling, or version surfaces, also read
`CLAUDE.md`, `action.yml`, and `000-docs/001-DR-DESIGN-rollout-gate-architecture-2026-05-12.md`.

## (a) Platform context

This repo is one of **six repos in the Intent Eval Platform**, an
agent-native evaluation platform whose repos converge **at the schema layer**
— a shared **Evidence Bundle** (collections of signed in-toto Statement v1
rows under predicateType `https://evals.intentsolutions.io/gate-result/v1`).
They do NOT converge via package consolidation: each repo has its own `.git`,
license, and release cycle. The kernel `intent-eval-core`
(`@intentsolutions/core`) is the source-of-truth the others consume.

`intent-rollout-gate` is the **fourth, terminal repo in the convergence** —
the **thin GitHub Action shell**. Its job: consume an Evidence Bundle plus a
rollout policy and emit a ship / no-ship (`allow` / `block`) decision a CI
pipeline reads as a status check. It is strictly a **decision tier above the
bundle**: the bundle is the input, the policy is the threshold, the decision
is the output. It makes **no novel attestations of code quality** — it never
re-judges the gates that produced the rows.

The decision logic does **not** live here. It is delegated to the published
**`@intentsolutions/rollout-gate@2.0.0`** package (built in the
`j-rig-skill-binary-eval` monorepo). Row validation reuses the kernel
`@intentsolutions/core` `gate-result/v1` statement schema — no schema is
re-declared in this repo.

## (b) The thin-shell discipline (the load-bearing invariant)

This Action is a **wiring layer and nothing else**. The source
(`src/run.ts`, `src/main.ts`, `src/summary.ts`) may contain ONLY:

- reading + validating Action inputs,
- file I/O for the bundle and the policy,
- calling `decide(bundle, policy)` from `@intentsolutions/rollout-gate`,
- rendering the `decision` / `reasons` outputs and the markdown step summary,
- exit-code wiring (`fail-on-block` / legacy `dry-run`).

It must **never** contain `decide()`, `parsePolicy()`, gate semantics,
predicate evaluation, a verdict algorithm, or threshold / coverage / pass-rate
logic. Those belong upstream in `@intentsolutions/rollout-gate`; if decision
behavior must change, it changes there and the dependency is bumped here. The
shell's own LOC budget is ≤ 200 (blueprint § 3.4). The test suite is
fixture-dominant precisely because the algebra is owned and tested upstream.

**A PR that re-implements gate semantics, a policy parser, a verdict
algorithm, or threshold logic locally is out of order — flag it.**

## (c) Fail-closed — no silent pass

Every wiring failure resolves to a `block` decision, never a silent
`allow` / exit-0. That includes: a missing / unreadable / invalid-JSON
bundle; an invalid or unparseable policy; both-or-neither policy source
(exactly one of `policy-path` / `policy-json` is required); an unsupported
`predicate-uri`; an empty bundle; schema-invalid rows; a missing or
non-passing required gate; and any unexpected/thrown error. A `block`
fails the job unless `fail-on-block` is the explicit string `'false'`
(or the legacy `dry-run: 'true'`). **Flag any change that reintroduces an
always-pass / not-implemented stub path, weakens a failure branch to an
`allow`, or makes a catch block swallow an error into a pass.**

## (d) Predicate / attestation handling

- The consumed predicate URI is
  `https://evals.intentsolutions.io/gate-result/v1`; the (reserved) emitted
  one is `https://evals.intentsolutions.io/rollout-decision/v1`.
- The supported gate-result URI must come from the **kernel constant**
  `@intentsolutions/core` `GATE_RESULT_V1_URI` — the single source of truth —
  **not** a hand-rolled local string literal.
- These URIs are **immutable once any signed row references them** and the row
  is pushed to Rekor. Breaking changes mint `/v2`; never reformat, shorten, or
  namespace-rename an existing URI.
- **`labs.intentsolutions.io` is reserved-don't-touch** for attestation
  surface — it is a content/blog/methodology subdomain only. A predicate URI,
  OTel attribute namespace, or attestation predicate identifier under `labs.*`
  is a hard violation. Attestation surface lives ONLY under `evals.*`.
- Signing / Rekor anchoring is reserved (not implemented at v0.3.0) and is
  gated behind the DNSSEC + CAA pre-condition (DR-004 § 6.1); a future
  Rekor-push path must verify DNSSEC-enabled + single-CA CAA at runtime and
  refuse with a clear error otherwise.

## (e) Version reconciliation

`action.yml` (uses: pins, reserved-input version notes), `version.txt`,
`package.json` `version`, and `README.md` (status banner, `uses:` examples,
capability notes) must all cite the **same current release**. Flag a PR that
bumps one surface and leaves another stale, or that leaves an `action.yml`
input note / README claim referencing an old version string. The decision
package name must likewise read identically across `src/`, `package.json`,
`action.yml`, and `README.md` — it is **`@intentsolutions/rollout-gate`**;
`@j-rig/rollout-gate` does **not** exist as a published package (the `@j-rig/*`
workspace packages are private). The public `uses:` interface is additive-only
across versions (Evidence Bundle SPEC R18) — input/output removals or renames
are breaking and should be challenged.

## (f) What a high-quality review catches here

1. **Decision logic creeping into the shell** — a verdict algorithm, policy
   parser, threshold/coverage/pass-rate math, or predicate evaluation written
   in `src/` instead of delegated to `@intentsolutions/rollout-gate`.
2. **A default-pass path** — any branch (especially an error/catch path, an
   empty-bundle path, or a not-implemented stub) that resolves to `allow` /
   exit-0 instead of `block`.
3. **A hardcoded predicate URI or a `labs.*` host** — a local URI string
   literal instead of the kernel `GATE_RESULT_V1_URI` constant, or any
   attestation/OTel surface placed under `labs.intentsolutions.io`.
4. **Version-reference drift** — one of `action.yml` / `version.txt` /
   `package.json` / `README.md` bumped without the others, or a wrong package
   name for the decision logic.
5. **Credentials not redacted** — any error message, PR-comment, or
   step-summary string that could leak an OIDC subject, Fulcio cert content,
   or a signing-key path; or a test fixture carrying a real partner-engagement
   gate ID or a partner name (fixtures use synthetic IDs only —
   `synth-gate-1`, `synth-gate-2`, …).

Also keep an eye on the committed `dist/index.js`: it is a built artifact and
any `src/` change must ship a matching rebuild in the same commit (CI fails a
stale dist). Adding docs under `.greptile/` does not touch `dist/`.

## Review priorities — what to weight, what to skip

Greptile is **advisory** here. The deterministic merge gate is this repo's own
required CI (typecheck, lint, tests, coverage/mutation where applicable, the
audit-harness self-check, and CodeQL). Greptile's job is the semantic layer those
gates structurally cannot see — weight findings accordingly.

**Prioritize** (worth a comment): correctness and logic errors; security and
supply-chain / credential exposure; data-integrity and signed-evidence invariants;
concurrency and ordering hazards; input validation; auth / authorization
boundaries; secret handling; and regressions against the scoped invariants in
`config.json`.

**Deprioritize** (do not spend a comment here): style and naming; formatting;
churn in generated or build artifacts; and anything the L1 linters or CodeQL
already report. Never restate a deterministic gate — state the problem, the
`file:line`, and the concrete fix.
