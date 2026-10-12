# Canonical Dashboard Evidence

The private `ci/emit-evidence.ts` producer publishes the Action repository's
`iar` dashboard evidence. It measures the existing harness-hash and reproducible
dist gates. It does not implement rollout decisions or change the Action's
runtime statement output. The emitter and dashboard both use kernel 0.10.0.

## Payload and Verification

Each gate result becomes one invariant-checked in-toto statement inside an
`EvidenceBundlePayload` array. The signed `storage_key` hashes the entire
canonical payload; subjects, predicate types and row count derive from it.
The manifest carries the payload and a checked `gateResults` projection.

Assembly rejects invalid or missing payloads, inconsistent signed metadata and
divergent projections. Signature verification remains a separate workflow and
dashboard-ingest responsibility. Hashes cover all transported payload fields,
including allowed extensions; validation cannot silently strip signed content.

## Contributor Checks

Use Node 22.6 or newer for the native TypeScript emitter:

```bash
pnpm install --frozen-lockfile
pnpm exec vitest run tests/canonical-dashboard-payload.test.ts
pnpm run check
pnpm run dist:check
pnpm exec audit-harness verify
```

Twelve contracts cover independently calculated synthetic vector bytes,
pass/fail/advisory/error preservation, source/signing identities, metadata and
payload mutations, conflicting projections and missing signature files. Fixture
gate IDs are synthetic. Tests, fixture and emitter sources are hash-pinned and
run in PR CI; the release emitter repeats the contracts before signing.
No synthetic fixture is signed or treated as a measured result.

## Publication Boundary

Tag-only dashboard emission, dry-run behavior and existing DNSSEC/CAA controls
retain their current scope. A reviewed source merge does not publish an `iar`
transition. After an approved release, verify the live manifest's source SHA,
canonical digest, metadata and real signature, then dashboard ingest and rendered
rows. Record those receipts under `bd_000-projects-0s2a`; keep legacy dashboard
compatibility until every producer and retained cache has a verified disposition.
