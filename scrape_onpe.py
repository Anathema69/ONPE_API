"""
Scraper directo de la API interna de ONPE (Elecciones 2026).
Descubierta vía DevTools / Playwright sniffing. No requiere navegador.

Endpoints:
  - /presentacion-backend/proceso/proceso-electoral-activo
      -> data.idEleccionPrincipal (ID de eleccion presidencial activa)
  - /presentacion-backend/resumen-general/totales?idEleccion=<id>&tipoFiltro=eleccion
      -> actasContabilizadas (%), totalActas, fechaActualizacion (ms)
  - /presentacion-backend/eleccion-presidencial/participantes-ubicacion-geografica-nombre
      ?idEleccion=<id>&tipoFiltro=eleccion
      -> lista de candidatos ordenada por votos desc (incluye blancos y nulos)

Guarda:
  data/onpe_latest.json   (snapshot completo)
  data/onpe_history.csv   (histórico append-only, una fila por candidato/corte)
"""
from __future__ import annotations

import csv
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

BASE = "https://resultadoelectoral.onpe.gob.pe/presentacion-backend"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "es-PE,es;q=0.9",
    "Referer": "https://resultadoelectoral.onpe.gob.pe/main/presidenciales",
    "Origin": "https://resultadoelectoral.onpe.gob.pe",
    # CloudFront filtra si no parece fetch/XHR desde la SPA
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
}
TIMEOUT = 20
TOP_N = 5
LIMA_TZ = timezone(timedelta(hours=-5))  # Perú no usa DST

OUT_DIR = Path(__file__).parent / "data"
OUT_DIR.mkdir(exist_ok=True)
JSON_PATH = OUT_DIR / "onpe_latest.json"
CSV_PATH = OUT_DIR / "onpe_history.csv"


def get_json(url: str) -> dict:
    r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def fetch() -> dict:
    activo = get_json(f"{BASE}/proceso/proceso-electoral-activo")["data"]
    id_eleccion = activo["idEleccionPrincipal"]

    totales = get_json(
        f"{BASE}/resumen-general/totales"
        f"?idEleccion={id_eleccion}&tipoFiltro=eleccion"
    )["data"]

    participantes = get_json(
        f"{BASE}/eleccion-presidencial/participantes-ubicacion-geografica-nombre"
        f"?idEleccion={id_eleccion}&tipoFiltro=eleccion"
    )["data"]

    # Filtrar candidatos reales (sin BLANCO/NULO) y tomar top N
    candidatos = [c for c in participantes if c.get("dniCandidato")]
    top = candidatos[:TOP_N]

    fecha_ms = totales["fechaActualizacion"]
    fecha_lima = datetime.fromtimestamp(fecha_ms / 1000, LIMA_TZ)

    return {
        "capturadoEn": datetime.now(LIMA_TZ).isoformat(timespec="seconds"),
        "idEleccion": id_eleccion,
        "procesoElectoral": activo.get("nombre"),
        "actualizadoAl": fecha_lima.isoformat(timespec="seconds"),
        "porcentajeActasContabilizadas": totales["actasContabilizadas"],
        "actasContabilizadas": totales["contabilizadas"],
        "totalActas": totales["totalActas"],
        "participacionCiudadana": totales["participacionCiudadana"],
        "top": [
            {
                "posicion": i + 1,
                "candidato": c["nombreCandidato"],
                "agrupacion": c["nombreAgrupacionPolitica"],
                "votosValidos": c["totalVotosValidos"],
                "porcentajeVotosValidos": c.get("porcentajeVotosValidos"),
                "porcentajeVotosEmitidos": c.get("porcentajeVotosEmitidos"),
            }
            for i, c in enumerate(top)
        ],
    }


def save(snap: dict) -> None:
    JSON_PATH.write_text(
        json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # evita duplicar filas si la ONPE aun no actualizo el snapshot
    if CSV_PATH.exists():
        with CSV_PATH.open(encoding="utf-8", newline="") as f:
            if any(r.get("actualizadoAl") == snap["actualizadoAl"]
                   for r in csv.DictReader(f)):
                return

    new_file = not CSV_PATH.exists()
    with CSV_PATH.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow([
                "capturadoEn", "actualizadoAl", "pctActasContabilizadas",
                "totalActas", "posicion", "candidato", "agrupacion",
                "votosValidos", "pctVotosValidos",
            ])
        for c in snap["top"]:
            w.writerow([
                snap["capturadoEn"], snap["actualizadoAl"],
                snap["porcentajeActasContabilizadas"], snap["totalActas"],
                c["posicion"], c["candidato"], c["agrupacion"],
                c["votosValidos"], c["porcentajeVotosValidos"],
            ])


def pretty(snap: dict) -> None:
    print(f"\nProceso: {snap['procesoElectoral']}")
    print(f"Actualizado: {snap['actualizadoAl']}")
    print(f"Actas: {snap['porcentajeActasContabilizadas']}% "
          f"({snap['actasContabilizadas']:,} de {snap['totalActas']:,})")
    print(f"\nTOP {TOP_N}:")
    for c in snap["top"]:
        print(f"  {c['posicion']}. {c['candidato']:<45s} "
              f"{c['agrupacion'][:30]:<30s} "
              f"{c['porcentajeVotosValidos']:>6.3f}%  "
              f"({c['votosValidos']:>10,} votos)")


if __name__ == "__main__":
    snap = fetch()
    save(snap)
    pretty(snap)
    print(f"\nGuardado: {JSON_PATH}")
    print(f"Append:   {CSV_PATH}")
