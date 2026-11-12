/**
 * Offline self-test producer. Ephemeral key stays in memory; no Fulcio, OIDC,
 * witnesses, public log writes, or production credentials. Not a deployment signer.
 */
import { generateKeyPairSync, sign } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { DSSEBundleBuilder } from "@sigstore/sign";
import { bundleToJSON } from "@sigstore/bundle";

const { values, positionals } = parseArgs({
  options: { "out-dir": { type: "string" } },
  allowPositionals: true,
});
if (!values["out-dir"] || positionals.length === 0)
  throw new Error(
    "usage: sign-local-evidence --out-dir DIR statement-array.json [...]",
  );
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKeyPem = keys.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const keyHint = "ephemeral-self-test-key";
const builder = new DSSEBundleBuilder({
  signer: {
    async sign(data) {
      return {
        signature: sign("sha256", data, keys.privateKey),
        key: { $case: "publicKey", publicKey: publicKeyPem, hint: keyHint },
      };
    },
  },
  witnesses: [],
});
const now = Date.now();
const policy = {
  kind: "key",
  keyHint,
  publicKeyPem,
  status: "active",
  notBefore: new Date(now - 60_000).toISOString(),
  notAfter: new Date(now + 3_600_000).toISOString(),
  requireInclusion: false,
};
const outputs = new Map();
for (const input of positionals) {
  const rows = JSON.parse(readFileSync(input, "utf8"));
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 256)
    throw new Error(
      "self-test input must be a nonempty bounded Statement array",
    );
  const signed = [];
  for (const row of rows) {
    if (row?._type !== "https://in-toto.io/Statement/v1")
      throw new Error(
        "self-test producer requires precomposed in-toto v1 Statements",
      );
    // The vetted builder owns DSSE pre-auth encoding and bundle construction.
    signed.push(
      bundleToJSON(
        await builder.create({
          data: Buffer.from(JSON.stringify(row)),
          type: "application/vnd.in-toto+json",
        }),
      ),
    );
  }
  const name = `${basename(input, ".json")}.signed.json`;
  if (outputs.has(name)) throw new Error("duplicate self-test output name");
  outputs.set(name, { format: "sigstore-dsse-rows/v1", rows: signed });
}
mkdirSync(values["out-dir"], { recursive: true });
for (const [name, value] of outputs)
  writeFileSync(join(values["out-dir"], name), `${JSON.stringify(value)}\n`);
writeFileSync(
  join(values["out-dir"], "trust.json"),
  `${JSON.stringify(policy)}\n`,
);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `verification-policy=${JSON.stringify(policy)}\n`,
  );
