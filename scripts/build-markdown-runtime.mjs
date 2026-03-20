import { build } from "esbuild";

await build({
  entryPoints: ["src/content/markdown-runtime-entry.mjs"],
  outfile: "src/content/markdown-runtime.bundle.js",
  bundle: true,
  format: "esm",
  minify: true,
  platform: "browser",
  target: ["chrome114"],
  logLevel: "info",
});
