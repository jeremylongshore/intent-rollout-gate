import { z } from "zod";
import { verifyRow, type RowTrustPolicy, type VerifiedRow } from "./verify-row";

export const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const containerSchema = z
  .object({
    format: z.literal("sigstore-dsse-rows/v1"),
    rows: z.array(z.unknown()).min(1).max(256),
  })
  .strict();

/**
 * All rows authenticate before any result is returned. Caller reads bytes once.
 * This new explicit format does not reinterpret current signed-metadata manifests
 * or unsigned legacy arrays. Existing published Action remains unchanged.
 */
export function verifyArtifactSet(
  bytes: Uint8Array,
  trust: RowTrustPolicy,
): readonly VerifiedRow[] {
  if (bytes.byteLength > MAX_ARTIFACT_BYTES)
    throw new Error("signed artifact set exceeds size limit");
  const input: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  const container = containerSchema.parse(input);
  return container.rows.map((row) => verifyRow(JSON.stringify(row), trust));
}
