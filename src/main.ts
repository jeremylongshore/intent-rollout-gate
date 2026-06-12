/**
 * Action entrypoint — bundled to dist/index.js by esbuild (see package.json
 * `build` script). All behavior lives in run.ts so the wiring is unit-testable.
 */
import { run } from "./run";

void run();
