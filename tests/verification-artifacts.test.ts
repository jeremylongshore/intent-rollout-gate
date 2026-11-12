import { describe, expect, it } from "vitest";
import { verifyArtifactSet } from "../src/verification/verify-artifacts";
import { signedFixture } from "./verification-private-fixture";
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));

describe("all rows authenticate before artifact-set consumption", () => {
  it("preserves authenticated bytes and leaves caller input untouched", () => {
    const fixture = signedFixture();
    const input = bytes({
      format: "sigstore-dsse-rows/v1",
      rows: [fixture.bundle],
    });
    const original = Buffer.from(input);
    const rows = verifyArtifactSet(input, fixture.trust);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payloadBytes).toEqual(fixture.payload);
    expect(input).toEqual(original);
  });
  it("rejects mixed valid/unsigned rows without returning a verified subset", () => {
    const fixture = signedFixture();
    const input = bytes({
      format: "sigstore-dsse-rows/v1",
      rows: [fixture.bundle, {}],
    });
    expect(() => verifyArtifactSet(input, fixture.trust)).toThrow();
  });
  it.each([
    [],
    { format: "sigstore-dsse-rows/v1", rows: [] },
    { rows: [] },
    { format: "sigstore-dsse-rows/v1", rows: [null], trust: {} },
  ])("rejects unsupported/empty container %#", (value) => {
    expect(() =>
      verifyArtifactSet(bytes(value), signedFixture().trust),
    ).toThrow();
  });
  it("rejects invalid UTF8 and oversized input before JSON parsing", () => {
    const trust = signedFixture().trust;
    expect(() => verifyArtifactSet(Buffer.from([0xff]), trust)).toThrow();
    expect(() =>
      verifyArtifactSet(Buffer.alloc(16 * 1024 * 1024 + 1), trust),
    ).toThrow("size limit");
  });
});
