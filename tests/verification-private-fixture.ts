import { generateKeyPairSync, sign } from "node:crypto";
import { bundleToJSON, toDSSEBundle } from "@sigstore/bundle";
import { dsse } from "@sigstore/core";
import type { RowTrustPolicy } from "../src/verification/verify-row";
import { statement } from "./verification-statement";

/** Fixture-only signing; no OIDC endpoints, log writes or production trust roots. */
export function signedFixture(
  value: unknown = statement(),
  keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
) {
  const { privateKey, publicKey } = keys;
  const payload = Buffer.from(JSON.stringify(value));
  const payloadType = "application/vnd.in-toto+json";
  const signature = sign(
    "sha256",
    dsse.preAuthEncoding(payloadType, payload),
    privateKey,
  );
  const bundle = bundleToJSON(
    toDSSEBundle({
      artifact: payload,
      artifactType: payloadType,
      signature,
      keyHint: "synthetic-key",
    }),
  );
  const trust: RowTrustPolicy = {
    material: {
      certificateAuthorities: [],
      timestampAuthorities: [],
      ctlogs: [],
      tlogs: [],
      publicKey(hint) {
        if (hint !== "synthetic-key") throw new Error("untrusted key");
        return { publicKey, validFor: () => true };
      },
    },
    signer: { kind: "key", keyHint: "synthetic-key", requireInclusion: false },
  };
  return { bundle, trust, payload, keys };
}
