# Incoming evidence verification and producer migration

**Status:** Unreleased local enforcing source. Corrected85focused tests, full171-test coverage/build/dist qualification and all six bundled-entry self-consumer cases passed locally. No enforcing Action rollout or full acceptance claim.
**Date:** 2026-11-11. **Bead:** `bd_000-projects-h08j.7` (in progress).
**Reviewed repository baseline:** `274ef35502ae8fb001f697cc631680b23cf566f3`.

## Decision proposed for review

Implement mandatory incoming verification using vetted Sigstore primitives, with separate
externally trusted key and OIDC profiles. Verify every consumed row before schema checks,
provenance preflights, advisory enrichment or decision evaluation. Implement real authenticated
transparency-log inclusion proofs as part of the same delivery contract. A key-only library,
an opt-in verification flag, digest lineage, or a successful unsigned compatibility path does
not complete this bead.

Local design, implementation and offline synthetic-key fixtures can proceed. DR-002 §6.3
(`004-AT-DECR-runtime-language-typescript-2026-06-10.md:112`) gates **Rekor publishing**
on DNSSEC/CAA; it does not require DNS changes before checking an existing signature.
The bead description still mentions that prerequisite. This proposal records the distinction;
it does not delete its deferred label, rewrite dependencies or authorize public anchoring.
The only recorded dependency is the parent-child edge to `h08j`.

## Existing behavior and normative acceptance

Evidence Bundle SPEC at lab commit `f5a6d1a737a0d35f05c849b0b444791edcbc5555` governs:

| Requirement | Evidence | Implementation acceptance |
| --- | --- | --- |
| Independent signatures per row, no whole-bundle signature | SPEC R2/R3, lines100–113 | Splitting or combining rows preserves independent verification; container signatures alone are insufficient. |
| Signed envelope and externally trusted signer | R10/R11, lines208–220 | Exact signed bytes verified against a configured key or pinned certificate identity; payload-supplied keys are never authority. |
| Required predicate schema and subject digest | R13, lines232–243; R8/R9, lines179–204 | Enforce kernel schema, supported URI, subject name matching gate_id and matching SHA256 input digest before consume. |
| Optional fields remain optional | R13.5, line242 | Absence of metadata/failure_mode/advisory_severity does not fail generic verification. Existing promotion-specific requirements remain distinct. |
| Transparency | R12/R13, lines222–241; bead Stage2 | Authenticate log authority, checkpoint, inclusion path and binding to this signed row. Existence/URL/claimed index is insufficient. |
| Verify then decide, without modifying input | R15, lines266–277 | Decision engine receives only verified Statements; original signed bytes retained. |

Current `src/run.ts:569` parses JSON. Its kernel check at600–610 is advisory; its
report-subject comparison at272–286 is digest lineage, not cryptographic authentication.
The baseline Action at274ef355 (`action.yml:15–22`) accepts unsigned Statement arrays and legacy containers.
`action.yml:81–95` reserves rekor-url and cosign-key for **outgoing decision signing**.
Do not reuse those names as incoming trust inputs or silently reinterpret them.

## Artifact formats and producer changes

| Observed artifact | Proposed treatment |
| --- | --- |
| CLI `emit-evidence` default signed output | Installed cosign2.4.1 constructs in-toto v0.1 and artifact-basename subjects, incompatible with required v1/gate_id. Migrate the producer using a reviewed exact-Statement signing API; do not loosen verification. |
| CLI explicit `--full-statement` nested predicate | Reject as unsupported with a clear compatibility error unless a separately reviewed adapter proves both signed nesting and intended predicate semantics. Never recursively unwrap arbitrary objects. |
| Raw Statement array / legacy rows container | Keep available on the existing pinned legacy action release during migration. New enforcing contract requires a signature for every row; no fallback on verification errors. |
| Nightly dashboard report manifest | Current verified metadata signs storage_key committing canonical evidencePayload; dashboard validates that binding and gateResults projection. Preserve this delivery while migrating to independent DSSE Statement signatures. |
| Detached signature of one exact Statement | Possible explicit adapter only: require exact original bytes plus authenticated signature material; never parse/re-serialize before verification. Do not generalize to a single signature over multiple rows. |

Producer evidence: J-Rig `packages/cli/src/commands/emit-evidence.ts:279–285` checks the actual
artifact hash; lines299–344 pass a predicate to cosign attest-blob and emit its signature file.
The default and nested forms differ deliberately. Current remote nightly emitter
`ci/emit-evidence/emit-evidence.ts:197–243` constructs a kernel Statement array and commits its
canonical digest/count/subjects/predicate URIs inside signed metadata. Dashboard recomputes that
binding and validates the redundant gateResults projection after signature verification. This is
authenticated digest binding, not independent per-Statement DSSE signatures. Preserve that
existing reviewed adapter during the proposed dual-artifact producer migration.

## Verifier implementation boundary

Propose `src/verification/` modules for trust-policy loading, envelope adaptation, crypto
verification, row schema/binding checks and redacted failures. The Action shell loads trust
configuration and invokes this boundary before its existing consumer logic. No custom DSSE
signature, certificate-chain, Merkle-proof or checkpoint implementation.

Prefer pinned `@sigstore/verify` with `@sigstore/bundle` and protobuf decoding over requiring a
mutable cosign executable on every runner. The reviewed upstream API exposes `toSignedEntity`,
`toTrustMaterial` and `Verifier.verify(entity, policy)`, supporting trusted public-key lookup and
certificate policy. The conversion layer must reject unsupported formats before verification.
The isolated verifier consumes authenticated trust material without network I/O. Its trusted
loader prepares public material through authenticated TUF refresh, preserving the existing
dashboard trust policy; evidence itself cannot select a mirror or root. [Official trust API](https://github.com/sigstore/sigstore-js/blob/4576519/packages/verify/src/trust/index.ts),
[official verifier API](https://github.com/sigstore/sigstore-js/blob/4576519/packages/verify/src/verifier.ts).

For each row, preserve exact decoded payload bytes, validate envelope bounds and payload type,
verify signature/identity/proof, then parse the authenticated payload as an in-toto v1 Statement.
Do not authorize a key based on an envelope key hint: that hint may only select among externally
approved keys. Reject missing/empty signatures, malformed encoding, unknown algorithms,
unknown predicate URIs and unsigned mixtures. Bound file size, row count and signature count;
choose limits from actual producer fixtures during implementation and document them.

`input_hash` uses `sha256:<hex>` while Statement subject digests contain bare hex. Check syntax,
normalize this documented prefix only, and require the matching gate subject to carry the same
digest; an unrelated extra subject must not satisfy the binding. Preserve the existing delegated
rollout policy and fail-on-block reporting contract. Verification failure always yields block and
must never become verified/pass even if the caller uses the existing report-only exit setting.

### Trusted identity profiles

Proposed incoming inputs are `verification-policy-path` and `verification-trusted-root-path`;
final names require contract review. Policy must come from the trusted workflow/base revision,
not a contributor-controlled bundle or unchecked PR-head file. An authorized signer alone does
not prove evidence is for the requested commit: retain existing report/skill provenance checks
and bind workflow/repository/ref expectations where the certificate carries them.

- **Key profile:** pinned public key fingerprint, approved algorithms, validity/revocation policy,
  permitted predicate types and explicitly permitted logless private use. Private keys stay out
  of the verifier. Unknown key hints fail. No arbitrary remote keyref fetching.
- **OIDC profile:** exact issuer plus certificate SAN/workflow identity and permitted predicate
  types, rooted in authenticated Fulcio/CT/Rekor trust. Reject missing/mismatched claims;
  never use a manifest's own identity claim as the expected identity.
- **Anchored evidence:** proof is mandatory if policy requires it or evidence claims anchoring.
  Do not downgrade a malformed proof to private mode. Keyless public profile requires a valid
  proof and authenticated signing-time evidence. A private key profile may omit anchoring as
  SPEC R12 permits, but report that fact explicitly.

Production public-key fingerprints, authorized workflows/ref selectors, trust-root custody and
rotation are deployment trust decisions. They are not required to implement synthetic fixtures
locally, but must be reviewed before enforcing on actual producers.

### Stage2 is inclusion proof, not merely a threshold

Upstream verification accepts an inclusion **promise** or a proof. Therefore `tlogThreshold:1`
alone does not establish this bead's stronger inclusion-proof requirement. The anchored adapter
must require proof plus checkpoint for every accepted entry, then let the vetted verifier check
checkpoint authority, Merkle inclusion and signed-content binding. Reject promise-only entries,
unknown log IDs, duplicate entries used to inflate thresholds and mismatched body/signature.
Do not accept an attacker-supplied root hash as a trusted checkpoint. [Official log verification](https://github.com/sigstore/sigstore-js/blob/4576519/packages/verify/src/tlog/index.ts).

Authenticated signing time is separately necessary for expiring certificates. Do not trust a
bare integratedTime field simply because a Merkle path validates. An upstream advisory specifically
covers this timestamp distinction; it lists affected3.1.0/patched3.1.1 and does not by itself
establish vulnerability of the locally installed4.0.0. Pin a reviewed current version and retain
regressions for unauthenticated times. [Official advisory](https://github.com/sigstore/sigstore-js/security/advisories/GHSA-xgjw-pm74-86q4).

## Current tooling and dependency qualification

Observed locally: cosign2.4.1, dashboard sigstore5.0.0 and @sigstore/verify4.0.0.
Dashboard `src/ingest/verifier-sigstore.ts:44–51` shows pinned issuer/workflowSAN verification;
its offline synthetic verifier is test infrastructure, not evidence of public Rekor trust.
Do not copy it as the production verifier.

Official releases checked2026-11-11 list sigstore5.0.1 and @sigstore/verify4.1.3.
The latter requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`. This Action declares node24 but
its package engines and build target still promise Node20. Resolve and test that discrepancy
before selecting dependencies; do not silently rely on unsupported runtime patches. Pin exact
compatible packages/lockfile and test the committed distribution on the supported Action runtime.
[Release record](https://github.com/sigstore/sigstore-js/releases/tag/%40sigstore%2Fverify%404.1.3),
[package engine requirement](https://github.com/sigstore/sigstore-js/blob/4576519/packages/verify/package.json).

Cosign's current official blob-attestation verifier accepts a bundle and either trusted public
key or exact OIDC identity/issuer; current bundle formats support offline verification. Installed
2.4.1 help also exposes legacy signature and new-bundle modes. Use it only as an interoperability
oracle after pinning the fixture-generation tool; current documentation is not proof that this
older binary implements every current behavior. No binaries were upgraded or artifacts signed.
[Official cosign verification](https://docs.sigstore.dev/cosign/verifying/verify/),
[blob-attestation interface](https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-blob-attestation.md).

## Local implementation and migration sequence

1. Review this contract and select a runtime-compatible vetted verifier version. Implement the
   isolated verification boundary with immutable synthetic trust configuration and actual signed
   fixtures. Do not wire an unsigned success fallback or claim completion from this library alone.
2. Exercise both offline private-key verification and synthetic certificate/log-root fixtures in
   supported Sigstore wire formats. Include a real signed checkpoint and inclusion path checked
   by the chosen library. A synthetic trust domain proves implementation behavior, not a public
   Rekor anchor. Add a retained real public fixture, if available and appropriate, for read-only
   interoperability; never publish test material to public Rekor.
3. Migrate producers to distribute independently signed Statements and complete proof material.
   Keep old consumers on their existing pinned release while producing both formats. Establish
   the trusted expected signing identities outside the evidence. Validate that dashboard output
   and rollout policy consume the same authenticated predicate bytes.
4. Wire incoming verification ahead of every consumer path in the new enforcing Action release.
   Preserve raw array/container *containers* where all contained rows have authenticated evidence;
   do not preserve unsigned acceptance inside the enforcing path. Regenerate committed dist and
   verify Action bundle/runtime parity. Pilot a synthetic consumer, then audit-harness self-adoption.
5. Move existing adopters to the enforcing release only after signed producers and trust policy
   are ready. Default strict enforcement is the end state; a permanently opt-in verifier does
   not close h08j.7. Rollback uses the previous pinned Action/producer pair and explicitly reports
   the restored legacy limitation rather than silently disabling verification within the new path.

Release/version selection and consumer rollout are review decisions because unsigned acceptance
is an established interface. The design proposes a new explicitly enforcing release boundary;
it does not authorize production deployment, changing protected trust roots or disabling checks.
Outgoing decision signing, DNSSEC/CAA changes and public Rekor publishing remain separate.

## Required tests and closure evidence

Use synthetic gate IDs per CLAUDE.md:153, real keys and actual supported envelope bytes. Tests
must cover correct key/identity; wrong key/issuer/workflow; altered payload/signature/predicate;
wrong payload type; unsupported nested Statement; invalid required schema; absent optional fields;
wrong gate subject/input hash; unsigned and mixed rows; row split/union; invalid proof/checkpoint;
unknown log key; duplicate entries; promise-only evidence; missing proof when anchoring is claimed;
unauthenticated signing time; valid private-logless mode without a public-anchoring claim; and
exact bytes passed to the decision engine. No test may equate a computed digest with a signature.

Closure requires Stage1 and Stage2 negative controls, explicit trust input documentation,
producer/consumer interoperability, full repository coverage/mutation/dist gates, required CI,
reviewed rollout/rollback evidence and honest public security documentation. Document coverage
of private versus keyless profiles. Missing production trust configuration or producer migration
is remaining work, not a successful partial closure. The isolated boundary has now run34offline cryptographic tests successfully. No public-log
writes, DNS changes, production operations or Action enforcement changes have occurred.

## Prepared implementation decision (not yet validated)

The isolated feature branch now proposes exact @sigstore/verify4.1.3 and bundle5.0.1,
with an explicit package-engine change to the upstream supported Node range and build target
node22.22. Existing published artifacts stay unchanged; this is a proposed runtime contract
change for the new release, not retained Node20 compatibility. No extra package is introduced.
Root CI already selects Node22; implementation qualification must pin/check a supported patch
and test the Action's actual node24 runtime before distribution.

Official runner v2.338.2 `src/Misc/externals.sh:10` pins Node24.22.1, which satisfies the
new library's minimum24.15. This is evidence for that runner release, not proof every existing
self-hosted installation has updated. Local Node22.23.1 is compatible. Older verify3.1.1 supports
Node20.17+, but selecting it merely for the legacy engines field would omit later library
hardening; the proposed path uses the current verifier and documents the runtime change.
[Runner pinned Node version](https://github.com/actions/runner/blob/v2.338.2/src/Misc/externals.sh),
[older verifier engine contract](https://github.com/sigstore/sigstore-js/blob/%40sigstore%2Fverify%403.1.1/packages/verify/package.json).

Implemented `src/verification/verify-row.ts` is now wired through run.ts to the local enforcing main.ts. Its historical34focused
real P256/keyless/signing-time/inclusion/negative-control tests and repository typecheck passed
in the consistency receipt below. Trusted loader/artifact-set and strict execution staging seam subsequently passed the expanded
64-case focused run documented below. Production producer migration, integration/full coverage and dist gates,
migration and enforcement remain outstanding. The provisional bounds still need actual producer
qualification before becoming a public contract. Canonical pnpm lock resolution succeeded;
the current TUF loader pins are resolved in the canonical lock. These isolated tests do not
establish complete Stage2 delivery or bead completion.

### Static review hardening before first execution

The adapter now checks canonical, nonempty base64 for the payload and signature before protobuf
conversion, requires exactly one matching gate subject (unrelated additional subjects remain
allowed), and derives anchoring requirements after signature verification from authenticated
Statement or predicate.metadata claims. Supported reserved claims are signing_mode
(rekor_production/sigstore_staging) and non-null rekor_log_index/rekor_log_indices/rekor_url.
Unknown signing modes fail rather than entering private mode. Absent claims alone do not demand
anchoring for an explicitly private key policy; supplied log entries and OIDC still require proofs.
This is the supported claim adapter, not a claim that arbitrary metadata vocabularies are handled.
Unsigned sidecar claims are not consumed by this library; the future outer adapter must reject
unsupported sidecars or bind them explicitly, never downgrade them silently.

Source inspection of the proposed pinned verifier4.1.3 at upstream4576519 confirms its
verifyTLogs method authenticates **every** entry and its body before threshold counting, and
rejects duplicate authenticated log-ID/body pairs. Thus a valid entry does not excuse an invalid
or unknown extra entry in this version. Our adapter additionally rejects promise-only entries;
no custom crypto or repeated per-entry verification is needed. Mixed valid/invalid/unknown and
duplicate entry negative controls remain required with the real Stage2 fixtures; source review
is not execution proof. [Pinned verifier loop](https://github.com/sigstore/sigstore-js/blob/4576519/packages/verify/src/verifier.ts).

### Offline Stage2 fixtures and execution boundary

The test-only dependency `@sigstore/mock@0.13.1` publicly exports `initializeCA`,
`initializeCTLog`, and `initializeTLog`. The prepared fixture uses these constructors directly,
never their HTTP interception wrappers. They create ephemeral synthetic CA and log keys,
leaf certificates with real SCTs, authenticated Rekor-v1 timestamps, and a signed one-leaf
checkpoint with a valid Merkle inclusion path. Single-leaf proofs legitimately have an empty
sibling path; the production verifier still checks leaf hashing, root, tree size and checkpoint
signature. The isolated34-case run verifies these real constructed proofs through the production library;
this does not establish production root/producer interoperability.

The fixture's accepted DSSE-v0.0.1 body binds the exact payload digest and signature. The typed
bundle retains the upstream helper's authenticated top-level log index and separate proof index;
the helper models a standalone one-leaf checkpoint. This synthetic log is not a claim about a
production log's evolving tree or consistency. No test issues public anchors or obtains OIDC
credentials. Fixture-only signing is distinct from production verification, which remains wholly
inside the vetted library. [Pinned public fixture exports](https://github.com/sigstore/sigstore-js/blob/4576519/packages/mock/src/index.ts),
[CA](https://github.com/sigstore/sigstore-js/blob/4576519/packages/mock/src/fulcio/ca.ts),
[log construction](https://github.com/sigstore/sigstore-js/blob/4576519/packages/mock/src/rekor/tlog.ts).

Prepared negative controls cover wrong externally trusted issuer/identity, untrusted CA,
authenticated signing time outside certificate validity, proof-only unauthenticated integratedTime,
altered signed timestamp, promise-only evidence, duplicate entries, and a valid entry accompanied
by an invalid root/checkpoint/body or unknown log. Each mixed-entry control first requires success with two separately trusted synthetic log
authorities and distinct log IDs, then corrupts only the second entry. This prevents duplicate
entry or timestamp rejection from impersonating proof rejection. A separate duplicate-body
control omits only the duplicate promise so its assertion targets duplicate log entries.
The expiry control compares the parsed certificate notBefore/notAfter to the actual fixture
log timestamp and asserts that timestamp equals the emitted integratedTime before rejection. The pinned library verifies
both supplied promise and proof; a valid promise cannot rescue a supplied invalid proof.
[Inclusion verification](https://github.com/sigstore/sigstore-js/blob/4576519/packages/verify/src/tlog/index.ts).

Private key revocation and validity are a trusted-material-loading obligation. A private logless
row has no authenticated signing time: its evaluated_at, a caller-provided date, and an unsigned
integratedTime cannot establish one. The prepared production loader rejects revoked/disabled keys
and keys outside the owner-authorized current verification window before returning material;
historical-key acceptance requires an explicit owner policy and authenticated time, not an
empty timestamp list accepted by a library default. It must also reject evidence-controlled
trust paths. The isolated `verifyRow` API assumes this trusted material is already admitted;
the separate trusted-loader module now provides current-time enrollment admission. Fixture `validFor: () => true` deliberately describes only
an ephemeral test key and must not be copied into a production loader. No revocation-compliance
or complete Stage1 deployment claim is made from the current isolated module.

Queued first runtime work is dependency resolution (including lockfile), local dependency audit,
`npm run typecheck`, and
`npx --no-install vitest run tests/verification.test.ts tests/verification-inclusion.test.ts --maxWorkers=1 --minWorkers=1`.
Use the admitted transient resource cap; dependency installation runs normal lifecycle hooks.
Then run unchanged full coverage/build/dist gates only after the fixture and type boundaries pass.
The historical setup attempts and latest34-case passing receipt are recorded below; the expanded loader/container execution subsequently passed64cases.

### First admitted setup outcome

The first admitted command used normal npm install followed by typecheck and the two focused
files. Installation completed, then typecheck exited2 in25.18seconds; the test command did not
run. Receipt `/tmp/iep-verifier-focused-receipt.json` records exact source hashes and log hash.
The failures identify fixture ArrayBufferView conversions and the upstream mock declaration's
missing `@sigstore/rekor-types` peer type (listed only as its development dependency). Prepared
corrections preserve byte offsets/lengths and add exact test-only rekor-types5.0.0; they have not
been rerun. No production verifier failure or fixture execution is claimed.

Current CI uses the tracked pnpm-lock.yaml and frozen pnpm installation, despite the umbrella's
older npm example. The generated npm lock is an untracked investigation artifact and is not the delivery lock. Next admitted
setup must resolve the intended pins into the existing pnpm lock and validate with the canonical
package manager. Normal npm policy blocked two esbuild install scripts; no approval or bypass
was applied. npm reported10 advisory entries in the existing Actions HTTP and Vitest dependency
families, none named Sigstore. Exact baseline/candidate canonical dependency attribution and
remediation remain to be reviewed; an npm audit result is not proof that the candidate introduced
or fixed those dependencies. No automatic audit fix or unrelated major upgrade was performed.

### First real cryptographic fixture results

After fixture typing and kernel-valid runner corrections, canonical pnpm typechecking passed
and the two focused suites executed31tests:30passed,1failed (8.85seconds total command time).
Receipt `/tmp/iep-verifier-focused-kernel-valid-receipt.json` preserves exact hashes and log.
Real private/keyless signature, certificate identity, SCT, signed timestamp, checkpoint and
inclusion-positive cases passed. The failure is specifically redundant proof.rootHash tampering:
verify4.1.3 verifies the Merkle computation against the authenticated checkpoint's root and tree
size, rather than those duplicated proof fields. This is not evidence that an invalid Merkle
path or checkpoint signature was accepted. The strict adapter consistency policy still needs
resolution and regression testing; the failed control remains in place. No Stage2/full migration
completion follows from these partial results.

The approved follow-up performs metadata consistency only after the pinned verifier returns
success for the exact checkpoint envelope. It compares proof.treeSize as strict unsigned decimal
BigInt (no leading zeroes, signs, exponent or Number conversion) with the checkpoint second line,
and compares proof.rootHash bytes with canonical, nonempty base64 in the third line. Any mismatch
fails; malformed metadata cannot become a private-mode fallback. No signature, Merkle hashing or
proof mathematics is implemented in this adapter. Wire format is pinned to
[transparency-dev/formats1973a275, checkpoint body](https://github.com/transparency-dev/formats/blob/1973a275bef8c04110536ccbd8115744dfb7b541/log/README.md#checkpoint-body).

Additional pending controls mutate the second of two previously accepted independent log entries:
wrong tree size, a spurious Merkle sibling path and an out-of-tree leaf index. The original root
metadata negative remains. The original30/31receipt is preserved; these source/test changes have
only been formatted and diff-checked while the boundary full gate owns runtime capacity.

## Current trust and producer integration reconciliation

Read-only remote-main checks during preparation found reusable trust choices, not an empty trust
configuration. Dashboard `ingest/pinned-subjects.json` blob
`c2402da9f6853a8b94c52fb23fb5373dfaaaf652` pins the issuer
`https://token.actions.githubusercontent.com` and the operator-confirmed nightly identity
`jeremylongshore/j-rig-skill-binary-eval/.github/workflows/nightly-skill-evals.yml@refs/heads/main`.
The certificate SAN is this workflowRef prefixed with `https://github.com/`; the separate manifest
subject is `repo:jeremylongshore/j-rig-skill-binary-eval:ref:refs/heads/main`. Reuse this exact identity
for the pilot rather than broadening to an owner/repository wildcard or requesting a new identity.
Tag release channels have existing trailing-tag allowlists; expanding those patterns into exact
expected certificate identities needs the trusted requested release ref, never an untrusted row.

Dashboard `src/ingest/verifier-sigstore.ts:47` calls sigstore.verify with exact expected issuer and
workflow SAN. Installed sigstore5.0.0 `dist/sigstore.js:87` obtains roots using
@sigstore/tuf.getTrustedRoot, then toTrustMaterial. No custom mirror/root is passed by the adapter.
This establishes existing default public Sigstore TUF trust policy; it does not authorize trusting
arbitrary row-supplied roots. The proposed new loader can use the current supported TUF client
and verified trusted-root metadata, with bounded failure/expiry behavior and a controlled cache.
A TUF failure must not silently load row-provided roots or bypass verification. Existing production
private-key identities/revocation policies were not found in this bounded adapter inspection;
the private loader can be implemented/tested with supplied synthetic trusted configuration while
actual production key enrollment remains a separate activation decision.

**Correction to earlier producer assumptions:** current remote J-Rig emitter blob
`50acce58464874baaa3f0fd19d2ca5dc030e9aba`, `ci/emit-evidence/emit-evidence.ts:197–243`,
constructs a kernel-valid ordered Statement array and content-addresses its canonical bytes in
signed metadata.storage_key. Nightly workflow blob `af6f35c4622259d01764c5fe5c32c488ec149a1f`
still uses cosign sign-blob for the metadata and verifies its issuer/SAN before publication.
Dashboard `src/ingest/gate-result-binding.ts:38–96` verifies the supplied evidencePayload digest,
row count, subject set, predicate URI set and redundant gateResults projection after signature
verification. Thus these current adjacent predicates are cryptographically committed through
verified signed metadata and digest binding. A bare digest alone is still not cryptography, and
this delivery is not yet an individual DSSE signature on each gate-result Statement.

### Concrete next source-wiring proposal (not activated)

1. Add a trusted-material loader separate from verifyRow. For the nightly keyless pilot, consume
   the existing exact issuer/SAN and verified public Sigstore TUF material. Trust configuration
   comes from protected caller/workflow configuration (inline input or a separately trusted
   checkout), not from the evidence directory or arbitrary PR-head file. Never reuse reserved
   outgoing cosign-key/rekor-url inputs. Private key loading rejects disabled/revoked/out-of-window
   enrolled keys at verification time, with authenticated historical-time policy explicit.
2. Add an artifact-set adapter that reads bounded bytes once, requires nonempty supported signed
   rows, invokes verifyRow for every row, and passes only authenticated Statement predicates to
   the existing kernel decision package. No partial row subset, raw JSON fallback, or fallback
   from invalid signed input. Existing report and skill-promotion binding checks still run on
   the verified data before decide(); no rollout algebra moves into the Action shell.
3. Introduce explicit incoming trust inputs in the proposed enforcing release. In run.ts, place
   verification after bundle byte acquisition and before advisory kernel validation/bindings or
   decide(). Authentication/configuration errors produce a block and honest verification-failure state;
   preserve the existing fail-on-block/dry-run exit-code contract without allowing decide() or
   advisory consumption to see unauthenticated rows. Tests must establish that invalid evidence never reaches
   decide(), even in policy advisory mode. This is a reviewable release contract, not a live toggle.
4. Migrate the nightly producer by emitting a separate exact Statement file per gate predicate
   and DSSE-signing that Statement (not a nested Statement predicate and not the whole metadata
   array). Preserve the existing signed-metadata/evidencePayload artifacts for dashboard delivery
   during the transition. Existing issuer/workflow SAN can remain unchanged. Verify new artifacts
   offline in producer/consumer interoperability fixtures before enabling any publishing change.
   The existing published metadata binding must not be described as absent or deleted prematurely.
5. Audit consumer refs before publishing an enforcing artifact. Current remote audit-harness
   dogfood workflow line71 pins fullSHA `1c2e13029bf7088870df16037a9969fe1c4d9296` (v0.3.2),
   consumes its current raw fixture, and explicitly fail-on-block=true. It stays operational until
   an intentional consumer update with signed fixtures/trust configuration. A consumer following
   @main or a floating major would instead inherit rebuilt enforcement immediately; no such
   consumer was proven by this bounded scan. GitHub code search returned zero indexed results
   even for the known consumer, so this is an access/index coverage gap, not proof none exist.
   Do not wire enforcement into main's distributed Action until that migration impact is resolved.

This proposal changes no production roots, workflow permissions, public signing operations,
release tags, or consumer pins. The corrected34-case and expanded64-case focused runs subsequently passed; full repository
gates, distributed Action migration and producer interoperability remain outstanding.

## Expanded local staging validation

The current frozen source passed normal canonical pnpm dependency resolution, repository typecheck,
and64focused tests across6files in13.19seconds under4CPU/4GiB with one worker. Receipt
`/tmp/iep-verifier-expanded-focused-receipt.json` records before/after hashes and the exact commands;
source bytes remained unchanged. Tests cover real synthetic anchored-key and keyless trust loading,
revoked/disabled/current-time validity, exact key hints, TUF failure with no private fallback,
all-rows authentication, malformed/oversized containers, and the shared strict execution seam.
No public TUF fetch or public anchor was used by tests: only TUF acquisition is stubbed with real
synthetic trusted material; actual signatures, certificates, checkpoints and proof math execute.

`runVerified(trust)` now shares the same orchestration as existing `run()`. It authenticates every
row before advisory extraction or decide(), emits verification-status=verified only after all rows
pass, and emits failed plus decision=block on authentication/format errors. Existing fail-on-block
and dry-run exit semantics remain intact; tests prove decide() is not called for invalid evidence
in either report-only mode. At that64-case snapshot main.ts called legacy run(); the subsequently prepared local strict entry is not a published
enforcing release and does not close h08j.7.

Authenticated skill-refiner-pass rows use the kernel URI/schema and result_snapshot_hash subject
binding. Malformed authenticated advisory bodies retain the existing dropped/nondisplay behavior;
a real decision-package integration test proves they do not change a valid gate verdict. Failed
cryptographic authentication never gains that advisory exemption. Signed claims at every supported
location are validated even if an earlier claim already requires anchoring.

The trusted PEM itself is the externally configured private-key authority; its algorithm is encoded
in that SPKI and verified by vetted primitives. The loader records computed publicKeySpkiSha256.
It does not claim a separately configurable algorithm allowlist or enrolled fingerprint comparison.
Those broader proposed controls are not silently represented as implemented. Private logless and
explicitly anchored key profiles are distinct: the latter obtains authenticated public TUF log roots;
no evidence-provided roots or URLs are accepted. Production custom-log roots are not enrolled by
this change. Trust policy is loaded afresh for an evaluation; it is not a long-lived revocation feed.

### Producer compatibility and bounded-ingestion follow-up

Source inspection of installed cosign2.4.1 establishes a producer incompatibility beyond bundle
packaging: attest-blob passes path.Base(artifactPath) as GenerateOpts.Repo and its attestation
builder emits StatementInTotoV01 with subject.name=repo. Its help exposes no preformed-Statement
or subject-name override. The new verifier requires in-toto v1 and the gate_id subject; neither
requirement will be loosened to accept this mismatch. A real offline synthetic-key interoperability
proof using a reviewed exact-Statement signer is still required before producer migration.
This is source evidence, not an executed producer pass.
[cosign2.4.1 attest-blob](https://github.com/sigstore/cosign/blob/v2.4.1/cmd/cosign/cli/attest/attest_blob.go#L132),
[attestation construction](https://github.com/sigstore/cosign/blob/v2.4.1/pkg/cosign/attestation/attestation.go#L159).

After the64-case run, root review identified that the strict file read allocated the complete
file before checking its size. The corrected staging reader now opens nonblocking, rejects
nonregular/oversized descriptor metadata, caps actual reads at16MiB+1 even if the file grows,
and closes in finally. Prepared tests cover exact reads, oversized preflight without content read,
concurrent growth, nonregular inputs and open failure. Strict execution also records verification
as required independently of the presence of a runtime trust argument, preventing an untyped caller
from accidentally falling back to legacy parsing. These follow-up source/tests are not included
in the earlier64-pass result; they subsequently passed in the78-case receipt below.

## Bounded incoming-release consumer inventory

A fresh default-branch scan refreshed164repository metadata records from the229-repository estate
snapshot, including33private,27archived and28fork repositories. It read160workflow directories
and784immutable YAML blobs;780parsed successfully. The finite scan used1,065read-only API calls
in109.29seconds and performed no remote writes. The four workflow-directory/ref404 responses
were subsequently resolved against accessible pinned commits: the relevant directories are absent
at those commits. This proves current absence, not deletion history or repository permission denial. Four malformed YAML files remain parse gaps. The65snapshot repos
without registered workflows were not refreshed in this bounded pass.

Four direct Action consumers were found, all pinned to full commit SHAs:

| Consumer | Workflow and line | Action commit |
| --- | --- | --- |
| intent-audit-harness | rollout-gate-dogfood.yml:71 | 1c2e13029bf7088870df16037a9969fe1c4d9296 |
| intent-rollout-gate | release-gate.yml:194 | a6e44951b2e950d250a65e5f5f3dbaf5deb6aab4 |
| Private consumer (identity withheld) | Two workflows; paths withheld | Immutable pins; exact values retained only locally |

The v0.3.2 annotated tag was resolved separately and points to1c2e13029. The release-gate workflow's
comment says “main after#77,” but the actual uses reference is the immutable a6e44951 commit.
These known consumers require deliberate pin updates with signed fixtures/artifacts and externally
admitted trust before enforcing-release adoption. Existing pins continue to resolve the prior code.

No direct floating@main use or dynamic uses expression was observed among successfully parsed
blobs. This is explicitly not proof that no indirect/floating consumers exist:a follow-up statically inspected all188local references at pinned commits (63reusable-workflow
and125local-action occurrences); local-action runtime checkout provenance is not exhaustively bound; third-party Action internals, remote reusable
workflow graphs, nondefault branches and historical pinned workflow revisions were not expanded.
Do not infer rollout authorization or complete safety from the direct-use count. Archived/forked
repositories remain classified in the full inventory rather than silently excluded.

[Sanitized migration inventory](012a-RR-REFF-rollout-consumer-migration-inventory.json) records exact
consumer workflow blob SHAs, pins, aggregate coverage and the full receipt hash. Full per-repository
records, unresolved local uses, access/parse gaps and consumer CSV remain under
`/tmp/intent-ci-audit-github/rollout-consumers/`; private consumer identities, workflow paths, blob identifiers and pins are omitted from
the repository-facing summary. Exact private mappings remain only in the local estate inventory. Private workflow bodies and secret values were not retained.

### Immutable local-reference follow-up and privacy correction

All188local-use occurrences across14repositories were checked against a fresh pinned commit with
the originally scanned caller workflow blob still identical. The finite recursive pass inspected
54distinct definitions, including63local reusable-workflow occurrences and125local-action
occurrences. Reusable paths lead only to already recorded immutable rollout pins. Local Action
files alone do not prove what a dynamically selected runtime checkout contains; that remaining
boundary is explicit rather than treating a static action.yml read as complete execution tracing.

The rollout repository itself has six local `uses: ./` calls: three in ci.yml's smoke-action job,
two in dogfood.yml's dogfood job and one in dogfood-enforce. Each uses checkout's default caller
repository/event revision. Therefore replacing the distributed Action entry would affect these
self-consumers immediately on their checked revision, even though external direct consumers pin
older commits. Their fixtures and exit expectations belong in the enforcing-release migration.
The exact public workflow blobs and checkout observations are recorded in012a.

All four directory404gaps were resolved with accessible commit/root/.github listings proving
current directory absence. No deletion-history or permission-denial claim follows. Four malformed
YAML blobs were lexically inspected for uses statements; no additional rollout reference appeared,
but they remain invalid/unresolved workflows, not parsed coverage successes.

The initial public-draft summary mistakenly included a private consumer's identity and workflow
paths. It was corrected before commit/publication:012a and this document now include only private
aggregate counts and immutable-ref classification, with no private identity/path/blob/pin mapping.
Exact private mappings remain exclusively in the local estate evidence. No public disclosure or
consumer rollout was authorized or performed.

## Enforcing Action and self-consumer migration draft

The local draft now declares incoming `verification-policy-json` (required,64KiB maximum) and
`verification-status` outputs. `runEnforcingAction()` loads externally supplied strict trust
configuration and enters the shared verified execution body. An invalid/missing/oversized trust
input blocks without delegating; the signed artifact set has no unsigned fallback. These changes
passed in the78-case focused receipt before main.ts switched locally to runEnforcingAction().
The new entry and subsequent identity/transparency fixes passed the qualification recorded below.

The proposed public contract takes trust JSON from protected caller configuration. It must not be
copied from arbitrary evidence or PR-head content. Public Sigstore identities reuse existing policy;
private PEM enrollment names status/validity and whether authenticated inclusion is required.
The verification-status output distinguishes authentication from the policy decision: both allowed
and policy-blocked authenticated evidence report verified; authentication failures report failed
and block, even when report-only exit settings deliberately leave process exit successful.

The exact six self-consumer paths are migrated in the local workflow draft:

| Self consumer | Existing input | Prepared signed input |
| --- | --- | --- |
| CI allow | tests/fixtures/evidence/allow-bundle.json | .signed-smoke/allow-bundle.signed.json |
| CI promotion | tests/fixtures/evidence/generic-report-promotion-bundle.json | .signed-smoke/generic-report-promotion-bundle.signed.json |
| CI non-failing block | tests/fixtures/evidence/fail-row-bundle.json | .signed-smoke/fail-row-bundle.signed.json |
| Dogfood ship | .dogfood/ship.bundle.json | .dogfood/signed/ship.bundle.signed.json |
| Dogfood observe | .dogfood/no-ship.bundle.json | .dogfood/signed/no-ship.bundle.signed.json |
| Dogfood enforce | .dogfood/no-ship.bundle.json in its own job | .dogfood/signed/no-ship.bundle.signed.json in that job |

`scripts/sign-local-evidence.mjs` is a local self-test producer using pinned
@sigstore/sign5.1.0 DSSEBundleBuilder at upstream4576519. It signs each precomposed v1 Statement's
exact chosen bytes with an ephemeral P256 key. The builder owns DSSE pre-auth encoding and bundle
packaging; a Signer delegates only the primitive signature to Node crypto. witnesses=[] means no
OIDC, Fulcio or Rekor operation. Private key material stays in memory; only signed artifacts and
public temporary trust policy are written. This proves internal interoperability, not independent
production provenance: a test job controls both its synthetic signer and admitted public key.
The real dogfood continues to bind the actual dist artifact and preserve both allow/block cases.

New producer tests require the resulting bundle to verify through the actual consumer, preserve
v1/gate_id and payload bytes, reject pre-v1 input rather than rewriting it, and persist no private
key. Both producer tests passed in the78-case focused run with network denial installed. Exact default-builder/witness APIs:
[DSSE builder](https://github.com/sigstore/sigstore-js/blob/4576519/packages/sign/src/bundler/dsse.ts),
[builder execution](https://github.com/sigstore/sigstore-js/blob/4576519/packages/sign/src/bundler/base.ts).

The normal signer install and eight focused suites passed78tests in18.118seconds under4CPU/4GiB, one worker. Receipt: `/tmp/iep-verifier-enforcing-focused-receipt.json`; warm local install took2.1seconds. CI smoke adds installation to an existing job with lock-keyed caching; this security migration is not a measured CI speed improvement. Dogfood reuses its existing install. Full build/coverage/dist qualification and actual bundled self-consumer execution remain pending.

Independent review subsequently found the pinned verifier interprets SAN policy strings as regular expressions. The local fix escapes all metacharacters and anchors both ends, including rejecting a terminal newline; real issued-certificate near-match negatives and an exact metacharacter positive passed in the85-case focused run. Issuer extensions are literal comparisons in the pinned library. The strict entry now retains authenticated row transparency and reports `verification-transparency` plus the summary as `all-inclusion`, `contains-private-unanchored`, or `not-verified`. Authentication success is distinct from public anchoring and rollout permission. These seven additional cases are not included in the78-pass receipt.

Next qualification runs the corrected focused suites before build/full coverage/dist/actionlint and bundled self-consumer checks. No production roots, public anchors, external consumer pins, release tags or deployment approval are changed by this preparation. Independent producer deployment/keyless migration remains part of h08j.7 acceptance.

## Qualified local enforcing candidate and remaining acceptance

The corrected85-case focused/type run passed in14.716seconds. Full qualification passed in24.189seconds: build, normal generated-dist staging, harness integrity, unchanged `pnpm run check`, and reproducible `dist:check`. All171tests/11files passed; aggregate coverage90.41% lines,85.71% branches,100% functions exceeds unchanged85/80 floors. Receipts `/tmp/iep-verifier-identity-focused-receipt.json` and `/tmp/iep-verifier-full-receipt.json` bind working-tree source hashes; they do not claim a committed or hosted-CI head passed. Generated dist SHA256 is `588ee8fc0fd6815143f1ffe4aa8f1d52d950121a9e0faa75449ca736d7bedecc`.

Actual bundled entry execution passed all six self-consumer cases in3.739seconds on Node22.23.1 with network denial: allow, promotion and ship allow/exit0; non-failing block and observe block/exit0; enforce block/exit1. Every case reported verified and contains-private-unanchored. `/tmp/iep-verifier-built-smoke-receipt.json` records the exact same dist digest and fixtures. This does not establish Node24 hosted execution or independent production trust. The repository declares a future70% mutation floor but explicitly has no wired mutation gate (`tests/TESTING.md:39–42`); no mutation-pass claim is made.

Remaining ordinary delivery work: final documentation/static review, normal commit with generated dist and pins, exact-head PR checks (including Action Node24 runtime), review disposition, and a reviewed compatible enforcing release migration plan. Stage1 and real Stage2 math are locally verified through the vetted library, including independent valid/bad extra-log controls; production producer interoperability is still distinct. J-Rig cosign v0.1/basename output needs migration to exact v1 Statements or the existing authenticated nightly metadata profile needs a separately reviewed adapter. Self-test keys are not production enrollment. Producer source changes and offline interoperability tests can proceed locally without publishing attestations or changing live caller trust.

Owner-held boundaries are production trust enrollment or changes to admitted identities, release/tag publication and external consumer enforcement rollout, and any outgoing public Rekor publication subject to DR002 DNSSEC/CAA prerequisites. Existing exact nightly OIDC identity and authenticated TUF trust can be reused in a reviewed proposal. The old deferred label and parent-child relationship do not prohibit local incoming-verification implementation; they do not authorize outgoing publication either. Full h08j.7 acceptance remains open until the actual producer/consumer migration and enforcing delivery are evidenced.
