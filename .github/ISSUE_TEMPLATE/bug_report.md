---
name: Bug report
about: Report a defect in the Rollout Gate action
title: "[bug] "
labels: bug
assignees: jeremylongshore
---

## Summary

A clear, one-sentence description of the bug.

## Action version

- Pinned ref (tag or SHA):
- Runner OS:

## Expected behavior

What you expected the gate to decide / output.

## Actual behavior

What actually happened (`allow` / `block`, exit code, error message).

## Reproduction

1. Policy passed (`policy-path` / `policy-json`) — redact any sensitive paths:
2. Evidence Bundle shape (number of rows, any failing rows) — **redact signatures/credentials**:
3. Workflow step wiring:

```yaml
- uses: jeremylongshore/intent-rollout-gate@<ref>
  with:
    # ...
```

## Logs

Paste the relevant step log. **Redact any tokens, signing keys, or OIDC subjects** — credential redaction is a CISO binding; please do not paste secrets.

## Additional context

Anything else relevant (downstream impact, frequency, suspected cause).
