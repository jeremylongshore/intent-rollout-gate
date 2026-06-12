/**
 * The published @intentsolutions/rollout-gate@2.0.0 ESM bundle carries an
 * esbuild dynamic-require shim that resolves `require` from scope at runtime.
 * Under vitest's native ESM import there is no `require` in module scope, so
 * we provide one globally for the test environment only. The committed
 * dist/index.js (CJS esbuild bundle) has a real `require` and does not need
 * this shim at action runtime.
 */
import { createRequire } from "node:module";

const g = globalThis as Record<string, unknown>;
if (typeof g.require === "undefined") {
  g.require = createRequire(import.meta.url);
}
