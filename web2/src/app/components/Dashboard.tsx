import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceDot, ReferenceArea, ReferenceLine, Tooltip, Brush } from 'recharts';
import clsx from 'clsx';
import type { AppData, Candidate } from '../lib/history';
import { shortName } from '../lib/history';
import type { TooltipProps } from 'recharts';

const SERIES_COLORS = ['#8B2E2E', '#3E5C76', '#6B7F59', '#B5884C', '#3F3A34'];

// Tooltip customizado: hairline + lista de los 5 valores con puntos de color
function ConvergenceTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="font-mono text-xs border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 min-w-[180px]">
      <div className="text-[var(--text-meta)] text-[0.7rem] uppercase tracking-widest mb-2">
        {label}% actas contabilizadas
      </div>
      <div className="flex flex-col gap-1">
        {payload.map((p) => (
          <div key={p.dataKey as string} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[var(--text-primary)]">
              <span className="inline-block w-2 h-2" style={{ background: p.color }} />
              <span className="truncate max-w-[120px]">{p.dataKey as string}</span>
            </span>
            <span className="tabular-nums text-[var(--text-primary)]">{(p.value as number)?.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Sparkline simple en SVG: linea + dot final. Ancho 100%, alto fijo.
function Sparkline({ history, color }: { history: Array<{ pct: number }>; color: string }) {
  if (history.length < 2) return null;
  const W = 80, H = 20, PAD = 1;
  const values = history.map((h) => h.pct);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.001);
  const stepX = (W - PAD * 2) / (history.length - 1);
  const points = history
    .map((h, i) => {
      const x = PAD + i * stepX;
      const y = PAD + (H - PAD * 2) * (1 - (h.pct - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = points.split(' ').pop()!.split(',');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="1.25" points={points} />
      <circle cx={last[0]} cy={last[1]} r="1.6" fill={color} />
    </svg>
  );
}

// Sparkline del margen 2°-3° con línea del cero (empate).
// Ancho fluido: escala al contenedor via preserveAspectRatio="none".
function MarginSparkline({ history }: { history: Array<{ diff: number }> }) {
  if (history.length < 2) return null;
  const W = 220, H = 42, PAD = 2;
  const values = history.map((h) => h.diff);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = Math.max(max - min, 0.001);
  const stepX = (W - PAD * 2) / (history.length - 1);
  const toY = (v: number) => PAD + (H - PAD * 2) * (1 - (v - min) / range);
  const zeroY = toY(0);
  const points = history
    .map((h, i) => `${(PAD + i * stepX).toFixed(1)},${toY(h.diff).toFixed(1)}`)
    .join(' ');
  const lastIdx = history.length - 1;
  const lastX = PAD + lastIdx * stepX;
  const lastY = toY(history[lastIdx].diff);
  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="shrink-0"
      role="img"
      aria-label="trayectoria del margen entre 2° y 3°"
    >
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="var(--text-meta)" strokeDasharray="2 3" strokeWidth={0.75} />
      <polyline fill="none" stroke="var(--text-primary)" strokeWidth="1.5" points={points} />
      <circle cx={lastX} cy={lastY} r="2.2" fill="var(--text-primary)" />
    </svg>
  );
}

// Devuelve el último punto donde una serie de diffs cambió de signo.
// Si nunca hubo cruce, devuelve el punto de mínima distancia al cero
// (el momento en que dos candidatos más se acercaron sin llegar a cruzarse).
type MarginPoint = { actas: number; diff: number };
type Crossing = { actas: number; kind: 'cross' | 'near' } | null;
function findCrossingOrNear(hist: MarginPoint[]): Crossing {
  if (hist.length < 2) return null;
  let last: { actas: number; kind: 'cross' } | null = null;
  for (let i = 1; i < hist.length; i++) {
    const prev = hist[i - 1].diff;
    const curr = hist[i].diff;
    if (prev === 0 || curr === 0) continue;
    if (Math.sign(prev) !== Math.sign(curr)) {
      last = { actas: hist[i].actas, kind: 'cross' };
    }
  }
  if (last) return last;
  const closest = hist.reduce((best, cur) =>
    Math.abs(cur.diff) < Math.abs(best.diff) ? cur : best,
  );
  return { actas: closest.actas, kind: 'near' };
}

// Tooltip del margen: muestra el par y quién iba adelante en ese corte.
function MarginTooltip({
  active,
  payload,
  label,
  aName,
  bName,
}: TooltipProps<number, string> & { aName: string; bName: string }) {
  if (!active || !payload?.length) return null;
  const diff = payload[0]?.value as number | undefined;
  if (typeof diff !== 'number') return null;
  const leader = diff > 0 ? aName : diff < 0 ? bName : null;
  return (
    <div className="font-mono text-xs border border-[var(--border-primary)] bg-[var(--bg-primary)] p-3 min-w-[180px]">
      <div className="text-[var(--text-meta)] text-[0.7rem] uppercase tracking-widest mb-2">
        {label}% actas contabilizadas
      </div>
      <div className="flex items-center justify-between gap-3 text-[var(--text-primary)]">
        <span>Margen</span>
        <span className="tabular-nums">{diff > 0 ? '+' : ''}{diff.toFixed(3)} pp</span>
      </div>
      {leader && (
        <div className="text-[var(--text-secondary)] text-[0.7rem] mt-1 normal-case">
          {leader} iba adelante
        </div>
      )}
    </div>
  );
}

interface DashboardProps {
  theme: 'light' | 'dark';
  data: AppData;
}

export function Dashboard({ theme, data }: DashboardProps) {
  const isLight = theme === 'light';
  const themeClass = isLight ? 'theme-light' : 'theme-dark';

  const {
    updatedAt, totalActas, pctActas, snapshotsCount, horasDeConteo,
    top5, convergenceData, evolutionData, jee,
  } = data;

  const leader = top5[0] ?? null;
  const gapToMajority = leader ? +(50 - leader.percent).toFixed(2) : null;
  const lastConvergence = convergenceData[convergenceData.length - 1] as
    | (Record<string, number> & { actas: number })
    | undefined;
  // Dominio Y apretado a los datos reales: no partir de 0 (whitespace inútil)
  // sino del mínimo observado menos un pad — así las líneas del pelotón
  // ganan resolución vertical donde realmente se cruzan
  const convergencePctValues = convergenceData.flatMap((p) =>
    top5.map((c) => p[c.party]).filter((v): v is number => typeof v === 'number'),
  );
  const convergenceYMin = convergencePctValues.length
    ? Math.max(0, Math.floor(Math.min(...convergencePctValues) - 0.5))
    : 0;
  const convergenceYMax = convergencePctValues.length
    ? Math.ceil(Math.max(...convergencePctValues) + 0.5)
    : Math.ceil(Math.max(...top5.map((c) => c.percent), 20) * 1.15);
  const currentActas = Math.ceil(pctActas);
  const convergenceXTicks = (() => {
    const mid = Math.round((52 + currentActas) / 2);
    return currentActas - mid >= 5 && mid - 52 >= 5
      ? [52, mid, currentActas]
      : [52, currentActas];
  })();

  // A5 · Vista de la gráfica: todas las candidaturas o solo el pelotón 2°-4°
  const [view, setView] = useState<'all' | 'pack'>('all');
  const packCandidates = top5.slice(1, 4);
  const visibleCandidates = view === 'pack' ? packCandidates : top5;

  const packPctValues = convergenceData.flatMap((p) =>
    packCandidates
      .map((c) => p[c.party])
      .filter((v): v is number => typeof v === 'number'),
  );
  const packYMin = packPctValues.length
    ? Math.max(0, +(Math.min(...packPctValues) - 0.3).toFixed(2))
    : convergenceYMin;
  const packYMax = packPctValues.length
    ? +(Math.max(...packPctValues) + 0.3).toFixed(2)
    : convergenceYMax;
  const yDomain: [number, number] =
    view === 'pack' ? [packYMin, packYMax] : [convergenceYMin, convergenceYMax];

  // A4 · Datos del pelotón del balotaje (2° vs 3°)
  const p2Party = top5[1]?.party;
  const p3Party = top5[2]?.party;
  const marginHistory = useMemo(() => {
    if (!p2Party || !p3Party) return [] as Array<{ actas: number; diff: number }>;
    return convergenceData
      .map((row) => {
        const a = row[p2Party];
        const b = row[p3Party];
        return typeof a === 'number' && typeof b === 'number'
          ? { actas: row.actas, diff: +(a - b).toFixed(3) }
          : null;
      })
      .filter((x): x is { actas: number; diff: number } => x !== null);
  }, [convergenceData, p2Party, p3Party]);

  const currentMargin2v3 =
    top5[1] && top5[2] ? +(top5[1].percent - top5[2].percent).toFixed(3) : null;
  const firstMargin2v3 = marginHistory[0]?.diff ?? null;

  // A2 · Último cruce de signo entre 2° y 3°, o punto de mínima distancia si no hubo cruce
  const crossing2v3 = useMemo(() => findCrossingOrNear(marginHistory), [marginHistory]);

  // B · Historia del margen entre cada par consecutivo del top 5 (1v2, 2v3, 3v4, 4v5)
  const pairMargins = useMemo(() => {
    const out: Array<{
      index: number;
      label: string;
      a: Candidate;
      b: Candidate;
      colorA: string;
      colorB: string;
      history: MarginPoint[];
      current: number | null;
      first: number | null;
      crossing: Crossing;
    }> = [];
    for (let i = 0; i < Math.min(top5.length - 1, 4); i++) {
      const a = top5[i];
      const b = top5[i + 1];
      const history = convergenceData
        .map((row) => {
          const va = row[a.party];
          const vb = row[b.party];
          return typeof va === 'number' && typeof vb === 'number'
            ? { actas: row.actas, diff: +(va - vb).toFixed(3) }
            : null;
        })
        .filter((x): x is MarginPoint => x !== null);
      out.push({
        index: i,
        label: `${a.id}° vs ${b.id}°`,
        a,
        b,
        colorA: SERIES_COLORS[i % 5],
        colorB: SERIES_COLORS[(i + 1) % 5],
        history,
        current: history.at(-1)?.diff ?? null,
        first: history[0]?.diff ?? null,
        crossing: findCrossingOrNear(history),
      });
    }
    return out;
  }, [convergenceData, top5]);

  // Brush de la gráfica del margen: controlado por startIndex/endIndex.
  // Arranca por default en los últimos ~15 pp de actas (donde se define el balotaje).
  // El lector que quiera ver el recorrido completo arrastra el borde izquierdo.
  const computeDefaultBrush = useCallback((): { start?: number; end?: number } => {
    if (marginHistory.length < 2) return {};
    const lastIdx = marginHistory.length - 1;
    const cutoff = marginHistory[lastIdx].actas - 15;
    const startIdx = marginHistory.findIndex((p) => p.actas >= cutoff);
    return startIdx > 0 ? { start: startIdx, end: lastIdx } : {};
  }, [marginHistory]);

  const [marginBrush, setMarginBrush] = useState<{ start?: number; end?: number }>(computeDefaultBrush);
  const [brushTouched, setBrushTouched] = useState(false);

  // Cuando llega un nuevo snapshot (marginHistory crece), mantener el Brush coherente:
  // - Si el usuario no lo movió, re-computar el default sobre la nueva data.
  // - Si lo movió pero su end estaba pegado al último punto, trasladarlo al nuevo último
  //   (sticky-end) para no dejar al recién llegado fuera del zoom.
  const prevLenRef = useRef(marginHistory.length);
  useEffect(() => {
    const prev = prevLenRef.current;
    const cur = marginHistory.length;
    prevLenRef.current = cur;
    if (cur < 2 || cur === prev) return;
    if (!brushTouched) {
      setMarginBrush(computeDefaultBrush());
      return;
    }
    setMarginBrush((b) => {
      if (b.end !== undefined && b.end === prev - 1) {
        return { ...b, end: cur - 1 };
      }
      return b;
    });
  }, [marginHistory, brushTouched, computeDefaultBrush]);

  // Puntos dentro del Brush (o todos si no hay zoom)
  const marginVisible = useMemo(() => {
    if (
      marginBrush.start === undefined ||
      marginBrush.end === undefined ||
      marginHistory.length === 0
    ) {
      return marginHistory;
    }
    return marginHistory.slice(marginBrush.start, marginBrush.end + 1);
  }, [marginHistory, marginBrush]);

  // Dominio Y de la gráfica del margen: centrado en 0 y recalculado sobre los puntos visibles.
  // Si la banda JEE (±jee.totalPct/2) es mucho mayor que el rango visible, se excluye del cálculo
  // y queda fuera del viewport — marginJeeOutOfView lo señaliza.
  const marginYDomain: [number, number] = useMemo(() => {
    const points = marginVisible.length > 0 ? marginVisible : marginHistory;
    if (points.length === 0) return [-1, 1];
    const dataAbs = Math.max(...points.map((p) => Math.abs(p.diff)), 0.1);
    const jeeHalf = jee ? jee.totalPct / 2 : 0;
    const includeJee = jeeHalf > 0 && jeeHalf <= dataAbs * 4;
    const absMax = includeJee ? Math.max(dataAbs, jeeHalf) : dataAbs;
    const pad = absMax * 0.15;
    return [-(absMax + pad), absMax + pad];
  }, [marginVisible, marginHistory, jee]);

  const marginJeeOutOfView = useMemo(() => {
    if (!jee) return false;
    return jee.totalPct / 2 > marginYDomain[1];
  }, [marginYDomain, jee]);

  const actualizadoAlStr = updatedAt.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).toUpperCase();
  const totalActasStr = totalActas.toLocaleString('es-PE');

  return (
    <div className={clsx(themeClass, 'themed-container min-h-screen w-full overflow-x-hidden flex flex-col items-center')}>

      {/* 1. HERO · Titular data-driven: recta final vs. conteo temprano */}
      <section className="w-full max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="flex flex-col gap-6 max-w-4xl">
          <span className="text-xs-eyebrow themed-text-meta">
            ELECCIONES GENERALES · PERÚ 2026 · PRESIDENCIALES
          </span>
          <h1 className="text-hero text-[var(--text-primary)]">
            {leader && currentMargin2v3 !== null && leader.percent < 50 && Math.abs(currentMargin2v3) < 2 ? (
              <>
                El primer puesto está{' '}
                <i className="not-italic text-[var(--color-accent)] font-serif">sellado</i>.
                {' '}El balotaje se decide por{' '}
                <span className="tabular-nums">{Math.abs(currentMargin2v3).toFixed(3)}</span>{' '}
                puntos
                {jee && (
                  <>
                    {' '}y{' '}
                    <span className="tabular-nums">{jee.totalActas.toLocaleString('es-PE')}</span>{' '}
                    actas
                  </>
                )}.
              </>
            ) : (
              <>
                Un conteo{' '}
                <i className="not-italic text-[var(--color-accent)] font-serif">en tiempo real</i>{' '}
                sin prisa por declarar ganador.
              </>
            )}
          </h1>
          <p className="text-body themed-text-secondary max-w-3xl">
            Seguimiento de los resultados preliminares publicados por la ONPE. {snapshotsCount} cortes registrados a lo largo de {horasDeConteo} horas de escrutinio. Este sitio no proyecta ganadores: describe lo que la matemática del conteo ya fija y lo que todavía está abierto.
          </p>
        </div>
      </section>

      {/* 2. ESTADO ACTUAL (siempre terminal) */}
      <section className="w-full bg-[var(--color-terminal-bg)] text-[var(--color-terminal-fg)] py-12 md:py-16">
        <div className="w-full max-w-7xl mx-auto px-4 flex flex-col gap-8">

          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 border-b border-[var(--color-terminal-rule)] pb-4">
            <span className="text-xs-eyebrow text-[var(--color-terminal-muted)]">CÓMPUTO PRESIDENCIAL · CORTE ACTUAL</span>
            <span className="text-xs-eyebrow text-[var(--color-terminal-muted)]">ACTUALIZADO AL {actualizadoAlStr}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-16 lg:gap-32 py-4">
            <div className="flex flex-col gap-2">
              <span className="font-serif font-light text-[clamp(2rem,1.5rem+5vw,5rem)] leading-none tabular-nums">{pctActas.toFixed(3)}<span className="text-[0.4em] text-[var(--color-terminal-muted)]">%</span></span>
              <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-terminal-muted)]">actas contabilizadas</span>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-serif font-light text-[clamp(2rem,1.5rem+5vw,5rem)] leading-none tabular-nums">{totalActasStr}</span>
              <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-terminal-muted)]">total de actas</span>
            </div>
            <div className="flex flex-col gap-2 col-span-2 md:col-span-1">
              {currentMargin2v3 !== null && top5[1] && top5[2] ? (
                <>
                  <span className="font-serif font-light text-[clamp(2rem,1.5rem+5vw,5rem)] leading-none tabular-nums text-[var(--color-accent-soft)]">
                    {Math.abs(currentMargin2v3).toFixed(3)}
                    <span className="text-[0.4em] text-[var(--color-terminal-muted)]"> pp</span>
                  </span>
                  <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-terminal-muted)]">
                    margen 2° vs. 3°
                  </span>
                </>
              ) : (
                <>
                  <span className="font-serif font-light text-[clamp(2rem,1.5rem+5vw,5rem)] leading-none tabular-nums">{top5.length}</span>
                  <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-terminal-muted)]">en el tope</span>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--color-terminal-rule)] pt-2">
            <div className="flex flex-col">
              {top5.map((c, i) => {
                const history = evolutionData[i]?.history ?? [];
                // Δ = cambio desde el primer corte (≥52% actas) donde el
                // candidato aparece, hasta el corte actual. El scraper solo
                // guarda top5 por snapshot, así que candidatos que entraron
                // al top tarde no tienen datos en el primer corte al 52% —
                // en ese caso usamos el primero disponible para ese candidato.
                const firstConv = convergenceData.find(
                  (p) => typeof p[c.party] === 'number',
                );
                const lastConv = [...convergenceData]
                  .reverse()
                  .find((p) => typeof p[c.party] === 'number');
                const fromPct = firstConv?.[c.party];
                const toPct = lastConv?.[c.party];
                const delta =
                  typeof fromPct === 'number' && typeof toPct === 'number'
                    ? toPct - fromPct
                    : null;
                const color = SERIES_COLORS[i % 5];
                return (
                  <div key={c.id} className="grid grid-cols-[2.25rem_1fr_auto] md:grid-cols-[3rem_1fr_auto_auto_6rem] gap-x-3 md:gap-x-4 gap-y-1 py-4 border-b border-[var(--color-terminal-rule)] items-center">
                    <span className="row-span-2 md:row-span-1 text-[var(--color-terminal-muted)] font-serif font-light text-3xl md:text-4xl self-start leading-none">{c.id}</span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs-eyebrow text-[var(--color-terminal-muted)] truncate">{c.party}</span>
                      <span className="font-mono text-[var(--color-terminal-fg)] text-sm md:text-base tracking-tight truncate">{c.name}</span>
                    </div>
                    <span className="font-mono tabular-nums text-[var(--color-accent-soft)] text-lg md:text-2xl text-right self-center md:w-24">{c.percent.toFixed(3)}%</span>

                    {/* segunda línea en móvil: sparkline + delta + votos */}
                    <div className="col-start-2 col-span-2 md:col-span-1 md:col-start-3 flex items-center gap-3 md:gap-4 mt-1 md:mt-0">
                      <Sparkline history={history} color={color} />
                      {delta !== null ? (
                        <span
                          className={clsx(
                            'font-mono tabular-nums text-xs w-16 text-right shrink-0',
                            delta > 0
                              ? 'text-[#A3BE8C]'
                              : delta < 0
                                ? 'text-[#D4A59A]'
                                : 'text-[var(--color-terminal-muted)]',
                          )}
                          title={
                            firstConv
                              ? `Base: ${(firstConv.actas as number).toFixed(2)}% actas`
                              : undefined
                          }
                        >
                          {delta > 0 ? '+' : ''}{delta.toFixed(2)}pp
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-[var(--color-terminal-muted)] w-16 text-right shrink-0">
                          —
                        </span>
                      )}
                    </div>
                    <span className="hidden md:block font-mono tabular-nums text-[var(--color-terminal-muted)] text-sm text-right">{c.votes}</span>
                  </div>
                );
              })}
            </div>
            <p className="font-mono text-[0.7rem] text-[var(--color-terminal-muted)] uppercase tracking-widest mt-3">
              Línea: evolución del candidato · Δ: cambio desde el 52% de actas contabilizadas (puntos porcentuales)
            </p>
          </div>

          {/* C4 · Zona gris integrada como footer de Estado Actual (antes era una section separada) */}
          {jee && (
            <div className="border-t border-[var(--color-terminal-rule)] pt-6 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1">
                <span className="text-xs-eyebrow text-[var(--color-terminal-muted)]">Zona gris · actas en revisión JEE</span>
                <span className="text-xs-eyebrow text-[var(--color-terminal-muted)]">Fuera del cómputo firme</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end gap-6 md:gap-12">
                <div className="flex flex-col gap-1">
                  <span className="font-serif font-light text-[clamp(2.25rem,1.75rem+3vw,4rem)] leading-none tabular-nums text-[var(--color-accent-soft)]">
                    {jee.totalPct.toFixed(2)}
                    <span className="text-[0.4em] text-[var(--color-terminal-muted)]">%</span>
                  </span>
                  <span className="font-mono text-xs text-[var(--color-terminal-muted)]">
                    {jee.totalActas.toLocaleString('es-PE')} actas en total
                  </span>
                </div>

                <div className="flex-1 grid grid-cols-2 gap-4 md:gap-10 md:border-l border-[var(--color-terminal-rule)] md:pl-10">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs-eyebrow text-[var(--color-terminal-muted)]">Enviadas al JEE</span>
                    <span className="font-mono text-xl md:text-2xl tabular-nums text-[var(--color-terminal-fg)]">
                      {jee.enviadasPct.toFixed(3)}%
                    </span>
                    <span className="font-mono text-[0.7rem] text-[var(--color-terminal-muted)]">
                      {jee.enviadas.toLocaleString('es-PE')} actas
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs-eyebrow text-[var(--color-terminal-muted)]">Pendientes de envío</span>
                    <span className="font-mono text-xl md:text-2xl tabular-nums text-[var(--color-terminal-fg)]">
                      {jee.pendientesPct.toFixed(3)}%
                    </span>
                    <span className="font-mono text-[0.7rem] text-[var(--color-terminal-muted)]">
                      {jee.pendientes.toLocaleString('es-PE')} actas
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-body text-[var(--color-terminal-muted)] max-w-3xl">
                El Jurado Electoral resuelve las impugnaciones y puede redistribuir votos entre candidaturas.
                {currentMargin2v3 !== null && Math.abs(currentMargin2v3) < 2 ? (
                  <>
                    {' '}
                    <span className="text-[var(--color-terminal-fg)]">
                      El margen 2°–3° es {Math.abs(currentMargin2v3).toFixed(3)} pp
                    </span>
                    {' '}— estas {jee.totalActas.toLocaleString('es-PE')} actas son{' '}
                    <span className="tabular-nums text-[var(--color-terminal-fg)]">
                      {(jee.totalPct / Math.max(Math.abs(currentMargin2v3), 0.001)).toFixed(0)}×
                    </span>{' '}
                    más grandes que el margen: material suficiente para modificar quién pasa a segunda vuelta.
                  </>
                ) : (
                  <>
                    {' '}
                    Estas {jee.totalActas.toLocaleString('es-PE')} actas son la franja de incertidumbre que queda por encima del conteo firme.
                  </>
                )}
              </p>
            </div>
          )}

        </div>
      </section>

      {/* 3. CONVERGENCIA */}
      <section className="w-full max-w-7xl mx-auto px-4 py-16 md:py-24 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 border-b themed-border pb-3">
          <h2 className="text-h2 text-[var(--text-primary)]">Convergencia desde el 52%</h2>
          <span className="text-xs-eyebrow themed-text-meta">% votos válidos vs. % actas contabilizadas</span>
        </div>
        <p className="text-body themed-text-secondary max-w-3xl">
          Vista a partir del umbral donde la serie dejó de oscilar por muestras pequeñas. El eje horizontal es cuántas actas estaban contabilizadas en cada corte, no el tiempo.
        </p>

        {/* A5 · Toggle de vista */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs-eyebrow themed-text-meta">VISTA</span>
          <div className="inline-flex border themed-border">
            <button
              type="button"
              onClick={() => setView('all')}
              aria-pressed={view === 'all'}
              className={clsx(
                'px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-colors',
                view === 'all'
                  ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                  : 'themed-text-secondary hover:text-[var(--text-primary)]',
              )}
            >
              Las 5 candidaturas
            </button>
            <button
              type="button"
              onClick={() => setView('pack')}
              aria-pressed={view === 'pack'}
              className={clsx(
                'px-3 py-1.5 font-mono text-xs uppercase tracking-widest transition-colors border-l themed-border',
                view === 'pack'
                  ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
                  : 'themed-text-secondary hover:text-[var(--text-primary)]',
              )}
            >
              Pelotón 2°–4°
            </button>
          </div>
          {view === 'pack' && (
            <span className="font-mono text-xs themed-text-meta">
              Y apretado a {packYMin.toFixed(1)}% – {packYMax.toFixed(1)}% para resolver el cruce
            </span>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-6 themed-border border p-3 md:p-4">
          <div className="flex flex-col flex-1 min-w-0 gap-3">
            <p className="sr-only">
              Gráfica de convergencia: {top5.length > 0 && leader ? `${shortName(leader.name)} lidera con ${leader.percent.toFixed(2)}% de votos válidos` : 'cargando'}
              {top5[1] && top5[2] && currentMargin2v3 !== null && (
                ` al ${pctActas.toFixed(1)}% de actas contabilizadas. En el pelotón por el segundo lugar, ${shortName(top5[1].name)} tiene ${top5[1].percent.toFixed(2)}% y ${shortName(top5[2].name)} ${top5[2].percent.toFixed(2)}%, un margen de ${Math.abs(currentMargin2v3).toFixed(3)} puntos porcentuales.`
              )}
            </p>
            <div
              className="w-full h-[360px] md:h-[480px]"
              role="img"
              aria-label={`Convergencia de votos por candidato desde el 52% hasta el ${currentActas}% de actas`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={convergenceData} margin={{ top: 10, right: 12, left: -12, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-soft)" />
                  <XAxis
                    dataKey="actas"
                    type="number"
                    domain={[52, Math.min(100, currentActas + 1)]}
                    ticks={convergenceXTicks}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                    tickFormatter={(val) => `${val}%`}
                  />
                  <YAxis
                    domain={yDomain}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                    tickFormatter={(val) => `${val}%`}
                    width={40}
                    allowDecimals={view === 'pack'}
                  />
                  <Tooltip
                    content={<ConvergenceTooltip />}
                    cursor={{ stroke: 'var(--text-meta)', strokeDasharray: '3 3', strokeWidth: 1 }}
                  />

                  {/* A1 · Banda de incertidumbre JEE: rango vertical que el JEE (±jee.totalPct/2 pp)
                      puede mover al pelotón 2°-3°, dibujado al final de la gráfica */}
                  {jee && top5[1] && top5[2] && (() => {
                    const low = Math.min(top5[1].percent, top5[2].percent);
                    const high = Math.max(top5[1].percent, top5[2].percent);
                    const pad = jee.totalPct / 2;
                    const y1 = Math.max(yDomain[0], low - pad);
                    const y2 = Math.min(yDomain[1], high + pad);
                    const span = Math.max(4, Math.round((currentActas - 52) * 0.18));
                    return (
                      <ReferenceArea
                        y1={y1}
                        y2={y2}
                        x1={Math.max(52, currentActas - span)}
                        x2={Math.min(100, currentActas + 1)}
                        fill="var(--color-accent-soft)"
                        fillOpacity={0.14}
                        stroke="var(--color-accent-soft)"
                        strokeOpacity={0.4}
                        strokeDasharray="2 3"
                        ifOverflow="visible"
                      />
                    );
                  })()}

                  {/* A2 · Marcador del cruce 2°↔3° (o punto de mínima distancia si nunca cruzaron) */}
                  {crossing2v3 && top5[1] && top5[2] && (() => {
                    const row = convergenceData.find((r) => r.actas === crossing2v3.actas);
                    if (!row) return null;
                    const yA = row[top5[1].party];
                    const yB = row[top5[2].party];
                    if (typeof yA !== 'number' || typeof yB !== 'number') return null;
                    const yMid = (yA + yB) / 2;
                    return (
                      <ReferenceDot
                        x={crossing2v3.actas}
                        y={yMid}
                        r={7}
                        fill="none"
                        stroke="var(--text-primary)"
                        strokeWidth={1.25}
                        strokeDasharray="2 2"
                        ifOverflow="visible"
                      />
                    );
                  })()}

                  {/* A3 · Grosor inverso al drama: 2° y 3° protagonistas, líder sellado en secundario */}
                  {visibleCandidates.map((c) => {
                    const originalIdx = top5.findIndex((x) => x.id === c.id);
                    const color = SERIES_COLORS[originalIdx % 5];
                    const isPack = originalIdx === 1 || originalIdx === 2;
                    const isLeader = originalIdx === 0;
                    const strokeWidth = isPack ? 2.75 : isLeader ? 2 : 1.25;
                    const strokeOpacity = isPack ? 1 : isLeader ? 0.75 : 0.5;
                    return (
                      <Line
                        key={c.id}
                        type="monotone"
                        dataKey={c.party}
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeOpacity={strokeOpacity}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg-primary)' }}
                        isAnimationActive={false}
                        connectNulls
                      />
                    );
                  })}
                  {lastConvergence &&
                    visibleCandidates.map((c) => {
                      const originalIdx = top5.findIndex((x) => x.id === c.id);
                      const y = lastConvergence[c.party];
                      if (typeof y !== 'number') return null;
                      const isPack = originalIdx === 1 || originalIdx === 2;
                      return (
                        <ReferenceDot
                          key={`end-${c.id}`}
                          x={lastConvergence.actas}
                          y={y}
                          r={isPack ? 4.5 : originalIdx === 0 ? 4 : 3}
                          fill={SERIES_COLORS[originalIdx % 5]}
                          stroke="var(--bg-primary)"
                          strokeWidth={1.5}
                          ifOverflow="visible"
                        />
                      );
                    })}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Nota al pie de la gráfica: leyendas de anotaciones (A1/A2) */}
            {(jee || crossing2v3) && (
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-5 gap-y-1 font-mono text-[0.7rem] themed-text-meta uppercase tracking-widest">
                {jee && (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block"
                      style={{
                        width: 14,
                        height: 8,
                        border: '1px dashed var(--color-accent-soft)',
                        background: 'color-mix(in oklab, var(--color-accent-soft) 14%, transparent)',
                      }}
                    />
                    <span className="normal-case tracking-normal">
                      Franja: ±{(jee.totalPct / 2).toFixed(2)} pp que el JEE aún puede mover al pelotón
                    </span>
                  </span>
                )}
                {crossing2v3 && (
                  <span className="flex items-center gap-2">
                    <svg width="14" height="14" aria-hidden="true">
                      <circle cx="7" cy="7" r="5" fill="none" stroke="var(--text-primary)" strokeWidth="1.25" strokeDasharray="2 2" />
                    </svg>
                    <span className="normal-case tracking-normal">
                      {crossing2v3.kind === 'cross'
                        ? `Último cruce 2°↔3° al ${crossing2v3.actas.toFixed(0)}% de actas`
                        : `Menor distancia 2°–3° al ${crossing2v3.actas.toFixed(0)}% de actas`}
                    </span>
                  </span>
                )}
              </div>
            )}

            {/* A6 · Leyenda móvil horizontal (desaparece en md+) */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 md:hidden pt-1 border-t themed-border-soft">
              {top5.map((c, i) => {
                const isPack = i === 1 || i === 2;
                return (
                  <div key={c.id} className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="shrink-0 inline-block"
                      style={{
                        width: 12,
                        height: isPack ? 3 : 2,
                        background: SERIES_COLORS[i % 5],
                        opacity: isPack ? 1 : i === 0 ? 0.75 : 0.5,
                      }}
                    />
                    <span
                      className={clsx(
                        'font-mono text-xs truncate',
                        isPack ? 'themed-text-primary' : 'themed-text-secondary',
                      )}
                    >
                      {shortName(c.name)}{' '}
                      <span className="tabular-nums themed-text-meta">
                        {c.percent.toFixed(2)}%
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* A4 móvil · Pelotón del balotaje compacto (md:hidden) */}
            {top5[1] && top5[2] && currentMargin2v3 !== null && (
              <div className="md:hidden flex flex-col gap-3 pt-3 border-t themed-border">
                <div className="flex flex-col gap-1">
                  <span className="text-xs-eyebrow themed-text-meta">Pelea por el 2° lugar</span>
                  <span className="font-serif text-base leading-tight text-[var(--text-primary)]">
                    {shortName(top5[1].name)}{' '}
                    <span className="font-mono text-xs themed-text-meta">vs.</span>{' '}
                    {shortName(top5[2].name)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs-eyebrow themed-text-meta">Margen actual</span>
                    <span className="font-serif font-light text-3xl leading-none tabular-nums text-[var(--text-primary)]">
                      {Math.abs(currentMargin2v3).toFixed(3)}
                      <span className="text-[0.4em] themed-text-meta"> pp</span>
                    </span>
                  </div>
                  {jee && Math.abs(currentMargin2v3) > 0 && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs-eyebrow themed-text-meta">Zona gris (JEE)</span>
                      <span className="font-serif font-light text-3xl leading-none tabular-nums text-[var(--text-primary)]">
                        {(jee.totalPct / Math.max(Math.abs(currentMargin2v3), 0.001)).toFixed(0)}
                        <span className="text-[0.4em] themed-text-meta">× el margen</span>
                      </span>
                      <span className="font-mono text-[0.7rem] themed-text-secondary">
                        {jee.totalActas.toLocaleString('es-PE')} actas en revisión
                      </span>
                    </div>
                  )}
                </div>

                {marginHistory.length >= 2 && firstMargin2v3 !== null && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs-eyebrow themed-text-meta">Trayectoria del margen</span>
                    <MarginSparkline history={marginHistory} />
                    <span className="font-mono text-[0.7rem] themed-text-secondary">
                      {Math.abs(firstMargin2v3).toFixed(2)} pp{' '}
                      <span className="themed-text-meta">→</span>{' '}
                      {Math.abs(currentMargin2v3).toFixed(3)} pp
                      <span className="themed-text-meta"> · desde el {marginHistory[0].actas.toFixed(0)}% de actas</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* A4 · Pelotón del balotaje (reemplaza leyenda lateral en md+) */}
          {top5[1] && top5[2] && currentMargin2v3 !== null && (
            <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:gap-4 md:border-l themed-border md:pl-5">
              <div className="flex flex-col gap-1 pb-3 border-b themed-border">
                <span className="text-xs-eyebrow themed-text-meta">Pelea por el 2° lugar</span>
                <span className="font-serif text-lg leading-tight text-[var(--text-primary)]">
                  {shortName(top5[1].name)}{' '}
                  <span className="font-mono text-sm themed-text-meta">vs.</span>{' '}
                  {shortName(top5[2].name)}
                </span>
                <div className="flex items-center gap-4 mt-1">
                  <span className="flex items-center gap-1.5">
                    <span style={{ width: 10, height: 3, background: SERIES_COLORS[1] }} />
                    <span className="font-mono text-xs tabular-nums themed-text-secondary">{top5[1].percent.toFixed(2)}%</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span style={{ width: 10, height: 3, background: SERIES_COLORS[2] }} />
                    <span className="font-mono text-xs tabular-nums themed-text-secondary">{top5[2].percent.toFixed(2)}%</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs-eyebrow themed-text-meta">Margen actual</span>
                <span className="font-serif font-light text-4xl leading-none tabular-nums text-[var(--text-primary)]">
                  {Math.abs(currentMargin2v3).toFixed(3)}
                  <span className="text-[0.4em] themed-text-meta"> pp</span>
                </span>
              </div>

              {marginHistory.length >= 2 && firstMargin2v3 !== null && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs-eyebrow themed-text-meta">Trayectoria del margen</span>
                  <MarginSparkline history={marginHistory} />
                  <span className="font-mono text-[0.7rem] themed-text-secondary leading-snug">
                    {Math.abs(firstMargin2v3).toFixed(2)} pp <span className="themed-text-meta">→</span>{' '}
                    {Math.abs(currentMargin2v3).toFixed(3)} pp
                    <span className="block themed-text-meta">desde el {marginHistory[0].actas.toFixed(0)}% de actas</span>
                  </span>
                </div>
              )}

              {jee && Math.abs(currentMargin2v3) > 0 && (
                <div className="flex flex-col gap-1 pt-3 border-t themed-border">
                  <span className="text-xs-eyebrow themed-text-meta">Zona gris (JEE)</span>
                  <span className="font-mono text-sm text-[var(--text-primary)] tabular-nums">
                    {jee.totalActas.toLocaleString('es-PE')} actas
                  </span>
                  <span className="font-mono text-[0.7rem] themed-text-secondary leading-snug">
                    <span className="text-[var(--text-primary)] tabular-nums">
                      {(jee.totalPct / Math.max(Math.abs(currentMargin2v3), 0.001)).toFixed(0)}×
                    </span>{' '}
                    el margen actual
                  </span>
                </div>
              )}
            </aside>
          )}
        </div>
      </section>

      {/* 4. EL MARGEN QUE DECIDE EL BALOTAJE */}
      <section className="w-full max-w-7xl mx-auto px-4 py-16 md:py-24 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 border-b themed-border pb-3">
          <h2 className="text-h2 text-[var(--text-primary)]">El margen que decide el balotaje</h2>
          <span className="text-xs-eyebrow themed-text-meta">Diferencia vs. % actas</span>
        </div>
        <p className="text-body themed-text-secondary max-w-3xl">
          Con el primer puesto sellado y ninguna candidatura cerca del 50 %, el suspenso queda en quién entra al balotaje. Esta es la historia del margen entre el actual 2° y 3° a lo largo del conteo: cuando la línea cruza el cero, el orden cambió.
        </p>

        {top5[1] && top5[2] && marginHistory.length >= 2 && currentMargin2v3 !== null && (
          <div className="themed-border border p-3 md:p-4 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 pb-2 border-b themed-border-soft">
              <span className="font-serif text-h3 text-[var(--text-primary)]">
                {shortName(top5[1].name)}{' '}
                <span className="font-mono text-sm themed-text-meta">vs.</span>{' '}
                {shortName(top5[2].name)}
              </span>
              <span className="font-mono text-xs themed-text-meta uppercase tracking-widest">
                margen actual{' '}
                <span className="text-[var(--text-primary)] tabular-nums">
                  {Math.abs(currentMargin2v3).toFixed(3)} pp
                </span>
              </span>
            </div>

            {/* Hint sutil: el default ya muestra el tramo final; el lector curioso arrastra el selector */}
            <p className="font-mono text-xs themed-text-meta normal-case">
              Vista del tramo final — arrastra el borde izquierdo del selector para ver desde el inicio.
              {marginJeeOutOfView && (
                <span className="block mt-1">
                  · La banda JEE (±{((jee?.totalPct ?? 0) / 2).toFixed(2)} pp) queda fuera del viewport: el margen visible ya cabe dentro de la incertidumbre del Jurado.
                </span>
              )}
            </p>

            <p className="sr-only">
              Gráfica del margen entre {shortName(top5[1]!.name)} y {shortName(top5[2]!.name)} a lo largo del conteo.
              {firstMargin2v3 !== null && currentMargin2v3 !== null && (
                ` El margen empezó en ${Math.abs(firstMargin2v3).toFixed(2)} puntos porcentuales al corte del ${marginHistory[0]?.actas.toFixed(0)}% de actas y se ha cerrado a ${Math.abs(currentMargin2v3).toFixed(3)} puntos al corte actual del ${currentActas}%.`
              )}
              {crossing2v3?.kind === 'cross' && ` Se cruzaron al ${crossing2v3.actas.toFixed(0)}% de actas.`}
              {jee && ` La zona gris (actas en revisión del JEE) equivale a ${jee.totalPct.toFixed(2)}% de las actas totales, ${(jee.totalPct / Math.max(Math.abs(currentMargin2v3 ?? 0.001), 0.001)).toFixed(0)} veces más grande que el margen actual.`}
            </p>
            <div
              className="w-full h-[340px] md:h-[440px]"
              role="img"
              aria-label={`Margen entre ${shortName(top5[1]!.name)} y ${shortName(top5[2]!.name)} desde el ${marginHistory[0]?.actas.toFixed(0)}% hasta el ${currentActas}% de actas`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={marginHistory} margin={{ top: 18, right: 20, left: -5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-soft)" />
                  <XAxis
                    dataKey="actas"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    allowDataOverflow
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                    tickFormatter={(val) => `${Number(val).toFixed(0)}%`}
                  />
                  <YAxis
                    domain={marginYDomain}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                    tickFormatter={(val) => `${val > 0 ? '+' : ''}${val.toFixed(1)}`}
                    width={46}
                  />
                  <Tooltip
                    content={
                      <MarginTooltip
                        aName={shortName(top5[1].name)}
                        bName={shortName(top5[2].name)}
                      />
                    }
                    cursor={{ stroke: 'var(--text-meta)', strokeDasharray: '3 3', strokeWidth: 1 }}
                  />

                  {/* B · Banda JEE (±jee.totalPct/2) alrededor del cero = alcance de la zona gris */}
                  {jee && (
                    <ReferenceArea
                      y1={-jee.totalPct / 2}
                      y2={jee.totalPct / 2}
                      fill="var(--color-accent-soft)"
                      fillOpacity={0.12}
                      stroke="none"
                      ifOverflow="visible"
                    />
                  )}

                  {/* Línea del cero (empate) */}
                  <ReferenceLine
                    y={0}
                    stroke="var(--text-primary)"
                    strokeWidth={1.25}
                    label={{
                      value: 'EMPATE',
                      position: 'insideTopRight',
                      fill: 'var(--text-meta)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      letterSpacing: '0.15em',
                    }}
                  />

                  {/* Serie del margen */}
                  <Line
                    type="monotone"
                    dataKey="diff"
                    stroke="var(--text-primary)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg-primary)' }}
                    isAnimationActive={false}
                  />

                  {/* Dot final enfatizado con anotación editorial: margen actual */}
                  <ReferenceDot
                    x={marginHistory[marginHistory.length - 1].actas}
                    y={marginHistory[marginHistory.length - 1].diff}
                    r={5}
                    fill="var(--text-primary)"
                    stroke="var(--bg-primary)"
                    strokeWidth={2}
                    ifOverflow="visible"
                    label={{
                      value: `${Math.abs(currentMargin2v3).toFixed(3)} pp · hoy`,
                      position: currentMargin2v3 > 0 ? 'top' : 'bottom',
                      fill: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      offset: 10,
                    }}
                  />

                  {/* Anotación del cruce: círculo + etiqueta del momento exacto */}
                  {crossing2v3 && crossing2v3.kind === 'cross' && (
                    <ReferenceDot
                      x={crossing2v3.actas}
                      y={0}
                      r={6}
                      fill="none"
                      stroke="var(--text-primary)"
                      strokeWidth={1.25}
                      strokeDasharray="2 2"
                      ifOverflow="visible"
                      label={{
                        value: `cruzaron al ${crossing2v3.actas.toFixed(0)}%`,
                        position: 'top',
                        fill: 'var(--text-meta)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        offset: 12,
                      }}
                    />
                  )}

                  {/* Brush: zoom interactivo sobre el eje X */}
                  <Brush
                    dataKey="actas"
                    height={26}
                    travellerWidth={8}
                    stroke="var(--border-primary)"
                    fill="var(--bg-primary)"
                    startIndex={marginBrush.start}
                    endIndex={marginBrush.end}
                    onChange={(r) => {
                      if (typeof r.startIndex === 'number' && typeof r.endIndex === 'number') {
                        setMarginBrush({ start: r.startIndex, end: r.endIndex });
                        setBrushTouched(true);
                      }
                    }}
                    tickFormatter={(val) => `${Number(val).toFixed(0)}%`}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Nota al pie: cómo leer la gráfica */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-5 gap-y-1 font-mono text-[0.7rem] themed-text-meta uppercase tracking-widest pt-1 border-t themed-border-soft">
              <span className="flex items-center gap-2">
                <span className="inline-block" style={{ width: 10, height: 3, background: SERIES_COLORS[1] }} />
                <span className="normal-case tracking-normal">
                  Arriba del cero · {shortName(top5[1].name)} va adelante
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block" style={{ width: 10, height: 3, background: SERIES_COLORS[2] }} />
                <span className="normal-case tracking-normal">
                  Abajo del cero · {shortName(top5[2].name)} va adelante
                </span>
              </span>
              {jee && (
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block"
                    style={{
                      width: 14,
                      height: 8,
                      background: 'color-mix(in oklab, var(--color-accent-soft) 12%, transparent)',
                    }}
                  />
                  <span className="normal-case tracking-normal">
                    Banda ±{(jee.totalPct / 2).toFixed(2)} pp = alcance del JEE
                  </span>
                </span>
              )}
              {crossing2v3 && crossing2v3.kind === 'cross' && (
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" aria-hidden="true">
                    <circle cx="7" cy="7" r="5" fill="none" stroke="var(--text-primary)" strokeWidth="1.25" strokeDasharray="2 2" />
                  </svg>
                  <span className="normal-case tracking-normal">
                    Último cruce al {crossing2v3.actas.toFixed(0)}% de actas
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Grid: otros márgenes del top 5 (excluye el 2°-3° que ya está arriba) */}
        {pairMargins.filter((pm) => pm.index !== 1).length > 0 && (
          <>
            <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1 pt-4">
              <h3 className="text-h3 text-[var(--text-primary)]">Otros márgenes del top 5</h3>
              <span className="text-xs-eyebrow themed-text-meta">Pares consecutivos del 1° al 5°</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pairMargins
                .filter((pm) => pm.index !== 1)
                .map((pm) => {
                  const abs = pm.current !== null ? Math.abs(pm.current) : null;
                  const trend =
                    pm.current !== null && pm.first !== null
                      ? Math.abs(pm.current) - Math.abs(pm.first)
                      : null;
                  return (
                    <div
                      key={pm.index}
                      className="themed-border border p-4 flex flex-col gap-3"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs-eyebrow themed-text-meta">{pm.label}</span>
                        <span
                          className="font-mono text-sm truncate"
                          title={`${pm.a.name} vs. ${pm.b.name}`}
                        >
                          <span className="inline-flex items-center gap-1.5 align-middle">
                            <span style={{ width: 8, height: 2, background: pm.colorA, display: 'inline-block' }} />
                            {shortName(pm.a.name)}
                          </span>
                          <span className="themed-text-meta"> vs. </span>
                          <span className="inline-flex items-center gap-1.5 align-middle">
                            <span style={{ width: 8, height: 2, background: pm.colorB, display: 'inline-block' }} />
                            {shortName(pm.b.name)}
                          </span>
                        </span>
                      </div>

                      {pm.history.length >= 2 && (
                        <div className="w-full">
                          <MarginSparkline history={pm.history} />
                        </div>
                      )}

                      <div className="flex items-baseline justify-between mt-auto">
                        <span className="font-serif text-2xl tabular-nums text-[var(--text-primary)] leading-none">
                          {abs !== null ? abs.toFixed(abs < 1 ? 3 : 2) : '—'}
                          <span className="text-[0.5em] themed-text-meta"> pp</span>
                        </span>
                        {trend !== null && (
                          <span
                            className={clsx(
                              'font-mono text-[0.7rem] tabular-nums',
                              trend < -0.02
                                ? 'text-[#D4A59A]'
                                : trend > 0.02
                                  ? 'text-[#A3BE8C]'
                                  : 'themed-text-secondary',
                            )}
                            title="Cambio en el valor absoluto del margen desde el primer corte al 52%+"
                          >
                            {trend > 0 ? 'ensanchó ' : trend < 0 ? 'se cerró ' : 'estable '}
                            {trend !== 0 && `${Math.abs(trend).toFixed(2)} pp`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        )}

        {/* Card del líder: cierra la narrativa recordando que el 1° está sellado en balotaje */}
        {leader && (
          <div className="themed-border border p-6 md:p-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6 mt-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs-eyebrow themed-text-meta">Primer puesto · ya en el balotaje</span>
              <span className="font-serif text-2xl md:text-4xl text-[var(--text-primary)]">
                {shortName(leader.name)}
              </span>
              <span className="text-xs-eyebrow themed-text-meta">{leader.party}</span>
            </div>
            <div className="flex flex-col md:items-end gap-1">
              <span className="font-mono text-4xl md:text-5xl tabular-nums" style={{ color: SERIES_COLORS[0] }}>
                {leader.percent.toFixed(2)}%
              </span>
              <span className="font-mono text-xs themed-text-secondary md:text-right max-w-xs">
                {gapToMajority !== null && gapToMajority > 0
                  ? `${gapToMajority.toFixed(2)} pp por debajo del 50 % + 1 → balotaje inevitable`
                  : 'supera el 50 % + 1 — no requiere balotaje'}
              </span>
            </div>
          </div>
        )}

        <p className="text-body themed-text-secondary italic max-w-3xl">
          Un balotaje no se resuelve sumando porcentajes: el flujo de voto de las candidaturas eliminadas requiere encuestas específicas. Lo que esta sección describe es qué tan reversible o sellado está el segundo puesto con el corte actual.
        </p>
      </section>

      {/* 6. METODOLOGÍA (siempre paper) */}
      <section className="w-full bg-[var(--color-paper)] text-[var(--color-ink)] py-16 md:py-24 border-t border-[var(--color-rule)]">
        <div className="w-full max-w-[68ch] mx-auto px-4 flex flex-col gap-6">
          <span className="text-xs-eyebrow text-[var(--color-ink-softer)]">METODOLOGÍA</span>
          <h3 className="text-h3 font-serif">De dónde salen estos números</h3>
          <p className="text-body font-serif text-[var(--color-ink-muted)]">
            Los datos se extraen directamente de los endpoints públicos que alimentan el portal de resultados de la ONPE. Un proceso automático los captura cada 25 minutos y los guarda como historial. Los cortes anteriores al inicio del rastreo fueron reconstruidos desde capturas del portal y snapshots de Internet Archive.
          </p>
          <p className="text-body font-serif text-[var(--color-ink-muted)]">
            Advertencia: el ritmo de escrutinio no es uniforme. Las primeras mesas contabilizadas suelen ser urbanas con mejor conectividad, no representativas del voto rural ni del voto en el extranjero que llega después. Los números antes del 10 % de actas son ruido, no señal.
          </p>
          <p className="text-body font-serif text-[var(--color-ink-muted)]">
            Los datos son preliminares. El resultado oficial lo proclama el Jurado Nacional de Elecciones tras resolver las impugnaciones. Nada de lo publicado aquí sustituye esa proclamación.
          </p>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer className="w-full max-w-7xl mx-auto px-4 py-8 border-t themed-border flex flex-col md:flex-row justify-between gap-4">
        <span className="text-xs-eyebrow themed-text-meta">
          FUENTE: OFICINA NACIONAL DE PROCESOS ELECTORALES (ONPE) — DATOS PRELIMINARES
        </span>
        <span className="text-xs-eyebrow themed-text-meta">
          HECHO POR ANATHEMA
        </span>
      </footer>

    </div>
  );
}
