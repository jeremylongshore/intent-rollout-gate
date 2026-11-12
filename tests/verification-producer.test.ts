import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTrustedPolicy } from "../src/verification/trusted-loader";
import { verifyArtifactSet } from "../src/verification/verify-artifacts";
import { statement } from "./verification-statement";

function fixtureDirectory() {
  const dir = mkdtempSync(join(tmpdir(), "synthetic-producer-"));
  return { dir, input: join(dir, "rows.json"), out: join(dir, "signed") };
}
function runProducer(input: string, out: string) {
  // No real GitHub output file, credentials, endpoints or inherited signing config.
  return spawnSync(
    process.execPath,
    [
      "--import",
      "./tests/fixtures/deny-network.mjs",
      "scripts/sign-local-evidence.mjs",
      "--out-dir",
      out,
      input,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    },
  );
}
describe("vetted exact-Statement offline producer interoperability", () => {
  it("signs v1 gate_id Statements that the production verifier accepts without cosign rewriting", async () => {
    const f = fixtureDirectory();
    try {
      const row = statement();
      writeFileSync(f.input, JSON.stringify([row]));
      const result = runProducer(f.input, f.out);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout + result.stderr).not.toContain("PRIVATE KEY");
      const trust = await loadTrustedPolicy(
        JSON.parse(readFileSync(join(f.out, "trust.json"), "utf8")),
      );
      const rows = verifyArtifactSet(
        readFileSync(join(f.out, "rows.signed.json")),
        trust,
      );
      expect(rows[0]!.payloadBytes).toEqual(Buffer.from(JSON.stringify(row)));
      expect(rows[0]!.statement).toEqual(row);
      expect(rows[0]!.transparency).toBe("private-unanchored");
      expect(readdirSync(f.out).sort()).toEqual([
        "rows.signed.json",
        "trust.json",
      ]);
      expect(readFileSync(join(f.out, "trust.json"), "utf8")).not.toContain(
        "PRIVATE KEY",
      );
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  });
  it("rejects a pre-v1 Statement rather than silently changing its version or subject", () => {
    const f = fixtureDirectory();
    try {
      writeFileSync(
        f.input,
        JSON.stringify([
          { ...statement(), _type: "https://in-toto.io/Statement/v0.1" },
        ]),
      );
      const result = runProducer(f.input, f.out);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "requires precomposed in-toto v1 Statements",
      );
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  });
});
