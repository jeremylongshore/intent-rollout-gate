import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TrustedRoot } from "@sigstore/protobuf-specs";
import { loggedFixture } from "./verification-log-fixture";
import type { TrustMaterial } from "@sigstore/verify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTrustedRoot } from "@sigstore/tuf";
import {
  loadTrustedPolicy,
  NIGHTLY_IDENTITY,
} from "../src/verification/trusted-loader";
import { verifyRow } from "../src/verification/verify-row";
import { signedFixture } from "./verification-private-fixture";

// Only root acquisition is stubbed: cryptographic verification stays real.
vi.mock("@sigstore/tuf", () => ({ getTrustedRoot: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
function enrollment(fixture: Pick<ReturnType<typeof signedFixture>, "trust">) {
  return {
    kind: "key",
    keyHint: "synthetic-key",
    status: "active",
    publicKeyPem: fixture.trust.material
      .publicKey("synthetic-key")
      .publicKey.export({ type: "spki", format: "pem" })
      .toString(),
    notBefore: "2020-01-01T00:00:00Z",
    notAfter: "2099-01-01T00:00:00Z",
    requireInclusion: false,
  };
}

function syntheticTrustedRoot(material: TrustMaterial) {
  const log = (authority: TrustMaterial["tlogs"][number]) => ({
    baseUrl: authority.baseURL,
    hashAlgorithm: "SHA2_256",
    logId: { keyId: authority.logID.toString("base64") },
    publicKey: {
      rawBytes: authority.publicKey
        .export({ type: "spki", format: "der" })
        .toString("base64"),
      keyDetails: "PKIX_ECDSA_P256_SHA_256",
      validFor: {
        start: authority.validFor.start.toISOString(),
        end: authority.validFor.end.toISOString(),
      },
    },
  });
  return TrustedRoot.fromJSON({
    mediaType: "application/vnd.dev.sigstore.trustedroot+json;version=0.1",
    tlogs: material.tlogs.map(log),
    ctlogs: material.ctlogs.map(log),
    timestampAuthorities: [],
    certificateAuthorities: material.certificateAuthorities.map(
      (authority) => ({
        uri: "https://synthetic-ca.invalid",
        certChain: {
          certificates: authority.certChain.map((cert) => ({
            rawBytes: cert.root.toDER().toString("base64"),
          })),
        },
        validFor: {
          start: authority.validFor.start.toISOString(),
          end: authority.validFor.end.toISOString(),
        },
      }),
    ),
  });
}

describe("externally trusted material loading", () => {
  it.each([false, true])(
    "loads real synthetic trusted roots and verifies anchored evidence (keyless=%s)",
    async (keyless) => {
      const fixture = await loggedFixture({ keyless });
      vi.mocked(getTrustedRoot).mockResolvedValueOnce(
        syntheticTrustedRoot(fixture.trust.material),
      );
      const configuration = keyless
        ? {
            kind: "oidc",
            issuer: "https://issuer.invalid",
            identity: "https://workflow.invalid/synthetic",
          }
        : { ...enrollment(fixture), requireInclusion: true };
      const trust = await loadTrustedPolicy(configuration);
      expect(verifyRow(fixture.json(), trust).transparency).toBe(
        "verified-inclusion",
      );
      expect(getTrustedRoot).toHaveBeenCalledWith({
        cachePath: expect.any(String),
        retry: 0,
        timeout: 5000,
        forceCache: false,
      });
    },
  );
  it("admits an active enrolled public key and verifies its real signature", async () => {
    const fixture = signedFixture();
    const trust = await loadTrustedPolicy(enrollment(fixture));
    expect(
      verifyRow(JSON.stringify(fixture.bundle), trust).payloadBytes,
    ).toEqual(fixture.payload);
    expect(getTrustedRoot).not.toHaveBeenCalled();
    expect(trust.signer).toMatchObject({
      publicKeySpkiSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
  it.each(["revoked", "disabled"])(
    "rejects a %s key before verification",
    async (status) => {
      const fixture = signedFixture();
      await expect(
        loadTrustedPolicy({ ...enrollment(fixture), status }),
      ).rejects.toThrow("not currently authorized");
    },
  );
  it.each([
    { notBefore: "2100-01-01T00:00:00Z", notAfter: "2101-01-01T00:00:00Z" },
    { notBefore: "2000-01-01T00:00:00Z", notAfter: "2001-01-01T00:00:00Z" },
    { notBefore: "2099-01-01T00:00:00Z", notAfter: "2020-01-01T00:00:00Z" },
  ])("rejects unauthorized current validity interval %#", async (interval) => {
    await expect(
      loadTrustedPolicy({ ...enrollment(signedFixture()), ...interval }),
    ).rejects.toThrow("not currently authorized");
  });
  it("rechecks current validity at key lookup rather than trusting a row's evaluation date", async () => {
    const fixture = signedFixture();
    const trust = await loadTrustedPolicy(enrollment(fixture));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2100-01-01T00:00:00Z"));
    expect(() => verifyRow(JSON.stringify(fixture.bundle), trust)).toThrow(
      "not currently authorized",
    );
  });
  it("rejects an unknown evidence key hint despite a valid signature", async () => {
    const fixture = signedFixture();
    const trust = await loadTrustedPolicy(enrollment(fixture));
    const input = JSON.parse(JSON.stringify(fixture.bundle)) as {
      verificationMaterial: { publicKey: { hint: string } };
    };
    input.verificationMaterial.publicKey.hint = "not-enrolled";
    expect(() => verifyRow(JSON.stringify(input), trust)).toThrow(
      "unexpected signing key",
    );
  });
  it("requires authenticated TUF roots for an enrolled key's anchored profile", async () => {
    vi.mocked(getTrustedRoot).mockRejectedValueOnce(
      new Error("synthetic TUF failure"),
    );
    await expect(
      loadTrustedPolicy({
        ...enrollment(signedFixture()),
        requireInclusion: true,
      }),
    ).rejects.toThrow("synthetic TUF failure");
  });
  it("fails on public TUF acquisition error without private fallback", async () => {
    vi.mocked(getTrustedRoot).mockRejectedValueOnce(
      new Error("synthetic expired TUF metadata"),
    );
    await expect(loadTrustedPolicy(NIGHTLY_IDENTITY)).rejects.toThrow(
      "expired TUF",
    );
    expect(getTrustedRoot).toHaveBeenCalledWith({
      cachePath: expect.any(String),
      retry: 0,
      timeout: 5000,
      forceCache: false,
    });
  });
  it("rejects evidence-controlled root override options", async () => {
    await expect(
      loadTrustedPolicy({
        ...NIGHTLY_IDENTITY,
        rootPath: "/untrusted/root.json",
      }),
    ).rejects.toThrow();
    expect(getTrustedRoot).not.toHaveBeenCalled();
  });
});

describe("TUF bootstrap cache isolation", () => {
  it("uses a fresh owner-only empty directory for every acquisition rather than ambient poisoned state", async () => {
    const persistent = mkdtempSync(join(tmpdir(), "synthetic-persistent-tuf-"));
    const visited: string[] = [];
    try {
      writeFileSync(
        join(persistent, "root.json"),
        "synthetic poisoned cached root",
      );
      vi.stubEnv("XDG_DATA_HOME", persistent);
      const fixture = await loggedFixture({ keyless: true });
      for (let index = 0; index < 2; index++) {
        vi.mocked(getTrustedRoot).mockImplementationOnce(async (options) => {
          const cache = options?.cachePath;
          if (!cache) throw new Error("explicit isolated cache is required");
          expect(cache).not.toBe(persistent);
          expect(statSync(cache).mode & 0o777).toBe(0o700);
          expect(readdirSync(cache)).toEqual([]);
          visited.push(cache);
          writeFileSync(
            join(cache, "root.json"),
            "synthetic per-load cache state",
          );
          return syntheticTrustedRoot(fixture.trust.material);
        });
        await loadTrustedPolicy(NIGHTLY_IDENTITY);
        expect(existsSync(visited[index]!)).toBe(false);
      }
      expect(visited[0]).not.toBe(visited[1]);
      expect(existsSync(join(persistent, "root.json"))).toBe(true);
    } finally {
      rmSync(persistent, { recursive: true, force: true });
    }
  });
  it.each(["oidc", "anchored-key"])(
    "cleans failed %s root acquisition without private fallback",
    async (mode) => {
      let cache = "";
      vi.mocked(getTrustedRoot).mockImplementationOnce(async (options) => {
        cache = options?.cachePath ?? "";
        expect(existsSync(cache)).toBe(true);
        throw new Error("synthetic TUF acquisition failure");
      });
      const config =
        mode === "oidc"
          ? NIGHTLY_IDENTITY
          : { ...enrollment(signedFixture()), requireInclusion: true };
      await expect(loadTrustedPolicy(config)).rejects.toThrow(
        "synthetic TUF acquisition failure",
      );
      expect(cache).not.toBe("");
      expect(existsSync(cache)).toBe(false);
    },
  );
});
