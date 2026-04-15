// Copia el CSV historico del scraper a public/data/ para que el build
// de Vite lo sirva como asset estatico. Se ejecuta en prebuild/predev.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "../../data/onpe_history.csv");
const destDir = resolve(__dirname, "../public/data");
const dest = resolve(destDir, "onpe_history.csv");

if (!existsSync(src)) {
  console.warn(`[copy-data] CSV no encontrado en ${src}; continuando sin data.`);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-data] ${src} -> ${dest}`);
