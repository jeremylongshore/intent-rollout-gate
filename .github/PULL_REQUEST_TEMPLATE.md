<!-- Thank you for contributing to intent-rollout-gate. -->

## Summary

What does this PR change, and why?

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change (behavior or contract change — note the SemVer impact)
- [ ] Docs / governance only
- [ ] CI / tooling

## Checklist

- [ ] `pnpm run check` passes (lint + typecheck + test) locally
- [ ] `dist/` is rebuilt and committed in sync with `src/` (CI enforces `git diff --exit-code dist/`)
- [ ] No partner names appear in any committed file (the partner-name guard is case-insensitive)
- [ ] No credentials, signing keys, or OIDC subjects are committed or logged
- [ ] CHANGELOG.md `[Unreleased]` updated if this is a user-visible change
- [ ] New docs follow the Doc Filing Standard (`000-docs/NNN-CC-ABCD-<title>-<date>.md`)

## Architectural bindings touched

If this PR touches the consumed/emitted predicate shape, the decision logic, or a CISO
binding (predicate-URI immutability, DNSSEC + CAA pre-condition, credential redaction),
cite the governing Decision Record. Decision-logic changes belong upstream in
`@intentsolutions/rollout-gate`, not in this shell.

## Related issues

Closes #
