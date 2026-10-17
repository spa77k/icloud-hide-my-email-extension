import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const e2e = process.argv.includes("--e2e");
const outdir = path.join(root, e2e ? "dist-e2e" : "dist");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    popup: "src/popup.ts",
  },
  outdir,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  define: {
    __E2E__: e2e ? "true" : "false",
  },
  sourcemap: false,
  minify: false,
  minifySyntax: true,
  logLevel: "info",
});

for (const file of ["popup.html", "popup.css"]) {
  await cp(path.join(root, "src", file), path.join(outdir, file));
}

await cp(path.join(root, "src", "_locales"), path.join(outdir, "_locales"), { recursive: true });

await cp(path.join(root, "icons"), path.join(outdir, "icons"), { recursive: true });

const manifest = JSON.parse(await readFile(path.join(root, "src", "manifest.json"), "utf8"));
if (e2e) {
  manifest.name = "iCloud Hide My Email (E2E)";
  manifest.host_permissions = ["http://127.0.0.1:4173/*"];
  for (const script of manifest.content_scripts) {
    script.matches = ["http://127.0.0.1:4173/*"];
  }
}
await writeFile(path.join(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`built ${e2e ? "E2E" : "production"} extension -> ${outdir}`);
