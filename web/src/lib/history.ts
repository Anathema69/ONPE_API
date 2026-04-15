/**
 * Lee el CSV historico del scraper en build time y devuelve una serie
 * ordenada cronologicamente. El CSV vive en ../../data/onpe_history.csv
 * relativo a la carpeta web/.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { csvParse } from "d3-dsv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, "../../../data/onpe_history.csv");

export type Row = {
  capturadoEn: string;
  actualizadoAl: string;
  pctActas: number;
  totalActas: number | null;
  posicion: number;
  candidato: string;
  agrupacion: string;
  votosValidos: number | null;
  pctVotos: number | null;
  fuente: "api" | "wayback" | "manual";
};

export type Snapshot = {
  actualizadoAl: string;
  timestamp: Date;
  pctActas: number;
  totalActas: number | null;
  fuente: Row["fuente"];
  top: Array<Pick<Row, "posicion" | "candidato" | "agrupacion" | "votosValidos" | "pctVotos">>;
};

function classify(capturadoEn: string): Row["fuente"] {
  if (capturadoEn.includes("(manual)"))  return "manual";
  if (capturadoEn.includes("(wayback)")) return "wayback";
  return "api";
}

function num(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function loadRows(): Row[] {
  const raw = readFileSync(CSV_PATH, "utf-8");
  const parsed = csvParse(raw);
  return parsed.map((r) => ({
    capturadoEn: r.capturadoEn ?? "",
    actualizadoAl: r.actualizadoAl ?? "",
    pctActas: num(r.pctActasContabilizadas ?? "") ?? 0,
    totalActas: num(r.totalActas ?? ""),
    posicion: Number(r.posicion ?? 0),
    candidato: r.candidato ?? "",
    agrupacion: r.agrupacion ?? "",
    votosValidos: num(r.votosValidos ?? ""),
    pctVotos: num(r.pctVotosValidos ?? ""),
    fuente: classify(r.capturadoEn ?? ""),
  }));
}

export function loadSnapshots(): Snapshot[] {
  const rows = loadRows();
  const bySnap = new Map<string, Snapshot>();
  for (const r of rows) {
    if (!r.actualizadoAl) continue;
    let snap = bySnap.get(r.actualizadoAl);
    if (!snap) {
      snap = {
        actualizadoAl: r.actualizadoAl,
        timestamp: new Date(r.actualizadoAl),
        pctActas: r.pctActas,
        totalActas: r.totalActas,
        fuente: r.fuente,
        top: [],
      };
      bySnap.set(r.actualizadoAl, snap);
    }
    snap.top.push({
      posicion: r.posicion,
      candidato: r.candidato,
      agrupacion: r.agrupacion,
      votosValidos: r.votosValidos,
      pctVotos: r.pctVotos,
    });
  }
  const snaps = Array.from(bySnap.values()).sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  for (const s of snaps) s.top.sort((a, b) => a.posicion - b.posicion);
  return snaps;
}

export function latest(): Snapshot {
  const snaps = loadSnapshots();
  return snaps[snaps.length - 1];
}

/** Serie long-format para plotting: un row por (snapshot, candidato). */
export function longSeries(): Array<{
  timestamp: Date;
  pctActas: number;
  candidato: string;
  agrupacion: string;
  pctVotos: number | null;
  votosValidos: number | null;
  fuente: string;
}> {
  const snaps = loadSnapshots();
  const out = [];
  for (const s of snaps) {
    for (const c of s.top) {
      out.push({
        timestamp: s.timestamp,
        pctActas: s.pctActas,
        candidato: c.candidato,
        agrupacion: c.agrupacion,
        pctVotos: c.pctVotos,
        votosValidos: c.votosValidos,
        fuente: s.fuente,
      });
    }
  }
  return out;
}

/** Top 5 candidatos estables a lo largo de toda la serie (unicos, por ultima aparicion). */
export function stableTop5Names(): string[] {
  const snaps = loadSnapshots();
  const last = snaps[snaps.length - 1];
  return last.top.slice(0, 5).map((c) => c.candidato);
}
