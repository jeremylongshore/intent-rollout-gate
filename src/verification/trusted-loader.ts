import { createHash, createPublicKey } from "node:crypto";
import { getTrustedRoot } from "@sigstore/tuf";
import { toTrustMaterial } from "@sigstore/verify";
import { z } from "zod";
import type { RowTrustPolicy } from "./verify-row";

const exactText = z
  .string()
  .min(1)
  .refine((value) => value === value.trim());
const privatePolicy = z
  .object({
    kind: z.literal("key"),
    keyHint: exactText,
    publicKeyPem: z.string().startsWith("-----BEGIN PUBLIC KEY-----"),
    status: z.enum(["active", "revoked", "disabled"]),
    notBefore: z.iso.datetime(),
    notAfter: z.iso.datetime(),
    requireInclusion: z.boolean(),
  })
  .strict();
const keylessPolicy = z
  .object({
    kind: z.literal("oidc"),
    issuer: z.url(),
    identity: z.url(),
  })
  .strict();
const policySchema = z.discriminatedUnion("kind", [
  privatePolicy,
  keylessPolicy,
]);

/** Existing operator-confirmed dashboard nightly trust, not manifest claims. */
export const NIGHTLY_IDENTITY = {
  kind: "oidc",
  issuer: "https://token.actions.githubusercontent.com",
  identity:
    "https://github.com/jeremylongshore/j-rig-skill-binary-eval/.github/workflows/nightly-skill-evals.yml@refs/heads/main",
} as const;

/**
 * Input MUST originate in trusted caller configuration, never the evidence file.
 * No evidence-controlled root/mirror/cache URL, key path, or verification bypass.
 * No historical private-key policy: admission checks the local clock NOW.
 */
export async function loadTrustedPolicy(
  configuration: unknown,
): Promise<RowTrustPolicy> {
  const config = policySchema.parse(configuration);
  if (config.kind === "oidc") {
    const root = await getTrustedRoot({
      retry: 0,
      timeout: 5000,
      forceCache: false,
    });
    return { material: toTrustMaterial(root), signer: config };
  }
  const start = Date.parse(config.notBefore);
  const end = Date.parse(config.notAfter);
  const activeAt = (date: Date) =>
    Number.isFinite(date.getTime()) &&
    start <= date.getTime() &&
    date.getTime() <= end;
  if (config.status !== "active" || start >= end || !activeAt(new Date()))
    throw new Error("private key is not currently authorized");
  const publicKey = createPublicKey(config.publicKeyPem);
  const publicKeySpkiSha256 = createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }))
    .digest("hex");
  const publicKeyLookup = (hint: string) => {
    if (hint !== config.keyHint || !activeAt(new Date()))
      throw new Error("private key is not currently authorized");
    return { publicKey, validFor: activeAt };
  };
  const material = config.requireInclusion
    ? toTrustMaterial(
        await getTrustedRoot({ retry: 0, timeout: 5000, forceCache: false }),
        publicKeyLookup,
      )
    : {
        certificateAuthorities: [],
        timestampAuthorities: [],
        ctlogs: [],
        tlogs: [],
        publicKey: publicKeyLookup,
      };
  return {
    material,
    signer: {
      kind: "key",
      keyHint: config.keyHint,
      requireInclusion: config.requireInclusion,
      publicKeySpkiSha256,
    },
  };
}
