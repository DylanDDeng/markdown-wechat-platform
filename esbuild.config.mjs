import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

const watch = process.argv.includes("--watch");
const outdir = "dist";

function copyStaticFiles() {
  fs.mkdirSync(outdir, { recursive: true });
  fs.copyFileSync("manifest.json", path.join(outdir, "manifest.json"));
  if (fs.existsSync("styles.css")) {
    fs.copyFileSync("styles.css", path.join(outdir, "styles.css"));
  }
}

const options = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2018",
  sourcemap: watch ? "inline" : false,
  external: ["obsidian"],
  outfile: path.join(outdir, "main.js"),
  logLevel: "info",
  plugins: [
    {
      name: "copy-static-files",
      setup(build) {
        build.onEnd(() => copyStaticFiles());
      }
    }
  ]
};

copyStaticFiles();

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  // Keep the process alive.
  // eslint-disable-next-line no-constant-condition
  while (true) await new Promise((r) => setTimeout(r, 1000));
} else {
  await esbuild.build(options);
}
