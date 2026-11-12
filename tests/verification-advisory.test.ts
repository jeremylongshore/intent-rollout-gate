import { readFileSync } from "node:fs";
import { SKILL_REFINER_PASS_V1_URI } from "@intentsolutions/core";
import { describe, expect, it } from "vitest";
import { extractRefinerPassRows, stripRefinerPassRows } from "../src/run";
import { verifyRow } from "../src/verification/verify-row";
import { signedFixture } from "./verification-private-fixture";

function advisoryStatement() {
  const rows = JSON.parse(
    readFileSync(
      new URL("./fixtures/evidence/refiner-pass-bundle.json", import.meta.url),
      "utf8",
    ),
  ) as Array<Record<string, unknown>>;
  return rows.find((row) => row.predicateType === SKILL_REFINER_PASS_V1_URI)!;
}
describe("signed advisory authentication without a new schema veto", () => {
  it("authenticates valid refiner rows using result snapshot binding and preserves advisory stripping", () => {
    const fixture = signedFixture(advisoryStatement());
    const verified = verifyRow(JSON.stringify(fixture.bundle), fixture.trust);
    expect(extractRefinerPassRows([verified.statement])).toHaveLength(1);
    expect(stripRefinerPassRows([verified.statement])).toEqual([]);
  });
  it("authenticates malformed advisory bodies but preserves their existing nondisplay behavior", () => {
    const fixture = signedFixture({
      ...advisoryStatement(),
      predicate: { malformed: true },
    });
    const verified = verifyRow(JSON.stringify(fixture.bundle), fixture.trust);
    expect(extractRefinerPassRows([verified.statement])).toEqual([]);
    expect(stripRefinerPassRows([verified.statement])).toEqual([]);
  });
  it("rejects a valid refiner predicate whose signed subject binds the wrong artifact", () => {
    const fixture = signedFixture({
      ...advisoryStatement(),
      subject: [{ name: "synth-refiner", digest: { sha256: "a".repeat(64) } }],
    });
    expect(() =>
      verifyRow(JSON.stringify(fixture.bundle), fixture.trust),
    ).toThrow("refiner subject does not bind result snapshot");
  });
  it("does not waive authentication for a malformed advisory body", () => {
    const fixture = signedFixture({
      ...advisoryStatement(),
      predicate: { malformed: true },
    });
    expect(() =>
      verifyRow(JSON.stringify(fixture.bundle), signedFixture().trust),
    ).toThrow();
  });
});
