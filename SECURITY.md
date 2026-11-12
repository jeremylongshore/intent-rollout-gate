# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| Unreleased enforcing source | Prepared — incoming signatures and proofs required; migration/rollout pending |
| v0.3.x (published) | Yes — frozen consumption contract; release/provenance pipeline hardened |
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

The published v0.3.x line accepts legacy unsigned input and does not perform incoming-row cryptographic verification. Its immutable pins are unchanged. The unreleased source adds the enforcing contract below; no production migration or release is implied by local tests.

- **Forged or modified incoming evidence:** the Action requires a bounded `sigstore-dsse-rows/v1` artifact and externally supplied `verification-policy-json`. Vetted Sigstore primitives authenticate every row before advisory extraction or policy delegation. Gate rows require the kernel schema, supported predicate URI, unambiguous gate subject and matching input digest. Exact issuer/SAN identity and enrolled key hints come from protected caller configuration, never the evidence itself. An attacker who can rewrite that configuration or the workflow can choose a different authority; branch and runner trust remain necessary.
- **Unsupported or misleading anchoring:** keyless rows and any row requiring or claiming anchoring need actual inclusion proofs and signed checkpoints. All supplied entries authenticate, including extra entries; duplicates, unknown logs and inconsistent proof metadata reject. `verification-status` describes authentication, while `verification-transparency` distinguishes all-inclusion from privately signed unanchored evidence. Neither output substitutes for the delegated rollout verdict or proves that an authorized signer reported truthful evaluation results.
- **Untrusted cache or retained runner state:** public roots bootstrap from pinned TUF seeds into a fresh owner-only temporary cache for each load, removed after success or failure. Ambient HOME/XDG caches are not reused. This assumes trusted OS temporary-directory ancestors and protects against other principals and stale state; it does not isolate hostile code sharing the process UID or root privileges.
- **Malformed advisory bodies:** supported refiner rows authenticate before their advisory schema is examined. A malformed authenticated advisory remains dropped without changing the gate verdict, preserving the established advisory contract. Valid refiner subjects bind the result snapshot hash; they do not use gate-result subject rules.
- **Output injection:** summary text is encoded for its Markdown/HTML display context, preserving visible punctuation and line breaks within the existing cell or list item. Policy decisions, reasons outputs and report-only exit semantics remain unchanged. Authentication failure blocks even when an explicit report-only option leaves process exit successful.
- **Compromised Action supply chain:** consumers should pin reviewed immutable commits and verify release provenance. Generated dist must match source and committed dependency locks. Incoming verification does not make a compromised runner or Action implementation trustworthy.
- **Outgoing public-log publication:** Action runtime decision-row signing is still reserved and performs no Rekor writes. The separate release-provenance path retains its DNSSEC/CAA preflight. Any future public decision-row or producer publication must satisfy that boundary; local synthetic signing never publishes test attestations.

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
- Keep dependencies up to date (the unreleased enforcing source requires Node 22.22.2+, 24.15+ or 26+; published legacy artifacts retain their existing runtime contract)
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
