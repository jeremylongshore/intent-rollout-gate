import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  return {
    ...actual,
    readSync: vi.fn(actual.readSync),
    closeSync: vi.fn(actual.closeSync),
  };
});
import {
  closeSync,
  mkdtempSync,
  readSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSignedArtifacts } from "../src/verification/read-artifacts";
import { MAX_ARTIFACT_BYTES } from "../src/verification/verify-artifacts";
let dir: string;
let path: string;
beforeEach(() => {
  vi.clearAllMocks();
  dir = mkdtempSync(join(tmpdir(), "synthetic-bounded-read-"));
  path = join(dir, "rows.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
describe("bounded signed artifact ingestion", () => {
  it("reads exact bytes and closes its descriptor", () => {
    writeFileSync(path, "signed bytes");
    expect(readSignedArtifacts(path).toString()).toBe("signed bytes");
    expect(closeSync).toHaveBeenCalledOnce();
  });
  it("continues after a legal short read and preserves exact bytes", async () => {
    writeFileSync(path, "signed bytes");
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(readSync).mockImplementationOnce(
      (...args: Parameters<typeof readSync>) =>
        actual.readSync(args[0], args[1], 0, 3, null),
    );
    expect(readSignedArtifacts(path).toString()).toBe("signed bytes");
    expect(readSync).toHaveBeenCalledTimes(3);
    expect(closeSync).toHaveBeenCalledOnce();
  });
  it("closes its descriptor when a content read fails", () => {
    writeFileSync(path, "signed bytes");
    vi.mocked(readSync).mockImplementationOnce(() => {
      throw new Error("synthetic read failure");
    });
    expect(() => readSignedArtifacts(path)).toThrow("synthetic read failure");
    expect(closeSync).toHaveBeenCalledOnce();
  });
  it("rejects an oversized regular file before reading any content", () => {
    writeFileSync(path, "");
    truncateSync(path, MAX_ARTIFACT_BYTES + 1);
    expect(() => readSignedArtifacts(path)).toThrow("size limit");
    expect(readSync).not.toHaveBeenCalled();
    expect(closeSync).toHaveBeenCalledOnce();
  });
  it("caps reads when a file grows after the size preflight", async () => {
    writeFileSync(path, "x");
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(readSync).mockImplementationOnce(
      (...args: Parameters<typeof readSync>) => {
        truncateSync(path, MAX_ARTIFACT_BYTES + 1);
        return actual.readSync(...args);
      },
    );
    expect(() => readSignedArtifacts(path)).toThrow("size limit");
    expect(readSync).toHaveBeenCalledTimes(1);
    expect(Array.from(vi.mocked(readSync).mock.calls[0]!)[3]).toBe(
      MAX_ARTIFACT_BYTES + 1,
    );
    expect(closeSync).toHaveBeenCalledOnce();
  });
  it("rejects nonregular inputs before reading and closes the opened descriptor", () => {
    expect(() => readSignedArtifacts(dir)).toThrow("regular file");
    expect(readSync).not.toHaveBeenCalled();
    expect(closeSync).toHaveBeenCalledOnce();
  });
  it("fails closed when an input cannot be opened", () => {
    expect(() => readSignedArtifacts(path)).toThrow();
    expect(readSync).not.toHaveBeenCalled();
    expect(closeSync).not.toHaveBeenCalled();
  });
});
