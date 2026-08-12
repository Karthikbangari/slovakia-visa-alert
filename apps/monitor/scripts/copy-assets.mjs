// Copies non-TypeScript runtime assets (SQL schema, selector JSON configs)
// into dist/ after tsc, since tsc only emits compiled .ts files.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const copies = [
  ["src/database/schema.sql", "dist/src/database/schema.sql"],
  ["src/providers/selectors/bls.selectors.json", "dist/src/providers/selectors/bls.selectors.json"],
  ["src/providers/selectors/vfs.selectors.json", "dist/src/providers/selectors/vfs.selectors.json"],
];

for (const [from, to] of copies) {
  const src = path.join(ROOT, from);
  const dest = path.join(ROOT, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`copied ${from} -> ${to}`);
}
