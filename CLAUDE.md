# CLAUDE.md—intent-rollout-gate

Guidance for Claude Code when working in `/home/jeremy/000-projects/intent-eval-platform/intent-rollout-gate/`.

## What this repo is

A GitHub Action that consumes an [Evidence Bundle](https://github.com/jeremylongshore/intent-eval-lab/tree/main/specs/evidence-bundle) and emits a ship / no-ship / advisory decision for the consuming repository's CI pipeline. **Fourth repo** in the Intent Eval Platform convergence.

| Sister repo | Role |
| --- | --- |
| [`intent-eval-lab`](https://github.com/jeremylongshore/intent-eval-lab) | Methodology + Evidence Bundle SPEC + Intentional Mapping taxonomy + OTel RFC |
| [`audit-harness`](https://github.com/jeremylongshore/audit-harness) | Static gates (escape-scan, harness-hash, CRAP, arch, bias, gherkin-lint)—emits Evidence Bundle rows |
| [`j-rig-binary-eval`](https://github.com/jeremylongshore/j-rig-binary-eval) | 7-layer behavioral judgment harness—emits Evidence Bundle rows |
| **`intent-rollout-gate`** *(this)* | **Consumes the Evidence Bundle, decides ship/no-ship** |

The convergence couples at the schema layer (the `gate-result/v1` predicate URI), not via package consolidation. Each repo has its own `.git`, its own license, its own release cycle.

## Where the source-of-truth design lives

- **System brief § 8 + § 9**—the design narrative for what this action does and how it sits in the journey: [`intent-eval-lab/000-docs/007-DR-BRIEF-intent-eval-platform-system-brief-2026-05-11.html`](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/007-DR-BRIEF-intent-eval-platform-system-brief-2026-05-11.html).
- **Evidence Bundle SPEC**—what this action consumes: [`intent-eval-lab/specs/evidence-bundle/v0.1.0-draft/SPEC.md`](https://github.com/jeremylongshore/intent-eval-lab/blob/main/specs/evidence-bundle/v0.1.0-draft/SPEC.md). R14–R16 are the policy-consumption contract this action implements.
- **Architecture design doc (in-repo)**—`000-docs/001-DR-DESIGN-rollout-gate-architecture-2026-05-12.md`. Names the deferred decisions, especially the runtime language choice.
- **Build journey master plan**—local-only at `~/.claude/plans/se-the-council-bubbly-frog.md` (maintainer-side). Public mirror via the convergence umbrella issue [`intent-eval-lab#4`](https://github.com/jeremylongshore/intent-eval-lab/issues/4).
- **ISEDC Decision Records**—Phase B council records in [`intent-eval-lab/000-docs/004-AT-DECR-…`](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/004-AT-DECR-isedc-council-record-2026-05-10.md), 005, and 006. The CISO binding constraints in DR-004 § 6 apply directly to this repo (predicate URI immutability, DNSSEC pre-condition for Rekor push).

## Project status—milestone gates

| Milestone | Status |
| --- | --- |
| **M4**—substantive bootstrap | DONE. Repo exists; design doc landed. |
| **M5**—implementation | **DONE (v0.1.0).** Runtime locked to TypeScript by DR-002 (`000-docs/004-AT-DECR-runtime-language-typescript-2026-06-10.md`); decision logic delegated to the published `@intentsolutions/rollout-gate@2.0.0`. |
| **M6**—first downstream adopter | NOT STARTED. `audit-harness` self-adopts before any partner repo wires this in. |
| **Decision-row signing** | NOT STARTED. `rollout-decision/v1` emit + sign + Rekor anchor behind the DNSSEC + CAA pre-condition (DR-004 § 6.1). |

**THIN SHELL rule (Blueprint A, DR-018 § 9.2):** this repo must never contain decision logic. `decide()` / `parsePolicy()` and all gate semantics live in the published `@intentsolutions/rollout-gate` package (j-rig monorepo). If decision behavior must change, change it upstream and bump the dependency here. PRs re-implementing gate semantics locally are out of order.

## Build & test commands

```bash
pnpm install --frozen-lockfile
pnpm run check        # typecheck + vitest unit tests
pnpm run build        # esbuild bundle src/main.ts → dist/index.js (node20 target)
pnpm run dist:check   # rebuild + git diff --exit-code dist/
```

`dist/index.js` is **committed** (GitHub Actions convention). Any change to `src/` or the dependency lockfile requires re-running `pnpm run build` and committing the updated `dist/` in the same commit — the CI dist-sync job fails stale bundles. `action.yml` declares `runs.using: node24`; the esbuild transpile target stays node20-compatible per the DR-002 "Node 20+" lock.

## CISO + compliance bindings (carried from ISEDC DR-004)

These are **non-negotiable constraints**, not stylistic preferences. Every implementation PR must respect them.

1. **Predicate URI immutability.** This action emits a *new* in-toto row at `https://evals.intentsolutions.io/rollout-decision/v1` to attest the rollout decision itself. The exact URI string is permanent once any row referencing it is signed and pushed to Rekor. Never reformat, never namespace-rename, never shorten. Breaking changes mint `/v2`.
2. **DNSSEC pre-condition for Rekor push.** Per ISEDC CISO binding (DR-004 § 6.1), no signed attestation referencing a `evals.intentsolutions.io` URI may be pushed to Rekor until the namespace is DNSSEC-enabled and CAA records are pinned to a single CA. This action **must** check the DNSSEC + CAA state at runtime before pushing to Rekor and refuse with a clear error if the pre-condition isn't met. The check belongs in the M5 implementation; the architecture doc names this as a hard requirement.
3. **`labs.intentsolutions.io` is reserved-don't-touch.** Predicate URIs and OTel attribute namespaces live at `evals.intentsolutions.io` only. `labs.` may host blog content, methodology pages, RFC published-version pages—but NEVER an in-toto predicate URI, OTel attribute namespace, or attestation predicate identifier. Once the first signed attestation lands in Rekor referencing an `evals.` URI, that namespace is permanent; `labs.` must stay clear of attestation surface to preserve DNS / brand-surface isolation.
4. **No partner-name leakage.** Per the partner-consent discipline in `intent-eval-lab/CLAUDE.md` § "Brand-name policy", do not name partner engagements (Kobiton, Polygon, Nixtla, Lit Protocol, Mudit Gupta) in any specs, READMEs, GitHub issues, or test fixtures absent written consent. `grep -ri "Kobiton\|Polygon\|Nixtla\|Lit Protocol\|Mudit Gupta" .` must return zero hits at all times.
5. **Credential redaction in error messages.** When the action surfaces a verification failure, the error must redact any path / OIDC subject / Fulcio cert content that could leak into a public PR-comment surface. Tests in M5 must include a credential-redaction test (carried from ISEDC PASS/FAIL gate for j-rig provider adapters; the same posture applies here).

## Testing SOP

Per the global Intent Solutions Testing SOP, this repo will install [`@intentsolutions/audit-harness`](https://github.com/jeremylongshore/audit-harness) as a dev dependency once a runtime is chosen in M5. The harness will be invoked from `.github/workflows/ci.yml` and from any `.husky/pre-commit` hook. Enforcement travels with the code—never reference `~/.claude/` paths.

## Beads workflow

This repo owns its own `.beads/` directory (initialized at M4 with prefix `IRG`). Convergence-level meta-beads continue to live in the home `~/.beads/` (prefix `OPS`).

Workflow once initialized:

```bash
bd update <id> --status in_progress    # claim work
# … do the work …
bd close <id> --reason "evidence"      # close with substantive evidence (commit SHA, test output, decision-doc link)
bd sync                                # push to remote
```

## Conventions

- **Doc filing**: `000-docs/NNN-CC-CODE-description.md` per Doc Filing Standard v4.x. Sibling repos use this; we conform.
- **Branches**: `feat/<short-description>`, `fix/<short-description>`, `docs/<short-description>`. M5 implementation branches: `feat/m5-<runtime>-<scope>`.
- **Commits**: descriptive subject; body explains *why*; signed-off footer is auto-applied via the maintainer's `attribution.commit` setting.
- **PRs**: include link to the related Evidence Bundle SPEC clause and / or the architecture doc section being implemented. PR body explains *what* changed and *what tests prove it*.
- **No Anthropic / Claude / Co-Authored-By lines anywhere.** Per global CLAUDE.md.

## Operational rules

1. **Never bump the predicate URI casually.** Read Evidence Bundle SPEC R17 + R18 before any change to a URI string.
2. **Never push a signed attestation to Rekor in a test environment.** Rekor entries are permanent; test signing must use a non-public Rekor instance or `rekor-url=""` (signing-only mode).
3. **Test fixtures use synthetic gate IDs only.** No real `audit-harness` or `j-rig-binary-eval` partner-engagement gate IDs in fixtures. Use `synth-gate-1`, `synth-gate-2`, etc.
4. **The action FAILS CLOSED as of v0.1.0**—a `block` decision fails the job unless `fail-on-block: 'false'` (or legacy `dry-run: 'true'`). The v0.0.x always-exit-0 stub contract is retired; do not reintroduce silent passes.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking—do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge—do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:

   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```

5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
