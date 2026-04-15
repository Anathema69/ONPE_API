import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceDot, Tooltip } from 'recharts';
import clsx from 'clsx';
import type { AppData } from '../lib/history';
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

  // margen más ajustado entre candidatos del 2° al 4°
  const tightestMarginPp =
    top5.length >= 3
      ? Math.min(
          ...[
            top5[1] && top5[2] ? Math.abs(top5[1].percent - top5[2].percent) : Infinity,
            top5[2] && top5[3] ? Math.abs(top5[2].percent - top5[3].percent) : Infinity,
          ],
        )
      : Infinity;

  const leader = top5[0] ?? null;
  const gapToMajority = leader ? +(50 - leader.percent).toFixed(2) : null;
  const runoffPairs: Array<{ a: typeof top5[0]; b: typeof top5[0]; label: string }> = [];
  if (top5[1] && top5[2]) runoffPairs.push({ a: top5[1], b: top5[2], label: '2° vs 3°' });
  if (top5[2] && top5[3]) runoffPairs.push({ a: top5[2], b: top5[3], label: '3° vs 4°' });
  if (top5[1] && top5[3]) runoffPairs.push({ a: top5[1], b: top5[3], label: '2° vs 4°' });

  const evolutionMaxPct = evolutionData.length
    ? Math.max(...evolutionData.flatMap((e) => e.history.map((h) => h.pct)))
    : 22;
  const evolutionDomainMax = Math.max(Math.ceil(evolutionMaxPct * 1.15), 5);

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

  const actualizadoAlStr = updatedAt.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).toUpperCase();
  const totalActasStr = totalActas.toLocaleString('es-PE');

  return (
    <div className={clsx(themeClass, 'themed-container min-h-screen w-full overflow-x-hidden flex flex-col items-center')}>

      {/* 1. HERO */}
      <section className="w-full max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="flex flex-col gap-6 max-w-4xl">
          <span className="text-xs-eyebrow themed-text-meta">
            ELECCIONES GENERALES · PERÚ 2026 · PRESIDENCIALES
          </span>
          <h1 className="text-hero text-[var(--text-primary)]">
            Un conteo <i className="not-italic text-[var(--color-accent)] font-serif">en tiempo real</i> sin prisa por declarar ganador.
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
              <span className="font-serif font-light text-[clamp(2rem,1.5rem+5vw,5rem)] leading-none tabular-nums">{top5.length}</span>
              <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-terminal-muted)]">en el tope</span>
            </div>
          </div>

          <div className="border-t border-[var(--color-terminal-rule)] pt-2">
            <div className="flex flex-col">
              {top5.map((c, i) => {
                const history = evolutionData[i]?.history ?? [];
                // Δ = cambio desde el primer corte con actas ≥ 52% (base de convergencia)
                // hasta el corte actual — más informativo que corte-a-corte inmediato
                const firstConv = convergenceData[0];
                const lastConv = convergenceData[convergenceData.length - 1];
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
                      {delta !== null && (
                        <span className={clsx(
                          'font-mono tabular-nums text-xs',
                          delta > 0 ? 'text-[#A3BE8C]' : delta < 0 ? 'text-[#D4A59A]' : 'text-[var(--color-terminal-muted)]'
                        )}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(2)}pp
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

        <div className="flex flex-col md:flex-row gap-4 md:gap-6 themed-border border p-3 md:p-4">
          <div className="w-full h-[360px] md:h-[480px] md:flex-1 md:min-w-0">
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
                  domain={[convergenceYMin, convergenceYMax]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                  tickFormatter={(val) => `${val}%`}
                  width={40}
                />
                <Tooltip
                  content={<ConvergenceTooltip />}
                  cursor={{ stroke: 'var(--text-meta)', strokeDasharray: '3 3', strokeWidth: 1 }}
                />
                {top5.map((c, i) => (
                  <Line
                    key={c.id}
                    type="monotone"
                    dataKey={c.party}
                    stroke={SERIES_COLORS[i % 5]}
                    strokeWidth={i === 0 ? 2.75 : 1.5}
                    strokeOpacity={i === 0 ? 1 : 0.85}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg-primary)' }}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
                {lastConvergence &&
                  top5.map((c, i) => {
                    const y = lastConvergence[c.party];
                    if (typeof y !== 'number') return null;
                    return (
                      <ReferenceDot
                        key={`end-${c.id}`}
                        x={lastConvergence.actas}
                        y={y}
                        r={i === 0 ? 4 : 3}
                        fill={SERIES_COLORS[i % 5]}
                        stroke="var(--bg-primary)"
                        strokeWidth={1.5}
                        ifOverflow="visible"
                      />
                    );
                  })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col md:w-56 md:shrink-0 md:justify-center gap-0 md:gap-1">
            <div className="flex items-baseline justify-between pb-2 border-b themed-border">
              <span className="text-xs-eyebrow themed-text-meta">AL CORTE ACTUAL</span>
              <span className="text-xs-eyebrow themed-text-meta">% VOTOS</span>
            </div>
            {top5.map((c, i) => {
              const color = SERIES_COLORS[i % 5];
              const isLeader = i === 0;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-2 border-b themed-border last:border-b-0"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className="shrink-0 inline-block"
                      style={{
                        width: 14,
                        height: isLeader ? 3 : 2,
                        background: color,
                        opacity: isLeader ? 1 : 0.85,
                      }}
                    />
                    <span
                      className={clsx(
                        'font-mono text-xs truncate',
                        isLeader ? 'themed-text-primary' : 'themed-text-secondary',
                      )}
                      title={c.party}
                    >
                      {c.party}
                    </span>
                  </div>
                  <span
                    className={clsx(
                      'font-mono tabular-nums shrink-0',
                      isLeader ? 'text-sm md:text-base' : 'text-xs md:text-sm',
                    )}
                    style={{ color }}
                  >
                    {c.percent.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. EVOLUCIÓN DEL CONTEO (small multiples) */}
      <section className="w-full max-w-7xl mx-auto px-4 py-8 md:py-16 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 border-b themed-border pb-3">
          <h2 className="text-h2 text-[var(--text-primary)]">Evolución del conteo</h2>
          <span className="text-xs-eyebrow themed-text-meta">Top 5 · a lo largo del tiempo</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {evolutionData.map((c, i) => {
            const color = SERIES_COLORS[i % 5];
            return (
              <div key={c.id} className="themed-border border p-4 flex flex-col gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs-eyebrow themed-text-meta truncate" title={c.party}>{c.party}</span>
                  <span className="font-mono text-sm truncate" title={c.name}>{shortName(c.name)}</span>
                </div>
                <div className="h-[120px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={c.history} margin={{ top: 5, right: 2, left: 2, bottom: 5 }}>
                      <XAxis dataKey="date" hide />
                      <YAxis domain={[0, evolutionDomainMax]} hide />
                      <Tooltip
                        contentStyle={{ borderRadius: 0, border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '4px' }}
                        labelStyle={{ color: 'var(--text-meta)' }}
                        formatter={(val: number) => [`${val.toFixed(2)}%`, 'Votos']}
                      />
                      <Line type="monotone" dataKey="pct" stroke={color} strokeWidth={1.75} dot={{ r: 2, fill: color }} activeDot={{ r: 3 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-between items-baseline mt-auto">
                  <span className="font-mono text-xs themed-text-secondary truncate">{c.history[0]?.date ?? ''} → {c.history.at(-1)?.date ?? ''}</span>
                  <span className="font-mono text-lg tabular-nums shrink-0" style={{ color }}>{c.percent.toFixed(2)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4.5 ZONA GRIS · ACTAS EN REVISIÓN JEE */}
      {jee && (
        <section className="w-full bg-[var(--color-terminal-bg)] text-[var(--color-terminal-fg)] py-12 md:py-16">
          <div className="w-full max-w-7xl mx-auto px-4 flex flex-col gap-8">

            <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 border-b border-[var(--color-terminal-rule)] pb-4">
              <h2 className="text-h2 text-[var(--color-terminal-fg)]">Zona gris</h2>
              <span className="text-xs-eyebrow text-[var(--color-terminal-muted)]">ACTAS FUERA DEL CÓMPUTO FIRME</span>
            </div>

            <div className="flex flex-col md:flex-row md:items-end gap-8 md:gap-16">
              <div className="flex flex-col gap-2">
                <span className="font-serif font-light text-[clamp(3rem,2rem+5vw,5rem)] leading-none tabular-nums text-[var(--color-accent-soft)]">
                  {jee.totalPct.toFixed(2)}<span className="text-[0.4em] text-[var(--color-terminal-muted)]">%</span>
                </span>
                <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-terminal-muted)]">
                  {jee.totalActas.toLocaleString('es-PE')} actas en revisión del JEE
                </span>
              </div>

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-10 md:border-l border-[var(--color-terminal-rule)] md:pl-10">
                <div className="flex flex-col gap-1">
                  <span className="text-xs-eyebrow text-[var(--color-terminal-muted)]">ENVIADAS AL JEE</span>
                  <span className="font-mono text-2xl md:text-3xl tabular-nums text-[var(--color-terminal-fg)]">
                    {jee.enviadasPct.toFixed(3)}%
                  </span>
                  <span className="font-mono text-xs text-[var(--color-terminal-muted)]">
                    {jee.enviadas.toLocaleString('es-PE')} actas · en revisión activa del Jurado
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs-eyebrow text-[var(--color-terminal-muted)]">PENDIENTES DE ENVÍO</span>
                  <span className="font-mono text-2xl md:text-3xl tabular-nums text-[var(--color-terminal-fg)]">
                    {jee.pendientesPct.toFixed(3)}%
                  </span>
                  <span className="font-mono text-xs text-[var(--color-terminal-muted)]">
                    {jee.pendientes.toLocaleString('es-PE')} actas · en cola para revisión
                  </span>
                </div>
              </div>
            </div>

            <p className="text-body text-[var(--color-terminal-muted)] max-w-3xl border-t border-[var(--color-terminal-rule)] pt-6">
              {Number.isFinite(tightestMarginPp) && tightestMarginPp < 2 ? (
                <>
                  El Jurado Electoral resuelve las impugnaciones y puede redistribuir votos entre candidaturas.{' '}
                  <span className="text-[var(--color-terminal-fg)]">
                    El margen más ajustado del top 5 es de {tightestMarginPp.toFixed(2)} pp
                  </span>{' '}
                  — {jee.totalActas.toLocaleString('es-PE')} actas son material suficiente para modificar el orden de quién pasa a segunda vuelta.
                </>
              ) : (
                <>
                  El Jurado Electoral resuelve las impugnaciones y puede redistribuir votos entre candidaturas.{' '}
                  Estas {jee.totalActas.toLocaleString('es-PE')} actas son la franja de incertidumbre que queda por encima del conteo firme.
                </>
              )}
            </p>
          </div>
        </section>
      )}

      {/* 5. SEGUNDA VUELTA */}
      <section className="w-full max-w-7xl mx-auto px-4 py-16 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 border-b themed-border pb-3">
          <h2 className="text-h2 text-[var(--text-primary)]">Segunda vuelta</h2>
          <span className="text-xs-eyebrow themed-text-meta">¿Quién acompaña al líder?</span>
        </div>
        <p className="text-body themed-text-secondary max-w-3xl">
          La Constitución obliga a un balotaje cuando ninguna candidatura supera el 50 % + 1 de votos válidos. Con el corte actual el primer puesto está sellado en los márgenes; el suspenso es quién pasa segundo.
        </p>

        {leader && (
          <div className="themed-border border p-6 md:p-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-xs-eyebrow themed-text-meta">PRIMER PUESTO · CORTE ACTUAL</span>
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

        {runoffPairs.length > 0 && (
          <>
            <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 pt-4">
              <h3 className="text-h3 text-[var(--text-primary)]">Pelea por el segundo lugar</h3>
              <span className="text-xs-eyebrow themed-text-meta">Márgenes entre candidatos del 2° al 4°</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {runoffPairs.map((p, i) => {
                const diff = Math.abs(p.a.percent - p.b.percent);
                return (
                  <div key={i} className="themed-border border p-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs-eyebrow themed-text-meta">{p.label}</span>
                      <span className="font-serif text-lg md:text-xl text-[var(--text-primary)]">
                        {shortName(p.a.name)}{' '}
                        <span className="themed-text-meta">vs.</span>{' '}
                        {shortName(p.b.name)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-col">
                      <span className="font-mono text-2xl tabular-nums themed-text-primary">{diff.toFixed(2)} pp</span>
                      <span className="font-mono text-xs themed-text-secondary">Margen actual</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p className="text-body themed-text-secondary italic max-w-3xl">
          Un balotaje no se resuelve sumando porcentajes: el flujo de voto de las candidaturas eliminadas requiere encuestas específicas. Lo que estos márgenes describen es qué tan reversible o sellado está el segundo puesto con el corte actual.
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
