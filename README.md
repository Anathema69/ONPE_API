# ONPE_API — Scraper de resultados electorales 2026

Captura automática de los resultados presidenciales publicados por la
**ONPE** en https://resultadoelectoral.onpe.gob.pe/main/presidenciales.

La plataforma oficial es una SPA Angular sin API pública documentada. Este
proyecto identifica los endpoints JSON internos que consume la SPA y los
consulta directamente con `requests` (sin navegador) — rápido y liviano.

## Endpoints descubiertos

Base: `https://resultadoelectoral.onpe.gob.pe/presentacion-backend`

| Endpoint | Campos relevantes |
|---|---|
| `/proceso/proceso-electoral-activo` | `idEleccionPrincipal` |
| `/resumen-general/totales?idEleccion=<id>&tipoFiltro=eleccion` | `actasContabilizadas` (%), `totalActas`, `fechaActualizacion` |
| `/eleccion-presidencial/participantes-ubicacion-geografica-nombre?idEleccion=<id>&tipoFiltro=eleccion` | Lista ordenada de candidatos con votos y porcentajes |

## Instalación

```bash
python -m venv venv
source venv/Scripts/activate     # Windows Git Bash
pip install -r requirements.txt
python -m playwright install chromium   # solo para sniff_endpoints.py
```

## Uso

```bash
python scrape_onpe.py
```

Genera:
- `data/onpe_latest.json` — snapshot completo del último corte
- `data/onpe_history.csv` — histórico append-only, una fila por candidato/corte

## Archivos

- `scrape_onpe.py` — scraper directo vía HTTP (producción)
- `sniff_endpoints.py` — Playwright headless que intercepta XHR/fetch; se usa
  para redescubrir endpoints si la ONPE los cambia
- `requirements.txt` — dependencias

## Programación

Para ejecutar cada 25 minutos, usar Windows Task Scheduler o cron:

```
*/25 * * * *  /ruta/a/venv/bin/python /ruta/a/scrape_onpe.py
```
