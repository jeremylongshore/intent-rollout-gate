import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { MAX_ARTIFACT_BYTES } from "./verify-artifacts";

/** Bounded descriptor read; never allocates the untrusted file's reported size. */
export function readSignedArtifacts(path: string): Buffer {
  // O_NONBLOCK prevents a path raced to a FIFO from blocking before fstat.
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile())
      throw new Error("signed artifact input must be a regular file");
    if (stat.size > MAX_ARTIFACT_BYTES)
      throw new Error("signed artifact set exceeds size limit");
    const buffer = Buffer.alloc(MAX_ARTIFACT_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > MAX_ARTIFACT_BYTES)
      throw new Error("signed artifact set exceeds size limit");
    return buffer.subarray(0, length);
  } finally {
    closeSync(fd);
  }
}
