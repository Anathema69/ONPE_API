// Copia el CSV historico + JSON del corte actual a public/data/ para que
// Vite los sirva como assets estaticos. Se ejecuta en prebuild/predev.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, "../../data");
const destDir = resolve(__dirname, "../public/data");

mkdirSync(destDir, { recursive: true });

for (const file of ["onpe_history.csv", "onpe_latest.json"]) {
  const src = resolve(srcDir, file);
  if (!existsSync(src)) {
    console.warn(`[copy-data] ${file} no encontrado en ${src}; continuando.`);
    continue;
  }
  const dest = resolve(destDir, file);
  copyFileSync(src, dest);
  console.log(`[copy-data] ${src} -> ${dest}`);
}
