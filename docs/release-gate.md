# Reference release gate

`.github/workflows/release-gate.yml` is a reusable workflow that gates a tag
release on Evidence Bundle rows. A consumer repository calls it from a workflow
that runs on `v*` tags. The workflow runs that repository's gates, assembles
their rows into one Evidence Bundle with `audit-harness emit-evidence
--append-to`, and runs this action with a release policy. A block decision fails
the job. Copy [`examples/release.yml`](examples/release.yml) to start.

## What it runs

1. Checks out the calling repository and sets up Node.js.
2. Downloads the pinned `@intentsolutions/audit-harness` tarball from npm, which
   supplies `emit-evidence --append-to`, and refuses it unless its sha512 equals
   `audit-harness-integrity`. Nothing from the package runs before that check
   passes (see [Supply-chain verification](#supply-chain-verification)).
3. Runs `setup-command` once, if you set it (for example `npm ci`).
4. Runs each line of `gate-commands`. Each command must print one gate-result
   JSON envelope on stdout. The gate's exit code is logged, but only the
   verdict inside the row reaches the decision. A command that prints nothing
   fails the job, because a missing row must never read as a pass.
5. Appends each row to `bundle-path`. emit-evidence validates every row against
   the kernel `gate-result/v1` snapshot and SPEC R8/R9, refuses a duplicate row
   id, and writes atomically.
6. Runs `intent-rollout-gate` with `bundle-path` and `policy-path`.
7. Uploads the bundle and the policy as the `artifact-name` artifact, whether
   the decision was allow or block.

## Inputs

| Input | Required | Default | Purpose |
| --- | --- | --- | --- |
| `gate-commands` | yes | none | One command per line, each printing one gate-result envelope. Blank lines and `#` lines are skipped. |
| `policy-path` | yes | none | Release policy JSON in the calling repository (see the README's policy shape). |
| `setup-command` | no | `''` | Run once before the gates. |
| `node-version` | no | `22` | Node.js for the setup command and audit-harness. |
| `audit-harness-version` | no | `1.5.1` | Exact npm version of `@intentsolutions/audit-harness` (1.5.1 or later ships `--append-to`). Change it together with `audit-harness-integrity`. |
| `audit-harness-integrity` | no | 1.5.1's `sha512-…` | The npm `dist.integrity` of that version's tarball. The job fails if the downloaded tarball hashes to anything else. |
| `bundle-path` | no | `evidence/release-bundle.json` | Where the bundle is written. |
| `fail-on-block` | no | `true` | Boolean; `false` reports without failing. |
| `artifact-name` | no | `release-evidence` | Name of the uploaded evidence artifact. |

Outputs: `decision` (`allow` or `block`) and `reasons` (a JSON array that is
empty on allow). Gate later jobs on them:

```yaml
publish:
  needs: [release-gate]
  if: needs.release-gate.outputs.decision == 'allow'
```

## Secrets and permissions

No secrets are required, and the workflow reads none. It runs with
`contents: read` and checks out with `persist-credentials: false`. If a gate
needs a credential, provide it in the calling workflow's own job instead; a
reusable workflow sees only the secrets the caller passes in explicitly.

## Supply-chain verification

The emitter is fetched with `npm pack`, which only downloads the published
tarball: nothing is installed and no package script runs. The next step
computes the tarball's sha512 itself and compares it with
`audit-harness-integrity`, a value pinned in the workflow rather than read from
the registry, so a substituted or modified tarball fails the job even if the
registry metadata was changed to match it. Only then is the package unpacked,
its `package.json` checked to be the requested name and version, and its CLI
run. The harness has no runtime dependencies, so there is no dependency tree
to resolve.

A lockfile with `npm ci` was the alternative. It was not used because this is
a reusable workflow: it runs in the caller's checkout, where a lockfile from
this repository does not exist, and a lockfile cannot follow a caller's
`audit-harness-version` override.

To move to a newer audit-harness release, pass both values:

```bash
npm view @intentsolutions/audit-harness@<version> dist.integrity
```

```yaml
with:
  audit-harness-version: <version>
  audit-harness-integrity: sha512-<value printed above>
```

1.5.1 is also published with npm provenance; `npm audit signatures` in a
project that installs it checks that attestation.

## Pinning

Every action inside the workflow is pinned by full commit SHA. Pin your
`uses:` line the same way:

```bash
gh api repos/jeremylongshore/intent-rollout-gate/commits/main --jq .sha
```

## Adoption checklist

1. Add a release policy, for example `.github/rollout/release-policy.json`:

   ```json
   {
     "required_gates": ["audit-harness:ci:*"],
     "forbid_decisions": ["fail", "error"]
   }
   ```

2. Copy `docs/examples/release.yml` to `.github/workflows/release.yml`, then set
   the SHA, `setup-command`, and one `gate-commands` line per gate.
3. Push a tag such as `v0.0.0-rc.1` and confirm the run's summary shows the
   required-gate table and the evidence artifact.
4. Make downstream publish or deploy jobs depend on the gate (see Outputs).

## Self-test

`.github/workflows/release-gate-self-test.yml` calls this workflow on every
pull request with the synthetic fixtures in `tests/fixtures/release-gate/`.
It asserts both outcomes: two passing rows must produce `allow` with no
reasons, and a failing row must produce `block` with a reason that names it.
Its `integrity` job reads the fetch and verify step scripts out of
`release-gate.yml` and runs them against the genuine 1.5.1 tarball, which must
pass, and against a copy with one line appended to the CLI and repacked, which
must be refused with an integrity mismatch and must not be unpacked. A
malformed integrity value must also be refused.
