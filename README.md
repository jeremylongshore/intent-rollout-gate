# intent-rollout-gate

> **Status: v0.0.0 bootstrap.** This repo is the M4 substantive bootstrap of the Intent Eval Platform convergence. **Implementation lands in M5.** The action declared here is intentionally a no-op stub that exits cleanly so adopters can wire it into CI early without blocking deployments.

A GitHub Action that consumes [Evidence Bundles](https://github.com/jeremylongshore/intent-eval-lab/tree/main/specs/evidence-bundle) (collections of signed [in-toto Statement v1](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md) rows) and decides **ship** or **no-ship** for a CI pipeline based on a policy declared in the consuming repository's `tests/TESTING.md` file.

The Rollout Gate is the **fourth repo** in the Intent Eval Platform convergence, alongside:

| Sister repo | Role | License |
|---|---|---|
| [`intent-eval-lab`](https://github.com/jeremylongshore/intent-eval-lab) | Methodology, Evidence Bundle spec, Intentional Mapping taxonomy, OTel RFC | Apache 2.0 |
| [`audit-harness`](https://github.com/jeremylongshore/audit-harness) | Deterministic static gates — emits Evidence Bundle `gate-result/v1` rows | MIT |
| [`j-rig-binary-eval`](https://github.com/jeremylongshore/j-rig-binary-eval) | 7-layer behavioral judgment harness — emits and consumes Evidence Bundle rows | MIT |
| **`intent-rollout-gate`** *(this repo)* | **Consumer of the bundle — decides ship/no-ship at end of CI** | **MIT** |

## What it does (target behavior, lands M5)

1. **Reads the Evidence Bundle** produced by `audit-harness` and `j-rig-binary-eval` during the CI pipeline (any container form per Evidence Bundle SPEC § 4 — directory of files, JSONL, or JSON array).
2. **Verifies each row** against the `https://evals.intentsolutions.io/gate-result/v1` predicate URI: DSSE signature check, JSON Schema validation of the predicate body, subject-digest match, optional Rekor anchor confirmation.
3. **Reads the policy** declared in the consuming repo's `tests/TESTING.md` (the same file `audit-harness` uses for thresholds — *enforcement travels with the code*).
4. **Evaluates** the verified rows against the policy: required-gate pass + applicable-only coverage check + advisory-elevation rules.
5. **Emits a decision**: PR comment, GitHub status check, and a *new* signed in-toto row at predicate URI `https://evals.intentsolutions.io/rollout-decision/v1` (the decision is itself an attestation that can be archived to Rekor).

The Rollout Gate does NOT require complete coverage. The composable partial attestation principle (Evidence Bundle SPEC R2) applies: a bundle that covers three of six MM categories and two of five surfaces can still pass — if the declared policy only requires those three categories and two surfaces.

## Quickstart (forward-pointer to M5)

Once M5 lands, wiring this action into a repo's CI will look like:

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

  behavioral-gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: pnpm exec jrig run --emit-evidence --out evidence/

  rollout-decision:
    needs: [static-gates, behavioral-gates]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: jeremylongshore/intent-rollout-gate@v1
        with:
          bundle-path: evidence/
          policy-file: tests/TESTING.md
          predicate-uri: https://evals.intentsolutions.io/gate-result/v1
          rekor-url: https://rekor.sigstore.dev
          dry-run: false
```

Adopters wiring this **today** (against v0.0.0) will get a `decision: not-implemented` output and a clean `exit 0` — the action will not block their pipeline. Substantive enforcement begins at v0.1.0.

## Inputs (declared at v0.0.0; behavior at v0.1.0)

| Input | Required | Default | Purpose |
|---|---|---|---|
| `bundle-path` | yes | — | Filesystem path to the Evidence Bundle (directory, `.jsonl` file, or `.json` file with `bundle.rows`). |
| `policy-file` | no | `tests/TESTING.md` | Path to the policy file the gate evaluates against. |
| `predicate-uri` | no | `https://evals.intentsolutions.io/gate-result/v1` | Predicate URI to filter on when reading rows. |
| `rekor-url` | no | `https://rekor.sigstore.dev` | Rekor instance for transparency-log anchoring of the decision row. Empty string disables anchoring. |
| `cosign-key` | no | — | Path to a cosign keypair for signing the decision row. If unset, falls back to keyless OIDC (Sigstore Fulcio). |
| `dry-run` | no | `false` | If `true`, evaluate and report but exit 0 regardless of the verdict. |

## Outputs

| Output | Purpose |
|---|---|
| `decision` | One of `ship`, `no-ship`, `advisory`, `not-implemented`. |
| `summary` | Markdown summary of the decision (gate pass rates, coverage table, failing rows, advisories). |
| `signed-decision-row-path` | Filesystem path to the signed in-toto row attesting to the rollout decision itself. |

## Project status

| Milestone | Status |
|---|---|
| **M4 — Substantive bootstrap** | **DONE** — this commit. Repo exists, design doc landed, action declaration stub exits cleanly. |
| **M5 — Implementation** | Pending. First PR will pick a runtime (TS / Go / Python — see `000-docs/001-DR-DESIGN-rollout-gate-architecture-2026-05-12.md` § "Language choice"), wire the bundle parser, the policy parser, and the decision algorithm. |
| **M6 — First adopter** | Pending. `audit-harness` self-adopts as the first downstream — eats its own dog food before any partner repo wires this in. |

## License

[MIT](./LICENSE) — see `LICENSE` at repo root.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Note that this repo's implementation is **M5**, not M4. M4 is the substantive bootstrap you are reading.

## Security

See [SECURITY.md](./SECURITY.md). The Rollout Gate emits signed in-toto attestations against an immutable predicate URI; security-relevant constraints (DNSSEC pre-condition for Rekor push, predicate URI immutability) bind here.
