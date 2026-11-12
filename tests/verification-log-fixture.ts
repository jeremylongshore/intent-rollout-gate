import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { bundleToJSON, toDSSEBundle } from "@sigstore/bundle";
import { dsse, X509Certificate } from "@sigstore/core";
import { initializeCA, initializeCTLog, initializeTLog } from "@sigstore/mock";
import type { RowTrustPolicy } from "../src/verification/verify-row";
import { statement } from "./verification-statement";

const ISSUER = "https://issuer.invalid";
const IDENTITY = "https://workflow.invalid/synthetic";
const LOG_URL = "https://offline-log.invalid";
const keyPair = () => generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const bytes = (view: ArrayBufferView<ArrayBuffer>): Buffer<ArrayBuffer> =>
  Buffer.from(view.buffer, view.byteOffset, view.byteLength);

/**
 * Only fixture construction signs data. These pinned upstream helpers construct
 * real certificates/SCTs/SETs/checkpoints; they perform no HTTP requests. The
 * application verifier remains the unmocked production Sigstore verifier.
 */
export async function loggedFixture(
  options: {
    keyless?: boolean;
    certificateIdentity?: string;
    logTimeOffsetMs?: number;
    logCount?: number;
  } = {},
) {
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const validFor = {
    start: new Date(now.getTime() - 86_400_000),
    end: new Date(now.getTime() + 86_400_000),
  };
  const signer = keyPair();
  const logTime = new Date(now.getTime() + (options.logTimeOffsetMs ?? 0));
  const payload = Buffer.from(JSON.stringify(statement()));
  const payloadType = "application/vnd.in-toto+json";
  const signature = sign(
    "sha256",
    dsse.preAuthEncoding(payloadType, payload),
    signer.privateKey,
  );
  const material: RowTrustPolicy["material"] = {
    certificateAuthorities: [],
    timestampAuthorities: [],
    ctlogs: [],
    tlogs: [],
    publicKey(hint) {
      if (hint !== "synthetic-key") throw new Error("untrusted key");
      return { publicKey: signer.publicKey, validFor: () => true };
    },
  };
  let certificate: Buffer<ArrayBuffer> | undefined;
  if (options.keyless) {
    const ctKeys = keyPair();
    const ct = await initializeCTLog(ctKeys, now);
    const ca = await initializeCA(
      keyPair(),
      ct,
      new Date(now.getTime() - 60_000),
    );
    certificate = bytes(
      await ca.issueCertificate({
        publicKey: signer.publicKey.export({ type: "spki", format: "der" }),
        subjectAltName: options.certificateIdentity ?? IDENTITY,
        extensions: [
          { oid: "1.3.6.1.4.1.57264.1.1", value: ISSUER, legacy: true },
        ],
      }),
    );
    material.certificateAuthorities.push({
      certChain: [X509Certificate.parse(bytes(ca.rootCertificate))],
      validFor,
    });
    material.ctlogs.push({
      logID: bytes(ct.logID),
      baseURL: "https://offline-ct.invalid",
      publicKey: ctKeys.publicKey,
      validFor,
    });
  }
  const bundle = toDSSEBundle({
    artifact: payload,
    artifactType: payloadType,
    signature,
    ...(certificate ? { certificate } : { keyHint: "synthetic-key" }),
  });
  for (let index = 0; index < (options.logCount ?? 1); index++) {
    const logKeys = keyPair();
    const url = index === 0 ? LOG_URL : `https://offline-log-${index}.invalid`;
    const log = await initializeTLog(url, logKeys, logTime);
    material.tlogs.push({
      logID: createHash("sha256").update(log.publicKey).digest(),
      baseURL: url,
      publicKey: logKeys.publicKey,
      validFor,
    });
    // Construct the accepted DSSE v0.0.1 log body (not a proposedContent request).
    const entries = await log.log({
      apiVersion: "0.0.1",
      kind: "dsse",
      spec: {
        signatures: [{ signature: signature.toString("base64") }],
        payloadHash: {
          algorithm: "sha256",
          value: createHash("sha256").update(payload).digest("hex"),
        },
      },
    });
    const entry = Object.values(entries)[0]!;
    const proof = entry.verification!.inclusionProof!;
    const signedTimestamp = entry.verification?.signedEntryTimestamp;
    if (!signedTimestamp)
      throw new Error("synthetic log omitted signed timestamp");
    bundle.verificationMaterial.tlogEntries.push({
      logIndex: String(entry.logIndex),
      integratedTime: String(entry.integratedTime),
      logId: { keyId: Buffer.from(entry.logID, "hex") },
      kindVersion: { kind: "dsse", version: "0.0.1" },
      canonicalizedBody: Buffer.from(entry.body, "base64"),
      inclusionPromise: {
        signedEntryTimestamp: Buffer.from(signedTimestamp, "base64"),
      },
      inclusionProof: {
        logIndex: String(proof.logIndex),
        treeSize: String(proof.treeSize),
        rootHash: Buffer.from(proof.rootHash, "hex"),
        hashes: proof.hashes.map((hash) => Buffer.from(hash, "hex")),
        checkpoint: { envelope: proof.checkpoint },
      },
    });
  }
  const trust: RowTrustPolicy = {
    material,
    signer: options.keyless
      ? { kind: "oidc", issuer: ISSUER, identity: IDENTITY }
      : { kind: "key", keyHint: "synthetic-key", requireInclusion: true },
  };
  return {
    bundle,
    trust,
    payload,
    logTime,
    certificateValidity: certificate
      ? {
          notBefore: X509Certificate.parse(certificate).notBefore,
          notAfter: X509Certificate.parse(certificate).notAfter,
        }
      : undefined,
    json: () => JSON.stringify(bundleToJSON(bundle)),
  };
}
