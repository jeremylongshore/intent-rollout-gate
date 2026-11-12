import { describe, expect, it } from "vitest";
import { verifyRow } from "../src/verification/verify-row";
import { loggedFixture } from "./verification-log-fixture";

describe("real offline inclusion and keyless verification", () => {
  it.each([false, true])(
    "verifies a real signed checkpoint and Merkle proof (keyless=%s)",
    async (keyless) => {
      const fixture = await loggedFixture({ keyless });
      const result = verifyRow(fixture.json(), fixture.trust);
      expect(result.payloadBytes).toEqual(fixture.payload);
      expect(result.transparency).toBe("verified-inclusion");
    },
  );

  it.each(["issuer", "identity"] as const)(
    "rejects the wrong externally configured %s",
    async (field) => {
      const fixture = await loggedFixture({ keyless: true });
      if (fixture.trust.signer.kind !== "oidc")
        throw new Error("fixture identity mismatch");
      fixture.trust.signer[field] = "https://wrong.invalid";
      expect(() => verifyRow(fixture.json(), fixture.trust)).toThrow();
    },
  );

  it("rejects a keyless certificate outside its authenticated signing-time interval", async () => {
    const fixture = await loggedFixture({
      keyless: true,
      logTimeOffsetMs: 3_600_000,
    });
    expect(fixture.certificateValidity).toBeDefined();
    expect(fixture.logTime.getTime()).toBeGreaterThan(
      fixture.certificateValidity!.notAfter.getTime(),
    );
    expect(fixture.certificateValidity!.notAfter.getTime()).toBeGreaterThan(
      fixture.certificateValidity!.notBefore.getTime(),
    );
    const entry = fixture.bundle.verificationMaterial.tlogEntries[0]!;
    expect(Number(entry.integratedTime) * 1000).toBe(fixture.logTime.getTime());
    expect(() => verifyRow(fixture.json(), fixture.trust)).toThrow();
  });

  it("does not accept a proof-only unauthenticated integratedTime as certificate signing time", async () => {
    const fixture = await loggedFixture({ keyless: true });
    fixture.bundle.verificationMaterial.tlogEntries[0]!.inclusionPromise =
      undefined;
    expect(() => verifyRow(fixture.json(), fixture.trust)).toThrow();
  });

  it("rejects an altered integratedTime even when the original proof still authenticates the body", async () => {
    const fixture = await loggedFixture({ keyless: true });
    const entry = fixture.bundle.verificationMaterial.tlogEntries[0]!;
    entry.integratedTime = String(Number(entry.integratedTime) + 1);
    expect(() => verifyRow(fixture.json(), fixture.trust)).toThrow();
  });

  it("rejects promise-only evidence despite a valid signature and authenticated timestamp", async () => {
    const fixture = await loggedFixture();
    expect(verifyRow(fixture.json(), fixture.trust).transparency).toBe(
      "verified-inclusion",
    );
    fixture.bundle.verificationMaterial.tlogEntries[0]!.inclusionProof =
      undefined;
    // Sigstore v0.3 rejects this shape before the adapter's stricter proof guard.
    expect(() => verifyRow(fixture.json(), fixture.trust)).toThrow(
      "invalid bundle",
    );
  });

  it.each([
    "root",
    "tree-size",
    "path",
    "index",
    "checkpoint",
    "body",
    "unknown-log",
  ] as const)("rejects invalid %s alongside a valid entry", async (fault) => {
    const fixture = await loggedFixture({ logCount: 2 });
    const [first, extra] = fixture.bundle.verificationMaterial.tlogEntries;
    expect(first!.logId!.keyId.equals(extra!.logId!.keyId)).toBe(false);
    // Establish acceptance of BOTH independent authorities before faulting one.
    expect(verifyRow(fixture.json(), fixture.trust).transparency).toBe(
      "verified-inclusion",
    );
    const bad = extra!;
    if (fault === "root")
      bad.inclusionProof!.rootHash[0] = bad.inclusionProof!.rootHash[0]! ^ 1;
    if (fault === "tree-size") bad.inclusionProof!.treeSize = "2";
    if (fault === "path") bad.inclusionProof!.hashes.push(Buffer.alloc(32, 9));
    if (fault === "index") bad.inclusionProof!.logIndex = "1";
    if (fault === "checkpoint")
      bad.inclusionProof!.checkpoint!.envelope = "invalid checkpoint";
    if (fault === "body")
      bad.canonicalizedBody[0] = bad.canonicalizedBody[0]! ^ 1;
    if (fault === "unknown-log") bad.logId!.keyId = Buffer.alloc(32, 7);
    expect(() => verifyRow(fixture.json(), fixture.trust)).toThrow();
  });

  it("rejects duplicate valid log bodies independently of timestamp de-duplication", async () => {
    const fixture = await loggedFixture();
    const entry = fixture.bundle.verificationMaterial.tlogEntries[0]!;
    fixture.bundle.verificationMaterial.tlogEntries.push({
      ...entry,
      inclusionPromise: undefined,
    });
    expect(() => verifyRow(fixture.json(), fixture.trust)).toThrow(
      "duplicate tlog entry",
    );
  });

  it("rejects a keyless certificate under an untrusted CA", async () => {
    const fixture = await loggedFixture({ keyless: true });
    fixture.trust.material.certificateAuthorities = [];
    expect(() => verifyRow(fixture.json(), fixture.trust)).toThrow();
  });
});

describe("literal trusted keyless identities", () => {
  it.each([
    "https://workflow.invalid/synthetic-evil",
    "https://workflowXinvalid/synthetic",
    "https://workflow.invalid/synthetic\n",
  ])(
    "rejects a genuinely signed near-match SAN %j",
    async (certificateIdentity) => {
      const fixture = await loggedFixture({
        keyless: true,
        certificateIdentity,
      });
      expect(() => verifyRow(fixture.json(), fixture.trust)).toThrow(
        /certificate identity error/,
      );
    },
  );
  it("accepts an exact SAN containing regex metacharacters literally", async () => {
    const identity = "https://workflow.invalid/a+b(c)[d]$^?x={y}|z";
    const fixture = await loggedFixture({
      keyless: true,
      certificateIdentity: identity,
    });
    if (fixture.trust.signer.kind !== "oidc")
      throw new Error("expected OIDC fixture");
    fixture.trust.signer.identity = identity;
    expect(verifyRow(fixture.json(), fixture.trust).transparency).toBe(
      "verified-inclusion",
    );
  });
});
