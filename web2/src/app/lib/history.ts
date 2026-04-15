/**
 * Carga el CSV historico del scraper (copiado a /data/onpe_history.csv
 * por el script prebuild) y expone estructuras listas para el Dashboard.
 *
 * El CSV vive en public/data/ asi que siempre es absoluta la URL /data/...
 */

export type Candidate = {
  id: string;
  name: string;
  party: string;
  votes: string;
  percent: number;
};

export type ConvergencePoint = { actas: number; [party: string]: number };

export type EvolutionSeries = Candidate & {
  history: Array<{ date: string; pct: number }>;
};

export type Scenario = { c1: string; c2: string; diff: number };

export type JeeInfo = {
  enviadasPct: number;
  enviadas: number;
  pendientesPct: number;
  pendientes: number;
  totalPct: number;
  totalActas: number;
} | null;

export type AppData = {
  updatedAt: Date;
  totalActas: number;
  pctActas: number;
  snapshotsCount: number;
  horasDeConteo: number;
  top5: Candidate[];
  convergenceData: ConvergencePoint[];
  evolutionData: EvolutionSeries[];
  scenarios: Scenario[];
  jee: JeeInfo;
};

type Row = {
  capturadoEn: string;
  actualizadoAl: string;
  pctActasContabilizadas: number;
  totalActas: number;
  posicion: number;
  candidato: string;
  agrupacion: string;
  votosValidos: number | null;
  pctVotosValidos: number | null;
};

export function shortName(full: string): string {
  const n = full.toUpperCase();
  if (n.includes("FUJIMORI")) return "Keiko Fujimori";
  if (n.includes("LÓPEZ ALIAGA") || n.includes("LOPEZ ALIAGA")) return "Rafael L. Aliaga";
  if (n.includes("NIETO")) return "Jorge Nieto";
  if (n.includes("SANCHEZ PALOMINO") || n.includes("SÁNCHEZ PALOMINO")) return "Roberto Sánchez";
  if (n.includes("BELMONT")) return "Ricardo Belmont";
  // fallback: primer nombre + último apellido en title case
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const tc = (s: string) => s[0] + s.slice(1).toLowerCase();
    return `${tc(parts[0])} ${tc(parts[parts.length - 1])}`;
  }
  return full;
}

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const idx = (k: string) => header.indexOf(k);
  const i = {
    capturadoEn: idx("capturadoEn"),
    actualizadoAl: idx("actualizadoAl"),
    pctActas: idx("pctActasContabilizadas"),
    totalActas: idx("totalActas"),
    posicion: idx("posicion"),
    candidato: idx("candidato"),
    agrupacion: idx("agrupacion"),
    votos: idx("votosValidos"),
    pct: idx("pctVotosValidos"),
  };

  const rows: Row[] = [];
  for (let n = 1; n < lines.length; n++) {
    const cols = splitCsvLine(lines[n]);
    if (cols.length < 5) continue;
    rows.push({
      capturadoEn: cols[i.capturadoEn] ?? "",
      actualizadoAl: cols[i.actualizadoAl] ?? "",
      pctActasContabilizadas: Number(cols[i.pctActas]) || 0,
      totalActas: Number(cols[i.totalActas]) || 0,
      posicion: Number(cols[i.posicion]) || 0,
      candidato: cols[i.candidato] ?? "",
      agrupacion: cols[i.agrupacion] ?? "",
      votosValidos: cols[i.votos] ? Number(cols[i.votos]) : null,
      pctVotosValidos: cols[i.pct] ? Number(cols[i.pct]) : null,
    });
  }
  return rows;
}

// parser de CSV mínimo con soporte para campos entrecomillados
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export async function loadData(): Promise<AppData> {
  const [csvResp, jsonResp] = await Promise.all([
    fetch("/data/onpe_history.csv", { cache: "no-cache" }),
    fetch("/data/onpe_latest.json", { cache: "no-cache" }),
  ]);
  if (!csvResp.ok) throw new Error(`No se pudo cargar onpe_history.csv (${csvResp.status})`);
  const text = await csvResp.text();
  const rows = parseCsv(text);

  let jee: JeeInfo = null;
  if (jsonResp.ok) {
    try {
      const snap = await jsonResp.json();
      const enviadasPct = Number(snap.porcentajeActasEnviadasJee);
      const pendientesPct = Number(snap.porcentajeActasPendientesJee);
      if (Number.isFinite(enviadasPct) || Number.isFinite(pendientesPct)) {
        const ePct = Number.isFinite(enviadasPct) ? enviadasPct : 0;
        const pPct = Number.isFinite(pendientesPct) ? pendientesPct : 0;
        const eN = Number(snap.actasEnviadasJee) || 0;
        const pN = Number(snap.actasPendientesJee) || 0;
        jee = {
          enviadasPct: ePct,
          enviadas: eN,
          pendientesPct: pPct,
          pendientes: pN,
          totalPct: +(ePct + pPct).toFixed(3),
          totalActas: eN + pN,
        };
      }
    } catch {
      // snapshot malformado: seguimos sin jee
    }
  }

  return shape(rows, jee);
}

function shape(rows: Row[], jee: JeeInfo): AppData {
  // agrupar filas por snapshot (actualizadoAl)
  const bySnap = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.actualizadoAl) continue;
    const key = r.actualizadoAl;
    let arr = bySnap.get(key);
    if (!arr) { arr = []; bySnap.set(key, arr); }
    arr.push(r);
  }

  const snaps = Array.from(bySnap.entries())
    .map(([actualizadoAl, rows]) => ({
      actualizadoAl,
      timestamp: new Date(actualizadoAl),
      pctActas: rows[0].pctActasContabilizadas,
      totalActas: rows[0].totalActas,
      rows: rows.slice().sort((a, b) => a.posicion - b.posicion),
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const first = snaps[0];
  const last = snaps[snaps.length - 1];

  // top5 actual
  const top5: Candidate[] = last.rows.slice(0, 5).map((r) => ({
    id: String(r.posicion).padStart(2, "0"),
    name: r.candidato,
    party: r.agrupacion,
    votes: r.votosValidos != null ? r.votosValidos.toLocaleString("es-PE") : "—",
    percent: r.pctVotosValidos ?? 0,
  }));

  // convergencia: de 52% en adelante, una fila por snapshot
  const UMBRAL = 52;
  const convergenceData: ConvergencePoint[] = snaps
    .filter((s) => s.pctActas >= UMBRAL)
    .map((s) => {
      const point: ConvergencePoint = { actas: Number(s.pctActas.toFixed(2)) };
      for (const c of top5) {
        const row = s.rows.find((r) => r.candidato === c.name);
        if (row && row.pctVotosValidos != null) {
          point[c.party] = row.pctVotosValidos;
        }
      }
      return point;
    });

  // evolucion: historial por candidato
  const evolutionData: EvolutionSeries[] = top5.map((c) => {
    const history = snaps
      .map((s) => {
        const row = s.rows.find((r) => r.candidato === c.name);
        if (!row || row.pctVotosValidos == null) return null;
        return {
          date: s.timestamp.toLocaleDateString("es-PE", {
            day: "2-digit", month: "short",
          }),
          pct: row.pctVotosValidos,
        };
      })
      .filter((x): x is { date: string; pct: number } => x !== null);
    return { ...c, history };
  });

  // escenarios: top 3 pares
  const top3 = top5.slice(0, 3);
  const scenarios: Scenario[] =
    top3.length >= 3
      ? [
          { c1: shortName(top3[0].name), c2: shortName(top3[1].name), diff: +(top3[0].percent - top3[1].percent).toFixed(2) },
          { c1: shortName(top3[0].name), c2: shortName(top3[2].name), diff: +(top3[0].percent - top3[2].percent).toFixed(2) },
          { c1: shortName(top3[1].name), c2: shortName(top3[2].name), diff: +(top3[1].percent - top3[2].percent).toFixed(2) },
        ]
      : [];

  const horas = (last.timestamp.getTime() - first.timestamp.getTime()) / 36e5;

  return {
    updatedAt: last.timestamp,
    totalActas: last.totalActas,
    pctActas: last.pctActas,
    snapshotsCount: snaps.length,
    horasDeConteo: +horas.toFixed(1),
    top5,
    convergenceData,
    evolutionData,
    scenarios,
    jee,
  };
}
