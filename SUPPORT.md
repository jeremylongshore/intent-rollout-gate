# Support

## Getting Help

- **Documentation**: Start with the [README](README.md). The action's inputs/outputs are declared in [`action.yml`](action.yml); the architecture and decision rationale live in [`000-docs/`](000-docs/).
- **What this action does**: It is a thin GitHub Action shell. It consumes an Evidence Bundle plus a policy, delegates the ship / no-ship decision to the published [`@intentsolutions/rollout-gate`](https://www.npmjs.com/package/@intentsolutions/rollout-gate) package, and emits the decision. Zero gate semantics live in this repo (Blueprint A).
- **Bug Reports**: [Open an issue](https://github.com/jeremylongshore/intent-rollout-gate/issues/new?template=bug_report.md)
- **Feature Requests**: [Open an issue](https://github.com/jeremylongshore/intent-rollout-gate/issues/new?template=feature_request.md)
- **Discussions**: [GitHub Discussions](https://github.com/jeremylongshore/intent-rollout-gate/discussions) (if enabled — otherwise use Issues)
- **Security Issues**: See [SECURITY.md](SECURITY.md) — do NOT open public issues

## Response Times

| Channel | Response Time |
| --- | --- |
| Security reports | 24 hours |
| Bug reports | 3 business days |
| Feature requests | 1 week |
| General questions | 1 week |

This is a sole-maintainer OSS project — response times are best-effort and may be slower during deep-focus blocks on the Intent Solutions roadmap.

## Before Opening an Issue

1. Search [existing issues](https://github.com/jeremylongshore/intent-rollout-gate/issues) first — many common questions have been answered.
2. Check the [README](README.md) usage section for workflow-wiring examples.
3. Include the action version you pinned (tag or SHA), the runner OS, and a minimal reproduction (the policy you passed + a redacted bundle).

## Contact

- **Email**: <jeremy@intentsolutions.io>
- **GitHub**: [@jeremylongshore](https://github.com/jeremylongshore)
