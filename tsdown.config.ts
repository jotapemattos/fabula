import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "neutral",
  target: "es2022",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  // ADR 13: declarations are emitted by tsc, not by isolated declarations —
  // Effect's inferred types are hostile to the latter.
  dts: true,
  // effect is a peer dependency and must never be bundled (ADR 14).
  deps: { neverBundle: [/^effect(\/|$)/, /^@effect\//] },
});
