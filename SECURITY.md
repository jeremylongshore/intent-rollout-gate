# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| v0.3.x (current) | Yes — frozen consumption contract; release/provenance pipeline hardened |
| v0.2.x | Yes — frozen consumption contract; production-Rekor signing of the committed `dist/` enabled |
| v0.1.x (M5 implementation) | Best-effort only; adopters should upgrade to the current line |
| v0.0.x (M4 bootstrap stub) | No — superseded; the action was a no-op stub |

## Reporting a Vulnerability

**Please do NOT open public issues for security concerns.**

Email **<security@intentsolutions.io>** with:

- Type of issue (e.g., signature-verification bypass, predicate-URI confusion, decision-row forgery, credential leakage in PR-comment surface, Rekor-push of a row that shouldn't have been pushed, code execution via crafted bundle)
- Full paths of related source files
- Location of the affected code (tag / branch / commit or direct URL)
- Any special configuration required to reproduce
- Step-by-step instructions to reproduce
- Proof-of-concept or exploit code (if possible)
- Impact assessment — particularly important for the supply-chain dimension since this action sits at the *deployment-decision* moment of every adopter's CI pipeline

### Response Timeline

| Stage | Timeframe |
| --- | --- |
| Acknowledgment | 24 hours |
| Initial assessment | 48 hours |
| Status update | 5 business days |
| Resolution | Depends on severity |

### Severity Levels

| Severity | CVSS | Examples | Target Resolution |
| --- | --- | --- | --- |
| Critical | 9.0–10.0 | Decision-row signature forgery; arbitrary code execution via crafted bundle; Rekor-push bypass of the DNSSEC pre-condition | 24 hours |
| High | 7.0–8.9 | Predicate-URI confusion attack (action accepts rows with wrong URI as valid); credential exposure in PR-comment markdown | 7 days |
| Medium | 4.0–6.9 | Denial of service via crafted bundle; partial-verification bypass | 30 days |
| Low | 0.1–3.9 | Information disclosure in error messages; minor parser issues | 90 days |

## Threat Model

The Rollout Gate sits in CI as the **deployment-decision tier**. Its security posture must consider:

- **Adversary inside the consumer repo** — AI agent or contributor attempting to lower thresholds in `tests/TESTING.md`, edit the bundle directory before the gate reads it, or pass a forged decision row downstream. **Mitigation:** the gate verifies every bundle row's signature before consuming it (Evidence Bundle SPEC R13); the policy file is hashed into the decision row so any post-decision threshold change is detectable.
- **Adversary upstream of the gate** — a tool that emits Evidence Bundle rows with a forged predicate URI (e.g., a row claiming `predicateType: https://evals.intentsolutions.io/gate-result/v1` but with a body that doesn't match the schema). **Mitigation:** Stage 1 verification rejects rows with invalid signatures, missing required predicate fields, or subject-digest mismatches.
- **Adversary in the supply chain of the action itself** — a compromised release tag or a compromised dependency in the action's runtime. **Mitigation:** production-Rekor cosign signing of the committed `dist/index.js` artifact is enabled as of v0.2.0 (behind the iah-E06 DNSSEC/CAA pre-flight); adopters should pin the action by SHA, not by tag, for the highest assurance.
- **Adversary attempting Rekor pollution** — pushing forged decision rows to the public Rekor instance to confuse downstream verifiers. **Mitigation:** the DNSSEC + CAA pre-condition (CISO binding from ISEDC DR-004 § 6.1) prevents the action from pushing to Rekor under any `evals.intentsolutions.io` URI until the namespace is DNSSEC-protected. Pre-condition is checked at runtime before each push; failure is loud, not silent.

## Platform-wide security posture

The Rollout Gate inherits security constraints from the Intent Eval Platform:

- **Predicate URI immutability** ([`intent-eval-lab` CLAUDE.md](https://github.com/jeremylongshore/intent-eval-lab/blob/main/CLAUDE.md), Evidence Bundle SPEC R17). The strings `https://evals.intentsolutions.io/gate-result/v1` and `https://evals.intentsolutions.io/rollout-decision/v1` are permanent once any row referencing them lands in Rekor.
- **DNSSEC pre-condition for Rekor push** (ISEDC CISO binding, [`intent-eval-lab/000-docs/004-AT-DECR-isedc-council-record-2026-05-10.md`](https://github.com/jeremylongshore/intent-eval-lab/blob/main/000-docs/004-AT-DECR-isedc-council-record-2026-05-10.md) § 6.1). The action MUST verify DNSSEC + CAA pinning state at runtime before any Rekor push referencing an `evals.intentsolutions.io` URI.
- **`labs.intentsolutions.io` is reserved-don't-touch.** No predicate URI, OTel attribute namespace, or attestation predicate identifier under that subdomain. Brand / DNS isolation from the attestation surface.

## Disclosure Process

1. **Report** — You email the details to <security@intentsolutions.io>
2. **Triage** — We assess severity and impact
3. **Fix** — We develop and test a patch
4. **Notify** — We inform affected users via GitHub Security Advisory + a CHANGELOG entry tagged `SECURITY`
5. **Release** — We publish the fix
6. **Post-Mortem** — We document lessons learned in `000-docs/`

## Security Best Practices

When contributing to this project:

- Never hardcode credentials or secrets; never commit `.env` files (`.gitignore` covers this)
- Validate all input at system boundaries — the gate reads bundles + policy from paths the user supplies; symlink traversal + path-escape are real concerns
- Keep dependencies up to date (dependabot opens weekly PRs once a runtime is locked in M5)
- Use HTTPS for all external communication (cosign / Rekor / Fulcio)
- Follow the principle of least privilege — the action should request the narrowest GitHub token permissions that let it post a PR comment + status check
- Do not log sensitive information — credential redaction is a CISO binding (architecture doc § 5.4)
- Write tests for security-critical paths — signature verification, predicate-URI matching, credential redaction, DNSSEC pre-condition

## Recognition

We appreciate responsible disclosure. Reporters who follow this policy will receive:

- Credit in security advisories (unless anonymity is preferred)
- Mention in CONTRIBUTORS.md (once the file exists)
- Our sincere gratitude

## Contact

- **Security reports:** <security@intentsolutions.io>
- **General inquiries:** <jeremy@intentsolutions.io>
- **Response time:** 24 hours for initial acknowledgment
