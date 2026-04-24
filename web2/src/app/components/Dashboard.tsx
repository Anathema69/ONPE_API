import { useMemo } from 'react';
import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceDot, ReferenceLine, Tooltip, Customized } from 'recharts';
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
    updatedAt, startedAt, totalActas, pctActas, snapshotsCount, horasDeConteo, diasDeConteo,
    top5, convergenceData, evolutionData, jee,
  } = data;

  const leader = top5[0] ?? null;
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

  // Vista única — sin toggle. El direct labeling al final de cada línea
  // hace redundante la pack-view: el lector identifica las líneas por nombre.
  const visibleCandidates = top5;
  const yDomain: [number, number] = [convergenceYMin, convergenceYMax];

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

  // Sin Brush: con el cómputo cerrado, la narrativa es el recorrido completo.
  // El dominio Y se centra en 0 y escala al máximo absoluto observado, con un
  // pad de 15% y considerando la banda JEE si cabe en el mismo orden de magnitud.
  const marginYDomain: [number, number] = useMemo(() => {
    if (marginHistory.length === 0) return [-1, 1];
    const dataAbs = Math.max(...marginHistory.map((p) => Math.abs(p.diff)), 0.1);
    const jeeHalf = jee ? jee.totalPct / 2 : 0;
    const includeJee = jeeHalf > 0 && jeeHalf <= dataAbs * 4;
    const absMax = includeJee ? Math.max(dataAbs, jeeHalf) : dataAbs;
    const pad = absMax * 0.15;
    return [-(absMax + pad), absMax + pad];
  }, [marginHistory, jee]);

  const marginJeeOutOfView = useMemo(() => {
    if (!jee) return false;
    return jee.totalPct / 2 > marginYDomain[1];
  }, [marginYDomain, jee]);

  // Offset del cero para el gradient split (above/below zero).
  // El gradient va de yDomainMax (top, offset=0) a yDomainMin (bottom, offset=1).
  const zeroOffset = useMemo(() => {
    const [lo, hi] = marginYDomain;
    if (hi === lo) return 0.5;
    return hi / (hi - lo);
  }, [marginYDomain]);

  const corteFinalStr = updatedAt.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).toUpperCase();
  const inicioConteoStr = startedAt.toLocaleDateString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: 'long',
  }).toUpperCase();
  const finConteoStr = updatedAt.toLocaleDateString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: 'long',
  }).toUpperCase();
  const totalActasStr = totalActas.toLocaleString('es-PE');
  const diasEnteros = Math.max(1, Math.round(diasDeConteo));
  const packTrailing = top5.slice(1, 5);

  return (
    <div className={clsx(themeClass, 'themed-container min-h-screen w-full overflow-x-hidden flex flex-col items-center')}>

      {/* 1. HERO · Cierre del cómputo ONPE + pase al JEE */}
      <section className="w-full max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="flex flex-col gap-6 max-w-4xl">
          <span className="text-xs-eyebrow themed-text-meta">
            ELECCIONES GENERALES · PERÚ 2026 · PRESIDENCIALES
          </span>
          <h1 className="text-hero text-[var(--text-primary)]">
            {leader && currentMargin2v3 !== null && Math.abs(currentMargin2v3) < 2 ? (
              <>
                El cómputo ONPE{' '}
                <i className="not-italic text-[var(--color-accent)] font-serif">cerró</i>{' '}
                al{' '}
                <span className="tabular-nums">{pctActas.toFixed(3)}</span>%.
                {' '}El balotaje, decidido por{' '}
                <span className="tabular-nums">{Math.abs(currentMargin2v3).toFixed(3)}</span>{' '}
                puntos, queda en manos del JEE hasta mayo.
              </>
            ) : (
              <>
                El cómputo ONPE{' '}
                <i className="not-italic text-[var(--color-accent)] font-serif">cerró</i>.
                {' '}La resolución de actas pendientes queda en manos del JEE hasta mayo.
              </>
            )}
          </h1>
          <p className="text-body themed-text-secondary max-w-3xl">
            Registro del cierre del cómputo preliminar publicado por la ONPE. {snapshotsCount} cortes a lo largo de {diasEnteros} días de escrutinio, del {inicioConteoStr} al {finConteoStr}. Este sitio no proyecta ganadores: describe lo que la matemática del conteo ya fijó y lo que todavía puede moverse cuando el Jurado resuelva las impugnaciones.
          </p>
        </div>
      </section>

      {/* 2. ESTADO ACTUAL (siempre terminal) */}
      <section className="w-full bg-[var(--color-terminal-bg)] text-[var(--color-terminal-fg)] py-12 md:py-16">
        <div className="w-full max-w-7xl mx-auto px-4 flex flex-col gap-8">

          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 border-b border-[var(--color-terminal-rule)] pb-4">
            <span className="text-xs-eyebrow text-[var(--color-terminal-muted)]">CÓMPUTO PRESIDENCIAL · CIERRE</span>
            <span className="text-xs-eyebrow text-[var(--color-terminal-muted)]">CORTE FINAL · {corteFinalStr}</span>
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
              Línea: trayectoria durante el cierre · Δ: cambio desde el 52% de actas contabilizadas hasta el corte final (puntos porcentuales)
            </p>
          </div>

        </div>
      </section>

      {/* 2B. LO QUE EL JEE TIENE EN SUS MANOS (promovido desde footer del terminal) */}
      {jee && (
        <section className="w-full max-w-7xl mx-auto px-4 py-16 md:py-24 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 border-b themed-border pb-3">
            <h2 className="text-h2 text-[var(--text-primary)]">Lo que el JEE todavía puede mover</h2>
            <span className="text-xs-eyebrow themed-text-meta">Actas fuera del cómputo firme · resuelve hasta mayo</span>
          </div>
          <p className="text-body themed-text-secondary max-w-3xl">
            El cómputo ONPE quedó en {pctActas.toFixed(3)}%. El resto son actas observadas que el Jurado Electoral revisa y resuelve una a una; el plazo oficial se extiende hasta mayo de 2026. Mientras no se resuelvan, el orden de llegada al balotaje no está sellado.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 md:gap-10 themed-border border p-5 md:p-8">
            <div className="flex flex-col gap-1 md:border-r themed-border md:pr-10 md:min-w-[14rem]">
              <span className="text-xs-eyebrow themed-text-meta">Actas en revisión JEE</span>
              <span className="font-serif font-light text-[clamp(3rem,2rem+5vw,5.5rem)] leading-none tabular-nums text-[var(--color-accent)]">
                {jee.totalPct.toFixed(2)}
                <span className="text-[0.35em] themed-text-meta">%</span>
              </span>
              <span className="font-mono text-sm themed-text-secondary tabular-nums">
                {jee.totalActas.toLocaleString('es-PE')} actas
              </span>
              {currentMargin2v3 !== null && Math.abs(currentMargin2v3) > 0 && (
                <span className="font-mono text-xs themed-text-meta mt-3 leading-relaxed max-w-[16rem]">
                  <span className="tabular-nums text-[var(--text-primary)]">
                    {(jee.totalPct / Math.max(Math.abs(currentMargin2v3), 0.001)).toFixed(0)}×
                  </span>{' '}
                  el margen actual entre 2° y 3°.
                </span>
              )}
            </div>

            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-5 md:gap-8">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs-eyebrow themed-text-meta">Enviadas al JEE</span>
                  <span className="font-mono text-2xl md:text-3xl tabular-nums text-[var(--text-primary)]">
                    {jee.enviadasPct.toFixed(3)}%
                  </span>
                  <span className="font-mono text-[0.75rem] themed-text-secondary">
                    {jee.enviadas.toLocaleString('es-PE')} actas en mesa del Jurado
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs-eyebrow themed-text-meta">Pendientes de envío</span>
                  <span className="font-mono text-2xl md:text-3xl tabular-nums text-[var(--text-primary)]">
                    {jee.pendientesPct.toFixed(3)}%
                  </span>
                  <span className="font-mono text-[0.75rem] themed-text-secondary">
                    {jee.pendientes.toLocaleString('es-PE')} actas sin remitir
                  </span>
                </div>
              </div>

              {/* Micro-escenarios: cómo puede reordenar el JEE al pelotón 2°-5° */}
              {top5[1] && top5[2] && currentMargin2v3 !== null && (
                <div className="flex flex-col gap-2 pt-4 border-t themed-border-soft">
                  <span className="text-xs-eyebrow themed-text-meta">Escenarios posibles del reordenamiento</span>
                  <ul className="flex flex-col gap-2 font-mono text-sm themed-text-secondary">
                    <li className="flex gap-3">
                      <span className="themed-text-meta tabular-nums shrink-0">A ·</span>
                      <span>
                        El Jurado valida las actas sin alterar proporciones →{' '}
                        <span className="text-[var(--text-primary)]">
                          {shortName(top5[1].name)}
                        </span>{' '}
                        mantiene el 2° lugar y el balotaje se confirma.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="themed-text-meta tabular-nums shrink-0">B ·</span>
                      <span>
                        Las observaciones se concentran en distritos donde{' '}
                        <span className="text-[var(--text-primary)]">
                          {shortName(top5[1].name)}
                        </span>{' '}
                        era fuerte → el margen de {Math.abs(currentMargin2v3).toFixed(3)} pp se revierte y{' '}
                        <span className="text-[var(--text-primary)]">
                          {shortName(top5[2].name)}
                        </span>{' '}
                        pasa al balotaje.
                      </span>
                    </li>
                    {packTrailing[2] && (
                      <li className="flex gap-3">
                        <span className="themed-text-meta tabular-nums shrink-0">C ·</span>
                        <span>
                          La redistribución beneficia a{' '}
                          <span className="text-[var(--text-primary)]">
                            {shortName(packTrailing[2].name)}
                          </span>
                          : improbable pero no excluido mientras queden{' '}
                          {jee.totalActas.toLocaleString('es-PE')} actas sin resolver.
                        </span>
                      </li>
                    )}
                  </ul>
                  <p className="font-mono text-[0.7rem] themed-text-meta mt-2 italic normal-case leading-relaxed">
                    No son proyecciones: son lecturas cualitativas del rango en el que puede moverse el 2° lugar mientras el Jurado resuelve.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 3. CONVERGENCIA · rediseñada con direct labeling, sin toggle, sin sidebar */}
      <section className="w-full max-w-7xl mx-auto px-4 py-16 md:py-24 flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 border-b themed-border pb-3">
          <h2 className="text-h2 text-[var(--text-primary)]">Convergencia desde el 52%</h2>
          <span className="text-xs-eyebrow themed-text-meta">Trayectoria del voto por candidato</span>
        </div>
        <p className="text-body themed-text-secondary max-w-3xl">
          El recorrido desde el umbral en que la serie dejó de oscilar por muestras pequeñas hasta el cierre del cómputo. El eje horizontal es el porcentaje de actas contabilizadas, no el tiempo.
        </p>

        <div className="flex flex-col gap-4">
          <p className="sr-only">
            Gráfica de convergencia: {top5.length > 0 && leader ? `${shortName(leader.name)} lidera con ${leader.percent.toFixed(2)}% de votos válidos` : 'cargando'}
            {top5[1] && top5[2] && currentMargin2v3 !== null && (
              ` al ${pctActas.toFixed(1)}% de actas contabilizadas. En el pelotón por el segundo lugar, ${shortName(top5[1].name)} tiene ${top5[1].percent.toFixed(2)}% y ${shortName(top5[2].name)} ${top5[2].percent.toFixed(2)}%, un margen de ${Math.abs(currentMargin2v3).toFixed(3)} puntos porcentuales.`
            )}
          </p>

          {/* Eyebrow del eje Y: unidad una sola vez, editorial */}
          <div className="flex items-baseline justify-between">
            <span className="text-xs-eyebrow themed-text-meta">% votos válidos</span>
            <span className="text-xs-eyebrow themed-text-meta">cierre · {pctActas.toFixed(2)}% actas</span>
          </div>

          <div
            className="w-full h-[380px] md:h-[520px]"
            role="img"
            aria-label={`Convergencia de votos por candidato desde el 52% hasta el ${currentActas}% de actas`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={convergenceData}
                margin={{ top: 10, right: 120, left: 0, bottom: 22 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border-soft)"
                  strokeOpacity={0.55}
                />
                <XAxis
                  dataKey="actas"
                  type="number"
                  domain={[52, Math.min(100, currentActas + 1)]}
                  ticks={convergenceXTicks}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                  tickFormatter={(val) => String(val)}
                  label={{
                    value: '% actas contabilizadas',
                    position: 'insideBottom',
                    offset: -12,
                    fill: 'var(--text-meta)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                  }}
                />
                <YAxis
                  domain={yDomain}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                  tickFormatter={(val) => String(val)}
                  width={32}
                />
                <Tooltip
                  content={<ConvergenceTooltip />}
                  cursor={{ stroke: 'var(--text-meta)', strokeDasharray: '3 3', strokeWidth: 1 }}
                />

                {/* Regla vertical del cruce 2°↔3°: anclaje del texto anotado al pie */}
                {crossing2v3 && crossing2v3.kind === 'cross' && (
                  <ReferenceLine
                    x={crossing2v3.actas}
                    stroke="var(--text-meta)"
                    strokeDasharray="3 4"
                    strokeOpacity={0.65}
                    ifOverflow="visible"
                    label={{
                      value: `Cruce · ${crossing2v3.actas.toFixed(0)}% actas`,
                      position: 'insideTopLeft',
                      fill: 'var(--text-meta)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      offset: 6,
                    }}
                  />
                )}

                {/* Líneas por candidato · grosor inverso al drama (2° y 3° protagonistas) */}
                {visibleCandidates.map((c) => {
                  const originalIdx = top5.findIndex((x) => x.id === c.id);
                  const color = SERIES_COLORS[originalIdx % 5];
                  const isPack = originalIdx === 1 || originalIdx === 2;
                  const isLeader = originalIdx === 0;
                  const strokeWidth = isPack ? 2.75 : isLeader ? 2 : 1.5;
                  const strokeOpacity = isPack ? 1 : isLeader ? 0.85 : 0.65;
                  return (
                    <Line
                      key={c.id}
                      type="monotone"
                      dataKey={c.party}
                      stroke={color}
                      strokeWidth={strokeWidth}
                      strokeOpacity={strokeOpacity}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg-primary)' }}
                      isAnimationActive={false}
                      connectNulls
                    />
                  );
                })}

                {/* Dots terminales (color de serie, halo del bg) */}
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

                {/* Direct labeling: nombre + % al extremo derecho de cada línea,
                    con anti-colisión simple en coordenadas de píxel */}
                <Customized
                  component={(props: unknown) => {
                    const { yAxisMap, xAxisMap } = props as {
                      yAxisMap: Record<string, { scale: (v: number) => number }>;
                      xAxisMap: Record<string, { scale: (v: number) => number }>;
                    };
                    if (!lastConvergence || !yAxisMap || !xAxisMap) return null;
                    const yScale = Object.values(yAxisMap)[0]?.scale;
                    const xScale = Object.values(xAxisMap)[0]?.scale;
                    if (!yScale || !xScale) return null;

                    const xPx = xScale(lastConvergence.actas);
                    type LP = { c: Candidate; idx: number; color: string; y: number; value: number };
                    const raw: LP[] = top5
                      .map((c, idx) => {
                        const v = lastConvergence[c.party];
                        if (typeof v !== 'number') return null;
                        return {
                          c,
                          idx,
                          color: SERIES_COLORS[idx % 5],
                          y: yScale(v),
                          value: v,
                        };
                      })
                      .filter((p): p is LP => p !== null)
                      .sort((a, b) => a.y - b.y);

                    // Anti-colisión vertical: empujar hacia abajo si la separación es < 18px
                    const MIN_GAP = 18;
                    for (let i = 1; i < raw.length; i++) {
                      const prev = raw[i - 1];
                      const cur = raw[i];
                      if (cur.y - prev.y < MIN_GAP) cur.y = prev.y + MIN_GAP;
                    }

                    return (
                      <g>
                        {raw.map((p) => (
                          <g key={p.c.id}>
                            <line
                              x1={xPx + 4}
                              x2={xPx + 12}
                              y1={yScale(p.value)}
                              y2={p.y}
                              stroke={p.color}
                              strokeWidth={1}
                              strokeOpacity={0.55}
                            />
                            <text
                              x={xPx + 16}
                              y={p.y}
                              dominantBaseline="middle"
                              fontFamily="var(--font-mono)"
                              fontSize="11"
                              fill="var(--text-primary)"
                            >
                              <tspan fontWeight={p.idx === 1 || p.idx === 2 ? 600 : 400}>
                                {shortName(p.c.name)}
                              </tspan>
                              <tspan
                                dx="6"
                                fill="var(--text-meta)"
                                style={{ fontVariantNumeric: 'tabular-nums' }}
                              >
                                {p.value.toFixed(2)}
                              </tspan>
                            </text>
                          </g>
                        ))}
                      </g>
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Readout editorial debajo del gráfico */}
          {top5[1] && top5[2] && currentMargin2v3 !== null && (
            <p className="text-body themed-text-secondary max-w-3xl border-t themed-border-soft pt-4">
              Al cierre del {pctActas.toFixed(2)}% de actas,{' '}
              <span className="text-[var(--text-primary)]">{shortName(top5[1].name)}</span>{' '}
              supera a{' '}
              <span className="text-[var(--text-primary)]">{shortName(top5[2].name)}</span>{' '}
              por{' '}
              <span className="text-[var(--text-primary)] tabular-nums">
                {Math.abs(currentMargin2v3).toFixed(3)}
              </span>{' '}
              pp.
              {crossing2v3 && crossing2v3.kind === 'cross' && (
                <>
                  {' '}El cruce ocurrió al{' '}
                  <span className="text-[var(--text-primary)] tabular-nums">
                    {crossing2v3.actas.toFixed(0)}%
                  </span>{' '}
                  de actas contabilizadas
                  {currentActas > crossing2v3.actas && (
                    <>, y la ventaja se mantuvo los últimos{' '}
                      <span className="tabular-nums">{(currentActas - crossing2v3.actas).toFixed(0)}</span>{' '}
                      pp del conteo
                    </>
                  )}
                  .
                </>
              )}
              {' '}El primer puesto de{' '}
              <span className="text-[var(--text-primary)]">{shortName(top5[0].name)}</span>{' '}
              se consolidó sin disputa.
            </p>
          )}
        </div>
      </section>

      {/* 4. EL MARGEN QUE DECIDE EL BALOTAJE · rediseñada con area fill split, sin Brush */}
      <section className="w-full max-w-7xl mx-auto px-4 py-16 md:py-24 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 border-b themed-border pb-3">
          <h2 className="text-h2 text-[var(--text-primary)]">El margen que decide el balotaje</h2>
          <span className="text-xs-eyebrow themed-text-meta">2° vs 3° a lo largo del cómputo</span>
        </div>
        <p className="text-body themed-text-secondary max-w-3xl">
          Con el primer puesto sellado y ninguna candidatura cerca del 50 %, el suspenso queda en quién entra al balotaje. Esta es la historia del margen entre el 2° y el 3° del cierre a lo largo del conteo. El color del área indica quién iba adelante en cada tramo; cuando la línea cruza el cero, el orden cambió.
        </p>

        {top5[1] && top5[2] && marginHistory.length >= 2 && currentMargin2v3 !== null && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
              <span className="font-serif text-h3 text-[var(--text-primary)]">
                {shortName(top5[1].name)}{' '}
                <span className="font-mono text-sm themed-text-meta">vs.</span>{' '}
                {shortName(top5[2].name)}
              </span>
              <span className="text-xs-eyebrow themed-text-meta">
                margen al cierre{' '}
                <span className="text-[var(--text-primary)] tabular-nums normal-case">
                  {Math.abs(currentMargin2v3).toFixed(3)} pp
                </span>
              </span>
            </div>

            <p className="sr-only">
              Gráfica del margen entre {shortName(top5[1]!.name)} y {shortName(top5[2]!.name)} a lo largo del conteo.
              {firstMargin2v3 !== null && currentMargin2v3 !== null && (
                ` El margen empezó en ${Math.abs(firstMargin2v3).toFixed(2)} puntos porcentuales al corte del ${marginHistory[0]?.actas.toFixed(0)}% de actas y se cerró a ${Math.abs(currentMargin2v3).toFixed(3)} puntos al ${currentActas}%.`
              )}
              {crossing2v3?.kind === 'cross' && ` Se cruzaron al ${crossing2v3.actas.toFixed(0)}% de actas.`}
              {jee && ` La zona gris en revisión del JEE equivale a ${jee.totalPct.toFixed(2)}% de las actas, ${(jee.totalPct / Math.max(Math.abs(currentMargin2v3 ?? 0.001), 0.001)).toFixed(0)} veces más grande que el margen actual.`}
            </p>

            {/* Eyebrow editorial + unidad Y */}
            <div className="flex items-baseline justify-between">
              <span className="text-xs-eyebrow themed-text-meta">pp a favor de cada uno</span>
              <span className="text-xs-eyebrow themed-text-meta">
                desde {marginHistory[0].actas.toFixed(0)}% actas
              </span>
            </div>

            <div
              className="w-full h-[380px] md:h-[500px]"
              role="img"
              aria-label={`Margen entre ${shortName(top5[1]!.name)} y ${shortName(top5[2]!.name)} desde el ${marginHistory[0]?.actas.toFixed(0)}% hasta el ${currentActas}% de actas`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={marginHistory} margin={{ top: 28, right: 32, left: 0, bottom: 28 }}>
                  <defs>
                    <linearGradient id="marginFillSplit" x1="0" x2="0" y1="0" y2="1">
                      <stop offset={0} stopColor={SERIES_COLORS[1]} stopOpacity={0.28} />
                      <stop offset={Math.max(0, zeroOffset - 0.0001)} stopColor={SERIES_COLORS[1]} stopOpacity={0.05} />
                      <stop offset={Math.min(1, zeroOffset + 0.0001)} stopColor={SERIES_COLORS[2]} stopOpacity={0.05} />
                      <stop offset={1} stopColor={SERIES_COLORS[2]} stopOpacity={0.28} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border-soft)"
                    strokeOpacity={0.55}
                  />

                  <XAxis
                    dataKey="actas"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    allowDataOverflow
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                    tickFormatter={(val) => String(Number(val).toFixed(0))}
                    label={{
                      value: '% actas contabilizadas',
                      position: 'insideBottom',
                      offset: -14,
                      fill: 'var(--text-meta)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                    }}
                  />
                  <YAxis
                    domain={marginYDomain}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                    tickFormatter={(val) => Number(val).toFixed(1)}
                    width={34}
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

                  {/* Banda JEE (±jee.totalPct/2) alrededor del cero · alcance de la zona gris */}
                  {jee && (
                    <ReferenceLine
                      y={jee.totalPct / 2}
                      stroke="var(--color-accent-soft)"
                      strokeDasharray="2 4"
                      strokeOpacity={0.75}
                      ifOverflow="visible"
                      label={{
                        value: `+${(jee.totalPct / 2).toFixed(2)} pp · alcance JEE`,
                        position: 'right',
                        fill: 'var(--color-accent-soft)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        offset: 4,
                      }}
                    />
                  )}
                  {jee && (
                    <ReferenceLine
                      y={-jee.totalPct / 2}
                      stroke="var(--color-accent-soft)"
                      strokeDasharray="2 4"
                      strokeOpacity={0.75}
                      ifOverflow="visible"
                    />
                  )}

                  {/* Área split al cero: tinte del 2° arriba, del 3° abajo */}
                  <Area
                    type="monotone"
                    dataKey="diff"
                    stroke="none"
                    fill="url(#marginFillSplit)"
                    baseValue={0}
                    isAnimationActive={false}
                  />

                  {/* Línea del cero (sin label · la geometría ya comunica empate) */}
                  <ReferenceLine
                    y={0}
                    stroke="var(--text-primary)"
                    strokeWidth={1.25}
                  />

                  {/* Serie del margen · línea primaria */}
                  <Line
                    type="monotone"
                    dataKey="diff"
                    stroke="var(--text-primary)"
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg-primary)' }}
                    isAnimationActive={false}
                  />

                  {/* Regla vertical del cruce · anclaje del texto al pie */}
                  {crossing2v3 && crossing2v3.kind === 'cross' && (
                    <ReferenceLine
                      x={crossing2v3.actas}
                      stroke="var(--text-meta)"
                      strokeDasharray="3 4"
                      strokeOpacity={0.7}
                      ifOverflow="visible"
                      label={{
                        value: `Cruce · ${crossing2v3.actas.toFixed(0)}% actas`,
                        position: 'insideTopLeft',
                        fill: 'var(--text-meta)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        offset: 6,
                      }}
                    />
                  )}

                  {/* Regla vertical del cierre ONPE */}
                  <ReferenceLine
                    x={marginHistory[marginHistory.length - 1].actas}
                    stroke="var(--text-primary)"
                    strokeDasharray="3 4"
                    strokeOpacity={0.55}
                    ifOverflow="visible"
                    label={{
                      value: 'Cierre ONPE',
                      position: 'insideTopRight',
                      fill: 'var(--text-meta)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      offset: 6,
                    }}
                  />

                  {/* Dot final enfatizado */}
                  <ReferenceDot
                    x={marginHistory[marginHistory.length - 1].actas}
                    y={marginHistory[marginHistory.length - 1].diff}
                    r={5}
                    fill="var(--text-primary)"
                    stroke="var(--bg-primary)"
                    strokeWidth={2}
                    ifOverflow="visible"
                    label={{
                      value: `${Math.abs(currentMargin2v3).toFixed(3)} pp`,
                      position: currentMargin2v3 > 0 ? 'top' : 'bottom',
                      fill: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      offset: 10,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Readout editorial */}
            <p className="text-body themed-text-secondary max-w-3xl border-t themed-border-soft pt-4">
              {firstMargin2v3 !== null && (
                <>
                  El margen arrancó en{' '}
                  <span className="text-[var(--text-primary)] tabular-nums">
                    {Math.abs(firstMargin2v3).toFixed(2)}
                  </span>{' '}
                  pp a favor de{' '}
                  <span className="text-[var(--text-primary)]">
                    {firstMargin2v3 > 0 ? shortName(top5[1].name) : shortName(top5[2].name)}
                  </span>
                  {crossing2v3 && crossing2v3.kind === 'cross' && (
                    <>, se cerró al{' '}
                      <span className="text-[var(--text-primary)] tabular-nums">
                        {crossing2v3.actas.toFixed(0)}%
                      </span>{' '}
                      de actas
                    </>
                  )}
                  {' '}y terminó en{' '}
                  <span className="text-[var(--text-primary)] tabular-nums">
                    {Math.abs(currentMargin2v3).toFixed(3)}
                  </span>{' '}
                  pp a favor de{' '}
                  <span className="text-[var(--text-primary)]">
                    {currentMargin2v3 > 0 ? shortName(top5[1].name) : shortName(top5[2].name)}
                  </span>
                  .
                </>
              )}
              {jee && marginJeeOutOfView && (
                <>
                  {' '}El margen final cabe dentro de la banda JEE: las{' '}
                  <span className="text-[var(--text-primary)] tabular-nums">
                    {jee.totalActas.toLocaleString('es-PE')}
                  </span>{' '}
                  actas aún por resolver pueden moverlo de un lado al otro del cero.
                </>
              )}
              {jee && !marginJeeOutOfView && (
                <>
                  {' '}Con{' '}
                  <span className="text-[var(--text-primary)] tabular-nums">
                    {jee.totalPct.toFixed(2)}%
                  </span>
                  {' '}de actas aún en el JEE, la cifra final podría moverse.
                </>
              )}
            </p>
          </div>
        )}

        {/* Pequeños múltiplos coherentes: otros pares consecutivos del top 5 */}
        {pairMargins.filter((pm) => pm.index !== 1).length > 0 && (
          <div className="flex flex-col gap-4 pt-6 border-t themed-border-soft">
            <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1">
              <h3 className="text-h3 text-[var(--text-primary)]">Otros márgenes del top 5</h3>
              <span className="text-xs-eyebrow themed-text-meta">Pares consecutivos · mismo vocabulario visual</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
              {pairMargins
                .filter((pm) => pm.index !== 1)
                .map((pm) => {
                  const abs = pm.current !== null ? Math.abs(pm.current) : null;
                  const trend =
                    pm.current !== null && pm.first !== null
                      ? Math.abs(pm.current) - Math.abs(pm.first)
                      : null;

                  const miniAbs = pm.history.length > 0
                    ? Math.max(...pm.history.map((p) => Math.abs(p.diff)), 0.1)
                    : 0.1;
                  const miniDomain: [number, number] = [-miniAbs * 1.15, miniAbs * 1.15];
                  const miniZeroOffset = miniAbs * 1.15 / (miniAbs * 1.15 * 2);

                  return (
                    <div key={pm.index} className="flex flex-col gap-2">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs-eyebrow themed-text-meta">{pm.label}</span>
                        <span className="font-mono text-sm text-[var(--text-primary)] truncate" title={`${pm.a.name} vs. ${pm.b.name}`}>
                          <span className="inline-flex items-center gap-1.5 align-middle">
                            <span style={{ width: 10, height: 2, background: pm.colorA, display: 'inline-block' }} />
                            {shortName(pm.a.name)}
                          </span>
                          <span className="themed-text-meta"> vs. </span>
                          <span className="inline-flex items-center gap-1.5 align-middle">
                            <span style={{ width: 10, height: 2, background: pm.colorB, display: 'inline-block' }} />
                            {shortName(pm.b.name)}
                          </span>
                        </span>
                      </div>

                      {pm.history.length >= 2 && (
                        <div className="w-full h-[120px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={pm.history} margin={{ top: 6, right: 4, left: 0, bottom: 4 }}>
                              <defs>
                                <linearGradient id={`mini-fill-${pm.index}`} x1="0" x2="0" y1="0" y2="1">
                                  <stop offset={0} stopColor={pm.colorA} stopOpacity={0.28} />
                                  <stop offset={Math.max(0, miniZeroOffset - 0.0001)} stopColor={pm.colorA} stopOpacity={0.05} />
                                  <stop offset={Math.min(1, miniZeroOffset + 0.0001)} stopColor={pm.colorB} stopOpacity={0.05} />
                                  <stop offset={1} stopColor={pm.colorB} stopOpacity={0.28} />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="actas" type="number" domain={['dataMin', 'dataMax']} hide />
                              <YAxis domain={miniDomain} hide />
                              <ReferenceLine y={0} stroke="var(--text-primary)" strokeWidth={1} strokeOpacity={0.65} />
                              <Area
                                type="monotone"
                                dataKey="diff"
                                stroke="none"
                                fill={`url(#mini-fill-${pm.index})`}
                                baseValue={0}
                                isAnimationActive={false}
                              />
                              <Line
                                type="monotone"
                                dataKey="diff"
                                stroke="var(--text-primary)"
                                strokeWidth={1.75}
                                strokeLinecap="round"
                                dot={false}
                                isAnimationActive={false}
                              />
                              {pm.history.length > 0 && (
                                <ReferenceDot
                                  x={pm.history[pm.history.length - 1].actas}
                                  y={pm.history[pm.history.length - 1].diff}
                                  r={3}
                                  fill="var(--text-primary)"
                                  stroke="var(--bg-primary)"
                                  strokeWidth={1.5}
                                  ifOverflow="visible"
                                />
                              )}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      <div className="flex items-baseline justify-between">
                        <span className="font-serif text-2xl tabular-nums text-[var(--text-primary)] leading-none">
                          {abs !== null ? abs.toFixed(abs < 1 ? 3 : 2) : '—'}
                          <span className="text-[0.5em] themed-text-meta"> pp</span>
                        </span>
                        {trend !== null && (
                          <span
                            className={clsx(
                              'font-mono text-[0.7rem] tabular-nums',
                              trend < -0.02
                                ? 'text-[#A3BE8C]'
                                : trend > 0.02
                                  ? 'text-[#D4A59A]'
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
          </div>
        )}

        <p className="text-body themed-text-secondary italic max-w-3xl">
          Un balotaje no se resuelve sumando porcentajes: el flujo de voto de las candidaturas eliminadas requiere encuestas específicas. Lo que esta sección describe es qué tan reversible o sellado quedó el segundo puesto al cierre del cómputo.
        </p>
      </section>

      {/* 5B. EPÍLOGO · cómo se cerró (cierra el capítulo ONPE antes de metodología) */}
      <section className="w-full max-w-7xl mx-auto px-4 py-12 md:py-16">
        <div className="themed-border border-t pt-8 flex flex-col gap-4">
          <span className="text-xs-eyebrow themed-text-meta">Cómo se cerró</span>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10">
            <div className="flex flex-col gap-1">
              <span className="text-xs-eyebrow themed-text-meta">Primer corte</span>
              <span className="font-serif text-2xl md:text-3xl tabular-nums text-[var(--text-primary)] leading-none">
                {inicioConteoStr}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs-eyebrow themed-text-meta">Corte final</span>
              <span className="font-serif text-2xl md:text-3xl tabular-nums text-[var(--text-primary)] leading-none">
                {finConteoStr}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs-eyebrow themed-text-meta">Duración</span>
              <span className="font-serif text-2xl md:text-3xl tabular-nums text-[var(--text-primary)] leading-none">
                {diasEnteros} <span className="text-[0.55em] themed-text-meta">días</span>
              </span>
              <span className="font-mono text-[0.7rem] themed-text-meta tabular-nums">
                {horasDeConteo} horas registradas
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs-eyebrow themed-text-meta">Cortes guardados</span>
              <span className="font-serif text-2xl md:text-3xl tabular-nums text-[var(--text-primary)] leading-none">
                {snapshotsCount}
              </span>
              <span className="font-mono text-[0.7rem] themed-text-meta tabular-nums">
                {totalActasStr} actas en total
              </span>
            </div>
          </div>
          <p className="text-body themed-text-secondary max-w-3xl italic">
            Aquí termina lo que ONPE puede publicar. Lo que falte de aquí a mayo se resuelve en el Jurado, acta por acta, y se incorporará al resultado oficial cuando el JNE proclame la elección.
          </p>
        </div>
      </section>

      {/* 6. METODOLOGÍA (siempre paper) */}
      <section className="w-full bg-[var(--color-paper)] text-[var(--color-ink)] py-16 md:py-24 border-t border-[var(--color-rule)]">
        <div className="w-full max-w-[68ch] mx-auto px-4 flex flex-col gap-6">
          <span className="text-xs-eyebrow text-[var(--color-ink-softer)]">METODOLOGÍA</span>
          <h3 className="text-h3 font-serif">De dónde salen estos números</h3>
          <p className="text-body font-serif text-[var(--color-ink-muted)]">
            Los datos se extraen directamente de los endpoints públicos que alimentan el portal de resultados de la ONPE. Durante el cómputo, un proceso automático los capturó cada 25 minutos y los guardó como historial; los cortes anteriores al inicio del rastreo fueron reconstruidos desde capturas del portal y snapshots de Internet Archive. El último corte incorporado es del {corteFinalStr}.
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
