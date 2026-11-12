import { bundleFromJSON, isBundleWithDsseEnvelope } from "@sigstore/bundle";
import {
  toSignedEntity,
  Verifier,
  type TrustMaterial,
  type VerificationPolicy,
  type SignedEntity,
} from "@sigstore/verify";
import {
  GateResultV1Schema,
  SkillRefinerPassV1Schema,
} from "@intentsolutions/core/validators/v1";
import {
  GATE_RESULT_V1_URI,
  SKILL_REFINER_PASS_V1_URI,
} from "@intentsolutions/core";

const PAYLOAD_TYPE = "application/vnd.in-toto+json";
const PREDICATE_TYPE = GATE_RESULT_V1_URI;
const STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
const MAX_ROW_BYTES = 4 * 1024 * 1024;

/** Supplied by the trusted caller, never derived from a row's identity claims. */
export type RowTrustPolicy = {
  material: TrustMaterial;
  signer:
    | {
        kind: "key";
        keyHint: string;
        requireInclusion: boolean;
        publicKeySpkiSha256?: string;
      }
    | { kind: "oidc"; issuer: string; identity: string };
};

export interface VerifiedRow {
  /** The exact authenticated payload, not JSON re-serialization. */
  payloadBytes: Buffer;
  statement: Record<string, unknown>;
  transparency: "verified-inclusion" | "private-unanchored";
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireStatement(payload: Buffer): Record<string, unknown> {
  const statement: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(payload),
  );
  if (
    !record(statement) ||
    statement._type !== STATEMENT_TYPE ||
    (statement.predicateType !== PREDICATE_TYPE &&
      statement.predicateType !== SKILL_REFINER_PASS_V1_URI)
  ) {
    throw new Error("unsupported evidence statement");
  }
  if (statement.predicateType === SKILL_REFINER_PASS_V1_URI) {
    const advisory = SkillRefinerPassV1Schema.safeParse(statement.predicate);
    // Existing advisory contract: authenticated malformed bodies are dropped by
    // extractRefinerPassRows, not promoted into a new hard schema gate here.
    if (!advisory.success) return statement;
    const digest = advisory.data.result_snapshot_hash.slice(7);
    if (
      !Array.isArray(statement.subject) ||
      !statement.subject.some(
        (subject: unknown) =>
          record(subject) &&
          typeof subject.name === "string" &&
          subject.name.length > 0 &&
          record(subject.digest) &&
          subject.digest.sha256 === digest,
      )
    )
      throw new Error("refiner subject does not bind result snapshot");
    return statement;
  }
  const predicate = GateResultV1Schema.parse(statement.predicate);
  const hash = predicate.input_hash;
  if (!/^sha256:[a-f0-9]{64}$/.test(hash))
    throw new Error("invalid input digest");
  const matchingSubjects = Array.isArray(statement.subject)
    ? statement.subject.filter(
        (subject: unknown) =>
          record(subject) && subject.name === predicate.gate_id,
      )
    : [];
  if (matchingSubjects.length !== 1)
    throw new Error("ambiguous or missing gate subject");
  const subject: unknown = matchingSubjects[0];
  if (
    !record(subject) ||
    !record(subject.digest) ||
    subject.digest.sha256 !== hash.slice(7)
  ) {
    throw new Error("subject identity or digest mismatch");
  }
  return statement;
}

function identityPolicy(trust: RowTrustPolicy): VerificationPolicy | undefined {
  if (trust.signer.kind === "key") {
    if (!trust.signer.keyHint) throw new Error("trusted key hint is required");
    return undefined;
  }
  if (!trust.signer.issuer || !trust.signer.identity)
    throw new Error("trusted certificate identity is required");
  return {
    extensions: { issuer: trust.signer.issuer },
    // The pinned library interprets strings as regex patterns, not literals.
    // A negative-any-character end assertion also rejects a trailing newline.
    subjectAlternativeName: `^${trust.signer.identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\s\\S])`,
  };
}

function requireEncoding(value: unknown): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.from(value, "base64").toString("base64") !== value
  ) {
    throw new Error("noncanonical or empty base64 encoding");
  }
}

/** Read only supported claim locations from the already authenticated Statement. */
function claimsAnchoring(statement: Record<string, unknown>): boolean {
  const predicate = statement.predicate;
  const metadata =
    record(predicate) && record(predicate.metadata) ? predicate.metadata : {};
  let anchored = false;
  for (const claims of [statement, metadata]) {
    if (claims.signing_mode !== undefined) {
      if (
        claims.signing_mode !== "rekor_production" &&
        claims.signing_mode !== "sigstore_staging"
      ) {
        throw new Error("unsupported signed signing_mode claim");
      }
      anchored = true;
    }
    if (
      ["rekor_log_index", "rekor_log_indices", "rekor_url"].some(
        (key) => Object.hasOwn(claims, key) && claims[key] !== null,
      )
    )
      anchored = true;
  }
  return anchored;
}

/**
 * Structural consistency only, after Sigstore authenticates this exact note.
 * Wire format: transparency-dev/formats@1973a275, log/README.md (first 3 lines).
 * Never replace the vetted checkpoint signature or Merkle verification with this.
 */
function requireCheckpointConsistency(
  proof: NonNullable<SignedEntity["tlogEntries"][number]["inclusionProof"]>,
): void {
  const lines = proof.checkpoint!.envelope.split("\n");
  const size = lines[1];
  const root = lines[2];
  const decimal = /^(0|[1-9][0-9]*)$/;
  if (
    size === undefined ||
    !decimal.test(size) ||
    !decimal.test(proof.treeSize)
  )
    throw new Error("noncanonical checkpoint or proof tree size");
  requireEncoding(root);
  if (
    BigInt(size) !== BigInt(proof.treeSize) ||
    !Buffer.from(root!, "base64").equals(proof.rootHash)
  ) {
    throw new Error("proof metadata does not match authenticated checkpoint");
  }
}

function requireEntryProofs(entity: SignedEntity): void {
  if (entity.tlogEntries.length === 0)
    throw new Error("missing transparency inclusion proof");
  const seen = new Set<string>();
  for (const entry of entity.tlogEntries) {
    if (!entry.inclusionProof?.checkpoint?.envelope)
      throw new Error("proof and signed checkpoint required");
    requireCheckpointConsistency(entry.inclusionProof);
    const identity = `${entry.logId.keyId.toString("hex")}:${entry.canonicalizedBody.toString("base64")}`;
    if (seen.has(identity)) throw new Error("duplicate transparency entry");
    seen.add(identity);
    // The pinned verifier has already authenticated every entry and rejects
    // invalid/unknown/duplicate extras; this adds the stronger proof requirement.
  }
}

/**
 * Offline verifier used by the enforcing Action entry. No network I/O.
 * The Sigstore library performs signature, chain, log-body and checkpoint math.
 */
export function verifyRow(
  bundleJson: string,
  trust: RowTrustPolicy,
): VerifiedRow {
  if (Buffer.byteLength(bundleJson) > MAX_ROW_BYTES)
    throw new Error("evidence row exceeds size limit");
  const serialized: unknown = JSON.parse(bundleJson);
  if (!record(serialized))
    throw new Error("evidence must be a Sigstore bundle");
  if (!record(serialized.dsseEnvelope))
    throw new Error("missing DSSE envelope");
  requireEncoding(serialized.dsseEnvelope.payload);
  const signatures = serialized.dsseEnvelope.signatures;
  if (!Array.isArray(signatures) || signatures.length !== 1)
    throw new Error("exactly one DSSE signature required");
  for (const signature of signatures) {
    if (!record(signature)) throw new Error("invalid DSSE signature");
    requireEncoding(signature.sig);
  }
  const bundle = bundleFromJSON(serialized);
  if (!isBundleWithDsseEnvelope(bundle))
    throw new Error("expected a signed DSSE statement");
  const envelope = bundle.content.dsseEnvelope;
  if (
    envelope.payloadType !== PAYLOAD_TYPE ||
    envelope.signatures.length !== 1 ||
    envelope.payload.length === 0
  ) {
    throw new Error("unsupported DSSE payload or signature count");
  }
  const entity = toSignedEntity(bundle);
  const policy = identityPolicy(trust);
  if (trust.signer.kind === "key") {
    if (
      entity.key.$case !== "public-key" ||
      entity.key.hint !== trust.signer.keyHint
    )
      throw new Error("unexpected signing key");
  } else if (entity.key.$case !== "certificate") {
    throw new Error("certificate identity required");
  }
  // Authenticate before using signed metadata. Any log entry is subsequently
  // required to carry an authenticated proof; this first check is not
  // a claim that all entries have been accepted.
  const signatureVerifier = new Verifier(trust.material, {
    tlogThreshold: 0,
    timestampThreshold: trust.signer.kind === "oidc" ? 1 : 0,
    ctlogThreshold: 1,
  });
  signatureVerifier.verify(entity, policy);
  const payloadBytes = Buffer.from(envelope.payload);
  const statement = requireStatement(payloadBytes);
  const requireInclusion =
    claimsAnchoring(statement) ||
    trust.signer.kind === "oidc" ||
    trust.signer.requireInclusion ||
    entity.tlogEntries.length > 0;
  if (requireInclusion) {
    requireEntryProofs(entity);
  }
  return {
    payloadBytes,
    statement,
    transparency: requireInclusion
      ? "verified-inclusion"
      : "private-unanchored",
  };
}
