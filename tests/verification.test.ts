import { signedFixture } from "./verification-private-fixture";
import { describe, expect, it } from "vitest";
import { statement } from "./verification-statement";
import { verifyRow, type RowTrustPolicy } from "../src/verification/verify-row";

describe("offline signed row boundary", () => {
  it("verifies real P256 signature and preserves exact payload bytes without optional metadata", () => {
    const fixture = signedFixture();
    const result = verifyRow(JSON.stringify(fixture.bundle), fixture.trust);
    expect(result.payloadBytes).toEqual(fixture.payload);
    expect(result.statement).toEqual(statement());
    expect(result.transparency).toBe("private-unanchored");
  });

  it("rejects a signature under an unrelated externally trusted key", () => {
    const fixture = signedFixture();
    const other = signedFixture();
    expect(() =>
      verifyRow(JSON.stringify(fixture.bundle), other.trust),
    ).toThrow();
  });

  it.each(["payload", "signature"])("rejects altered %s bytes", (part) => {
    const fixture = signedFixture();
    const serialized = JSON.parse(JSON.stringify(fixture.bundle)) as {
      dsseEnvelope: { payload: string; signatures: Array<{ sig: string }> };
    };
    if (part === "payload") {
      serialized.dsseEnvelope.payload = Buffer.from(
        JSON.stringify({ ...statement(), extra: "tampered" }),
      ).toString("base64");
    } else {
      serialized.dsseEnvelope.signatures[0]!.sig =
        Buffer.from("invalid signature").toString("base64");
    }
    expect(() =>
      verifyRow(JSON.stringify(serialized), fixture.trust),
    ).toThrow();
  });

  it.each(["", "not base64!", "YQ==="])(
    "rejects noncanonical signature encoding %s",
    (signature) => {
      const fixture = signedFixture();
      const serialized = JSON.parse(JSON.stringify(fixture.bundle)) as {
        dsseEnvelope: { signatures: Array<{ sig: string }> };
      };
      serialized.dsseEnvelope.signatures[0]!.sig = signature;
      expect(() =>
        verifyRow(JSON.stringify(serialized), fixture.trust),
      ).toThrow("noncanonical or empty base64 encoding");
    },
  );

  it.each(["a", "c"])(
    "rejects duplicate matching gate subjects even with digest %s",
    (digest) => {
      const value = statement();
      value.subject.push({
        name: value.predicate.gate_id,
        digest: { sha256: digest.repeat(64) },
      });
      const fixture = signedFixture(value);
      expect(() =>
        verifyRow(JSON.stringify(fixture.bundle), fixture.trust),
      ).toThrow("ambiguous or missing gate subject");
    },
  );

  it("preserves unrelated extra subjects", () => {
    const value = statement();
    value.subject.push({
      name: "synth-tool:ci:synth-gate-2",
      digest: { sha256: "c".repeat(64) },
    });
    const fixture = signedFixture(value);
    expect(
      verifyRow(JSON.stringify(fixture.bundle), fixture.trust).statement,
    ).toEqual(value);
  });

  it("requires inclusion for authenticated predicate metadata claims", () => {
    const value = statement();
    const fixture = signedFixture({
      ...value,
      predicate: {
        ...value.predicate,
        metadata: { signing_mode: "rekor_production" },
      },
    });
    expect(() =>
      verifyRow(JSON.stringify(fixture.bundle), fixture.trust),
    ).toThrow("missing transparency inclusion proof");
  });

  it("validates later signed claims even when an earlier claim demands anchoring", () => {
    const value = statement();
    const fixture = signedFixture({
      ...value,
      signing_mode: "rekor_production",
      predicate: {
        ...value.predicate,
        metadata: { signing_mode: "unsupported" },
      },
    });
    expect(() =>
      verifyRow(JSON.stringify(fixture.bundle), fixture.trust),
    ).toThrow("unsupported signed signing_mode claim");
  });

  it("rejects unsigned Statements", () => {
    expect(() =>
      verifyRow(JSON.stringify(statement()), signedFixture().trust),
    ).toThrow();
  });

  it("does not downgrade a claimed anchored row to private verification", () => {
    const fixture = signedFixture({ ...statement(), rekor_log_index: 7 });
    expect(() =>
      verifyRow(JSON.stringify(fixture.bundle), fixture.trust),
    ).toThrow("missing transparency inclusion proof");
  });

  it("requires a certificate when OIDC identity is configured", () => {
    const fixture = signedFixture();
    const trust: RowTrustPolicy = {
      ...fixture.trust,
      signer: {
        kind: "oidc",
        issuer: "https://issuer.invalid",
        identity: "https://workflow.invalid/synthetic",
      },
    };
    expect(() => verifyRow(JSON.stringify(fixture.bundle), trust)).toThrow(
      "certificate identity required",
    );
  });

  it("rejects a correctly signed but mismatched subject digest", () => {
    const value = statement();
    value.subject[0]!.digest.sha256 = "c".repeat(64);
    const fixture = signedFixture(value);
    expect(() =>
      verifyRow(JSON.stringify(fixture.bundle), fixture.trust),
    ).toThrow("subject identity or digest mismatch");
  });

  it("rejects a correctly signed nested Statement instead of unwrapping it", () => {
    const value = { ...statement(), predicate: statement() };
    const fixture = signedFixture(value);
    expect(() =>
      verifyRow(JSON.stringify(fixture.bundle), fixture.trust),
    ).toThrow();
  });

  it("rejects a correctly signed unsupported predicate URI", () => {
    const value = {
      ...statement(),
      predicateType: "https://invalid.example/unsupported",
    };
    const fixture = signedFixture(value);
    expect(() =>
      verifyRow(JSON.stringify(fixture.bundle), fixture.trust),
    ).toThrow("unsupported evidence statement");
  });
});
