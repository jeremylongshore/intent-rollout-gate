# intent-rollout-gate

Part of the **[Intent Eval Platform](https://github.com/intent-solutions-io/intent-eval-platform)**—the umbrella mapping the six repos that converge via a shared Evidence Bundle schema.

> **Status: v0.3.0 — frozen consumption contract & hardened release pipeline.** The action is a real Node runtime
> that consumes an Evidence Bundle plus a rollout policy and decides
> **allow / block**, fail closed. Per Blueprint A this repo is a **thin
> shell**: every line of decision logic lives in the published
> [`@intentsolutions/rollout-gate`](https://www.npmjs.com/package/@intentsolutions/rollout-gate)
> package (Apache-2.0, sigstore provenance); the action only wires inputs,
> files, outputs, and exit codes around it.

A GitHub Action that consumes [Evidence Bundles](https://github.com/jeremylongshore/intent-eval-lab/tree/main/specs/evidence-bundle) (collections of signed [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md) rows under predicateType `https://evals.intentsolutions.io/gate-result/v1`) and decides **allow** or **block** for a CI pipeline based on a declared rollout policy.

The Rollout Gate is the **fourth repo** in the Intent Eval Platform convergence, alongside:

| Sister repo | Role | License |
| --- | --- | --- |
| [`intent-eval-lab`](https://github.com/jeremylongshore/intent-eval-lab) | Methodology, Evidence Bundle spec, Intentional Mapping taxonomy, OTel RFC | Apache 2.0 |
| [`audit-harness`](https://github.com/jeremylongshore/intent-audit-harness) | Deterministic static gates—emits Evidence Bundle `gate-result/v1` rows | Apache 2.0 |
| [`j-rig-binary-eval`](https://github.com/jeremylongshore/j-rig-skill-binary-eval) | 7-layer behavioral judgment harness—emits and consumes Evidence Bundle rows; home of the `@intentsolutions/rollout-gate` decision library | Apache 2.0 |
| **`intent-rollout-gate`** *(this repo)* | **Thin GitHub Action shell—delegates the ship/no-ship decision to `@intentsolutions/rollout-gate`** | **Apache 2.0** |

## What it does (v0.3.0)

1. **Reads the Evidence Bundle** at `bundle-path` — both wire forms: the v2
   plain array of in-toto Statements (kernel `EvidenceBundlePayload`) and the
   v1 legacy container `{"bundle_format":"json-array","rows":[...]}`.
2. **Resolves the rollout policy** from exactly one of `policy-path` (a JSON
   file) or `policy-json` (an inline JSON string). Both or neither → block.
3. **Delegates the decision** to `decide(bundle, policy)` from
   [`@intentsolutions/rollout-gate@2.0.0`](https://www.npmjs.com/package/@intentsolutions/rollout-gate).
   Row validation reuses the kernel `@intentsolutions/core` gate-result/v1
   statement schema — no schema is re-declared anywhere in this repo.
4. **Reports**: `decision` + `reasons` outputs, a markdown step summary with
   the required-gate table and every blocking row, and a failing exit on
   `block` (unless `fail-on-block: 'false'`).

**Fail closed, everywhere.** Missing/unreadable/invalid-JSON bundle file,
ambiguous policy inputs, garbage policy, malformed bundle, empty bundle,
schema-invalid rows, missing or non-passing required gates, forbidden
decisions, unexpected wiring errors — all produce `decision=block` with every
contributing reason listed. There is no silent pass.

Composable partial attestation (Evidence Bundle SPEC R2) still applies: a
bundle that covers three of six MM categories can pass — if the declared
policy only requires those three.

## Quickstart

```yaml
# .github/workflows/release.yml
name: release
on:
  push:
    branches: [main]

jobs:
  static-gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: pnpm exec audit-harness verify
      - run: pnpm exec audit-harness emit-evidence --out evidence/

  rollout-decision:
    needs: [static-gates]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: jeremylongshore/intent-rollout-gate@v0.3.0
        id: gate
        with:
          bundle-path: evidence/bundle.json
          policy-json: |
            {
              "required_gates": ["audit-harness:ci:*"],
              "forbid_decisions": ["fail", "error"]
            }
      - run: echo "decision=${{ steps.gate.outputs.decision }}"
```

Or keep the policy in a committed file (enforcement travels with the code):

```yaml
      - uses: jeremylongshore/intent-rollout-gate@v0.3.0
        with:
          bundle-path: evidence/bundle.json
          policy-path: tests/rollout-policy.json
          fail-on-block: "true"   # default; 'false' = report-only mode
```

### Policy document shape

```json
{
  "required_gates": ["audit-harness:ci:*"],
  "forbid_decisions": ["fail", "error"],
  "advisory_blocks": false,
  "allow_unknown_gates": true
}
```

`required_gates` patterns match `gate_id` values; `*` is the only wildcard.
Defaults (everything except `required_gates` is optional) are the fail-closed
ones documented by
[`@intentsolutions/rollout-gate`](https://www.npmjs.com/package/@intentsolutions/rollout-gate).
Parsing a policy out of `tests/TESTING.md` directly stays deferred per
[DR-002 § 5](./000-docs/004-AT-DECR-runtime-language-typescript-2026-06-10.md).

## Inputs

| Input | Required | Default | Purpose |
| --- | --- | --- | --- |
| `bundle-path` | yes | — | Path to the Evidence Bundle JSON file (v2 plain array or v1 container form). Missing/unreadable/invalid JSON → block. |
| `policy-path` | one of | `''` | Path to the rollout policy JSON document. Exactly one of `policy-path` / `policy-json` is required. |
| `policy-json` | one of | `''` | Inline rollout policy JSON string. Exactly one of `policy-path` / `policy-json` is required. |
| `fail-on-block` | no | `'true'` | `'true'`: a block decision fails the job. `'false'`: report-only. Anything other than an explicit `'false'` fails on block (fail closed). |
| `policy-file` | no | `''` | **Deprecated** alias for `policy-path` (v0.0.x name). The old `tests/TESTING.md` default is gone. |
| `predicate-uri` | no | `gate-result/v1` URI | **Reserved.** Only the stable v1 URI is supported; any other value blocks. |
| `rekor-url` | no | `https://rekor.sigstore.dev` | **Reserved.** Decision-row Rekor anchoring is not implemented at v0.3.0 (DNSSEC + CAA pre-condition gates it); ignored. |
| `cosign-key` | no | `''` | **Reserved.** Decision-row signing is not implemented at v0.3.0; setting it warns and performs no signing. |
| `dry-run` | no | `'false'` | **Deprecated** alias for `fail-on-block: 'false'` (v0.0.x name). |

## Outputs

| Output | Purpose |
| --- | --- |
| `decision` | `allow` or `block`, verbatim from `@intentsolutions/rollout-gate` (`allow` ≙ ship, `block` ≙ no-ship in the pre-implementation vocabulary; `not-implemented` is retired). |
| `reasons` | JSON array string of every blocking reason — empty array exactly when `decision` is `allow`. |
| `summary` | Markdown decision summary (required-gate table + blocking rows + reasons). Also written to the job step summary. |
| `signed-decision-row-path` | Reserved — always empty at v0.3.0; populated once decision-row signing lands (DR-002 § 6.3). |

## Development

```bash
pnpm install --frozen-lockfile
pnpm run check        # typecheck + vitest unit tests
pnpm run build        # esbuild bundle src/main.ts → dist/index.js (node20 target)
pnpm run dist:check   # rebuild + git diff --exit-code dist/
```

`dist/index.js` is **committed** (GitHub Actions convention) and CI fails any
PR whose dist is out of sync with `src/`. The runtime declared in `action.yml`
is `node24`; the bundle is transpiled to a node20-compatible target per the
DR-002 "Node 20+" lock.

**Thin-shell rule:** this repo must never re-implement gate semantics, policy
interpretation, or predicate evaluation. If decision behavior needs to change,
change it in `@intentsolutions/rollout-gate` (in the
[`j-rig-skill-binary-eval`](https://github.com/jeremylongshore/j-rig-skill-binary-eval)
monorepo) and bump the dependency here.

## Project status

| Milestone | Status |
| --- | --- |
| **M4—Substantive bootstrap** | DONE. Repo, design doc, no-op action stub. |
| **M5—Implementation** | **DONE (v0.1.0).** Runtime locked to TypeScript by [DR-002](./000-docs/004-AT-DECR-runtime-language-typescript-2026-06-10.md); decision logic delegated to `@intentsolutions/rollout-gate@2.0.0`. Consumption contract frozen + production-Rekor signing of the committed `dist/` enabled at v0.2.0; release/provenance pipeline hardened at v0.3.0. |
| **M6—First adopter** | Pending. `audit-harness` self-adopts as the first downstream—eats its own dog food before any partner repo wires this in. |
| **Decision-row signing** | Pending. `rollout-decision/v1` signing + Rekor anchoring behind the DNSSEC + CAA pre-condition (DR-004 § 6.1, DR-002 § 6.3). |

## License

[Apache 2.0](./LICENSE)—see `LICENSE` and [NOTICE](./NOTICE) at repo root.

Aligns with the rest of the Intent Eval Platform ecosystem (`intent-eval-lab`, `intent-eval-core`, `audit-harness`, `j-rig-binary-eval`)—every repo ships under a single OSI-approved license with explicit patent-grant language.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Decision-logic changes belong upstream in `@intentsolutions/rollout-gate`, not here (thin-shell rule above).

## Security

See [SECURITY.md](./SECURITY.md). The Rollout Gate will emit signed in-toto attestations against an immutable predicate URI; security-relevant constraints (DNSSEC pre-condition for Rekor push, predicate URI immutability) bind here.
