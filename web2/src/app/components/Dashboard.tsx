import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Tooltip, Legend } from 'recharts';
import clsx from 'clsx';
import type { AppData } from '../lib/history';

interface DashboardProps {
  theme: 'light' | 'dark';
  data: AppData;
}

const SERIES_COLORS = ['#8B2E2E', '#3E5C76', '#6B7F59', '#B5884C', '#3F3A34'];

export function Dashboard({ theme, data }: DashboardProps) {
  const isLight = theme === 'light';
  const themeClass = isLight ? 'theme-light' : 'theme-dark';

  const {
    updatedAt, totalActas, pctActas, snapshotsCount, horasDeConteo,
    top5, convergenceData, evolutionData, scenarios,
  } = data;

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
              {top5.map((c) => (
                <div key={c.id} className="grid grid-cols-[2.5rem_1fr_auto] md:grid-cols-[3rem_1fr_auto_6rem] gap-x-4 gap-y-1 py-4 border-b border-[var(--color-terminal-rule)] items-baseline">
                  <span className="row-span-2 md:row-span-1 text-[var(--color-terminal-muted)] font-serif font-light text-3xl md:text-4xl self-start">{c.id}</span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs-eyebrow text-[var(--color-terminal-muted)] truncate">{c.party}</span>
                    <span className="font-mono text-[var(--color-terminal-fg)] text-sm md:text-base tracking-tight truncate">{c.name}</span>
                  </div>
                  <span className="font-mono tabular-nums text-[var(--color-accent-soft)] text-xl md:text-2xl md:w-24 text-right self-center">{c.percent.toFixed(3)}%</span>
                  <span className="col-start-2 md:col-start-3 font-mono tabular-nums text-[var(--color-terminal-muted)] text-xs md:text-sm md:text-[var(--color-terminal-fg)] md:text-base md:text-right">{c.votes} votos</span>
                </div>
              ))}
            </div>
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
        <div className="w-full h-[320px] md:h-[460px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={convergenceData} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-soft)" />
              <XAxis dataKey="actas" type="number" domain={[52, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} tickFormatter={(val) => `${val}%`} />
              <YAxis domain={[5, 20]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} tickFormatter={(val) => `${val}%`} />
              <Tooltip
                contentStyle={{ borderRadius: 0, border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                itemStyle={{ color: 'var(--text-primary)' }}
                labelFormatter={(v) => `${v}% actas`}
                formatter={(val: number) => `${val.toFixed(2)}%`}
              />
              <ReferenceLine y={10} stroke="var(--text-meta)" strokeDasharray="3 3" />
              {top5.map((c, i) => (
                <Line key={c.id} type="monotone" dataKey={c.party} stroke={SERIES_COLORS[i % 5]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} connectNulls />
              ))}
              <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', paddingTop: '1rem' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 4. EVOLUCIÓN DEL CONTEO (small multiples) */}
      <section className="w-full max-w-7xl mx-auto px-4 py-8 md:py-16 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 border-b themed-border pb-3">
          <h2 className="text-h2 text-[var(--text-primary)]">Evolución del conteo</h2>
          <span className="text-xs-eyebrow themed-text-meta">Top 5 · a lo largo del tiempo</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {evolutionData.map((c) => (
            <div key={c.id} className="themed-border border p-4 flex flex-col gap-3">
              <div className="flex flex-col min-w-0">
                <span className="text-xs-eyebrow themed-text-meta truncate" title={c.party}>{c.party}</span>
                <span className="font-mono text-sm truncate" title={c.name}>{c.name.split(' ').slice(0, 3).join(' ')}</span>
              </div>
              <div className="h-[120px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={c.history} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                    <XAxis dataKey="date" hide />
                    <YAxis domain={[0, 22]} hide />
                    <Tooltip
                      contentStyle={{ borderRadius: 0, border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '4px' }}
                      labelStyle={{ color: 'var(--text-meta)' }}
                      formatter={(val: number) => [`${val.toFixed(2)}%`, 'Votos']}
                    />
                    <Line type="monotone" dataKey="pct" stroke="var(--color-accent)" strokeWidth={1.5} dot={{ r: 1.5, fill: 'var(--color-accent)' }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between items-end mt-auto">
                <span className="font-mono text-xs themed-text-secondary">{c.history[0]?.date ?? ''} → {c.history.at(-1)?.date ?? ''}</span>
                <span className="font-mono text-lg tabular-nums text-[var(--color-accent)]">{c.percent.toFixed(2)}%</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. SEGUNDA VUELTA */}
      <section className="w-full max-w-7xl mx-auto px-4 py-16 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 border-b themed-border pb-3">
          <h2 className="text-h2 text-[var(--text-primary)]">Segunda vuelta</h2>
          <span className="text-xs-eyebrow themed-text-meta">Escenarios aritméticos</span>
        </div>
        <p className="text-body themed-text-secondary max-w-3xl">
          La Constitución obliga a un balotaje cuando ninguna candidatura supera el 50 % + 1 de votos válidos. Con el corte actual esa segunda vuelta es inevitable. Los pares posibles entre las tres primeras fuerzas:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {scenarios.map((s, i) => (
            <div key={i} className="themed-border border p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs-eyebrow themed-text-meta">ESCENARIO {String(i + 1).padStart(2, '0')}</span>
                <span className="font-serif text-xl">{s.c1} vs. {s.c2}</span>
              </div>
              <div className="mt-4 flex flex-col">
                <span className="font-mono text-2xl tabular-nums themed-text-primary">{Math.abs(s.diff).toFixed(2)} pp</span>
                <span className="font-mono text-xs themed-text-secondary">Distancia actual</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-body themed-text-secondary italic max-w-3xl">
          Estos pares son escenarios de cierre, no predicciones. El resultado de un balotaje depende del flujo de voto de las candidaturas eliminadas, información que requiere encuestas específicas.
        </p>
      </section>

      {/* 6. METODOLOGÍA (siempre paper) */}
      <section className="w-full bg-[var(--color-paper)] text-[var(--color-ink)] py-16 md:py-24 border-t border-[var(--color-rule)]">
        <div className="w-full max-w-[68ch] mx-auto px-4 flex flex-col gap-6">
          <span className="text-xs-eyebrow text-[var(--color-ink-softer)]">METODOLOGÍA</span>
          <h3 className="text-h3 font-serif">De dónde salen estos números</h3>
          <p className="text-body font-serif text-[var(--color-ink-muted)]">
            Los datos se extraen directamente de los endpoints públicos que alimentan el portal de resultados de la ONPE. Un proceso automático los captura cada 30 minutos y los guarda como historial. Los cortes anteriores al inicio del rastreo fueron reconstruidos desde capturas del portal y snapshots de Internet Archive.
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
