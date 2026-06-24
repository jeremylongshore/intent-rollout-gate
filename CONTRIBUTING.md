# Contributing to intent-rollout-gate

Thank you for your interest. This repo is the **fourth domino** in the Intent Eval Platform convergence — the consumer of the [Evidence Bundle](https://github.com/jeremylongshore/intent-eval-lab/tree/main/specs/evidence-bundle) that decides ship / no-ship at the end of CI.

## Project status — read this first

This repo is currently at **v0.3.0** — the M5 TypeScript implementation shipped at v0.1.0, the consumption contract was frozen (with production-Rekor signing of the committed `dist/`) at v0.2.0, and the release/provenance pipeline was hardened at v0.3.0. The action is a real Node-runtime action that consumes an Evidence Bundle plus a rollout policy and decides **allow / block** (fail closed). If you want to contribute, start by reading:

| Source | Where |
| --- | --- |
| Architecture design doc | [`000-docs/001-DR-DESIGN-rollout-gate-architecture-2026-05-12.md`](./000-docs/001-DR-DESIGN-rollout-gate-architecture-2026-05-12.md) |
| Evidence Bundle SPEC (what we consume) | [`intent-eval-lab/specs/evidence-bundle/v0.1.0-draft/SPEC.md`](https://github.com/jeremylongshore/intent-eval-lab/blob/main/specs/evidence-bundle/v0.1.0-draft/SPEC.md) |
| Build journey plan (M4 / M5 context) | Local-only at `~/.claude/plans/se-the-council-bubbly-frog.md` (maintainer-side). Public mirror in the convergence umbrella issue [`intent-eval-lab#4`](https://github.com/jeremylongshore/intent-eval-lab/issues/4). |
| System brief (§ 8 "The Rollout Gate", § 9 "How It All Works Together") | [`intent-eval-lab/000-docs/007-DR-BRIEF-intent-eval-platform-system-brief-2026-05-11.html`](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/007-DR-BRIEF-intent-eval-platform-system-brief-2026-05-11.html) |

The runtime language is locked to **TypeScript on Node 20+** by [DR-002](./000-docs/004-AT-DECR-runtime-language-typescript-2026-06-10.md); please don't open PRs in a different runtime. Per the thin-shell rule (Blueprint A), decision logic lives upstream in [`@intentsolutions/rollout-gate`](https://www.npmjs.com/package/@intentsolutions/rollout-gate) — change behavior there and bump the dependency here, never re-implement gate semantics in this repo.

## Reporting Bugs

1. Search [existing issues](https://github.com/jeremylongshore/intent-rollout-gate/issues) first.
2. Open an issue with: action version (or commit SHA), the `bundle-path` content type (directory / JSONL / JSON array), the consuming repo's policy file, the actual vs. expected decision.

## Suggesting Enhancements

For new inputs / outputs / decision-algorithm extensions, explain:

1. **What policy expression** the change enables that the current `tests/TESTING.md` consumption interface doesn't cover.
2. **Whether it requires a predicate URI bump** — additions to optional fields and new enum values do NOT (per Evidence Bundle SPEC R18); breaking changes do (R17). This action consumes the URI but should never push the spec to bump.
3. **Whether it needs sigstore / cosign capability that the current cosign-key + rekor-url inputs don't expose.**

## Pull Requests

1. Fork the repository.
2. Create a feature branch from `main`: `git checkout -b feat/your-feature`.
3. Make focused changes. Avoid scope creep — this action does one thing (consume bundle, decide).
4. Run the gate locally before pushing: `pnpm install --frozen-lockfile && pnpm run check` (typecheck + vitest), and `pnpm run build` if you touched `src/` (the committed `dist/` must stay in sync).
5. Open the PR with: motivation, what changed, testing performed, and a forward-pointer to the related Evidence Bundle SPEC clause if applicable.

## Coding Conventions

The runtime is locked to TypeScript on Node 20+ (DR-002); the conventions below are in force:

- `action.yml` follows the [GitHub Actions metadata syntax](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions). Do not break the `uses:` input/output compatibility once published.
- Doc files under `000-docs/` follow Doc Filing Standard v4.x: `NNN-CC-CODE-description.md`.
- Commits: keep messages descriptive; signed-off footer is auto-applied by maintainer tooling.

## Security

If you find a security issue, **do not** open a public GitHub issue. See [SECURITY.md](./SECURITY.md) — email `security@intentsolutions.io`. The Rollout Gate's signing surface is in the supply-chain trust path of every adopter.

## License

By contributing, you agree your contributions will be licensed under the [Apache License 2.0](./LICENSE).
