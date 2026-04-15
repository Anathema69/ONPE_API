"""
Reconstruye cortes historicos del conteo ONPE a partir de snapshots
archivados por la Wayback Machine (archive.org).

La API de ONPE no expone historia. La unica fuente retro disponible son los
mementos que el crawler de Internet Archive capturo espontaneamente. Este
script:

 1. Pide el timemap de cada endpoint a Wayback.
 2. Para cada memento (timestamp) descarga la version archivada del JSON.
 3. Empareja totales + participantes por proximidad temporal (< 6h).
 4. Agrega las filas resultantes a data/onpe_history.csv respetando la
    fecha real del snapshot (columna actualizadoAl).

No sobrescribe el CSV: hace append y evita duplicados por actualizadoAl.
"""
from __future__ import annotations

import csv
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import quote

import requests

from scrape_onpe import (
    BASE, CSV_PATH, HEADERS, LIMA_TZ, TOP_N,
)

WAYBACK_TIMEMAP = "https://web.archive.org/web/timemap/link/"
WAYBACK_FETCH = "https://web.archive.org/web/{ts}id_/{url}"
# id_ = "identity": devuelve el cuerpo original sin rewriting de Wayback

TOTALES_URL = (f"{BASE}/resumen-general/totales"
               "?idEleccion=10&tipoFiltro=eleccion")
PART_URL = (f"{BASE}/eleccion-presidencial/"
            "participantes-ubicacion-geografica-nombre"
            "?idEleccion=10&tipoFiltro=eleccion")

MEMENTO_RE = re.compile(
    r'<https://web\.archive\.org/web/(\d{14})/[^>]+>; rel="(?:first )?memento"'
)


def list_mementos(url: str) -> list[str]:
    r = requests.get(WAYBACK_TIMEMAP + url, timeout=30)
    r.raise_for_status()
    return MEMENTO_RE.findall(r.text)


def fetch_memento(ts: str, url: str) -> dict | None:
    full = WAYBACK_FETCH.format(ts=ts, url=url)
    try:
        r = requests.get(full, headers=HEADERS, timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  [skip] {ts}: {e}")
        return None


def parse_ts(ts: str) -> datetime:
    # Wayback timestamp es UTC: YYYYMMDDHHMMSS
    return datetime.strptime(ts, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)


def build_snapshots() -> list[dict]:
    print(f"[+] Listando mementos de totales...")
    t_stamps = list_mementos(TOTALES_URL)
    print(f"    {len(t_stamps)} snapshots de totales")

    print(f"[+] Listando mementos de participantes...")
    p_stamps = list_mementos(PART_URL)
    print(f"    {len(p_stamps)} snapshots de participantes")

    # descarga todos
    totales = {}
    for ts in t_stamps:
        j = fetch_memento(ts, TOTALES_URL)
        if j and j.get("data"):
            totales[ts] = j["data"]
    participantes = {}
    for ts in p_stamps:
        j = fetch_memento(ts, PART_URL)
        if j and j.get("data"):
            participantes[ts] = j["data"]

    # empareja por proximidad temporal (< 6h)
    snaps = []
    used_part = set()
    for t_ts, tot in totales.items():
        t_dt = parse_ts(t_ts)
        best, best_delta = None, timedelta(hours=6)
        for p_ts in participantes:
            if p_ts in used_part:
                continue
            delta = abs(parse_ts(p_ts) - t_dt)
            if delta < best_delta:
                best, best_delta = p_ts, delta
        if best is None:
            print(f"  [warn] sin participantes cerca de {t_ts}, salto")
            continue
        used_part.add(best)

        fecha_ms = tot["fechaActualizacion"]
        fecha_lima = datetime.fromtimestamp(fecha_ms / 1000, LIMA_TZ)
        cands = [c for c in participantes[best] if c.get("dniCandidato")][:TOP_N]

        snaps.append({
            "capturadoEn": t_dt.astimezone(LIMA_TZ).isoformat(timespec="seconds")
                           + " (wayback)",
            "actualizadoAl": fecha_lima.isoformat(timespec="seconds"),
            "porcentajeActasContabilizadas": tot["actasContabilizadas"],
            "totalActas": tot["totalActas"],
            "top": [
                {
                    "posicion": i + 1,
                    "candidato": c["nombreCandidato"],
                    "agrupacion": c["nombreAgrupacionPolitica"],
                    "votosValidos": c["totalVotosValidos"],
                    "porcentajeVotosValidos": c.get("porcentajeVotosValidos"),
                }
                for i, c in enumerate(cands)
            ],
        })
    return snaps


def existing_actualizado() -> set[str]:
    if not CSV_PATH.exists():
        return set()
    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        return {row["actualizadoAl"] for row in csv.DictReader(f)}


def append(snaps: list[dict]) -> int:
    seen = existing_actualizado()
    new = [s for s in snaps if s["actualizadoAl"] not in seen]
    if not new:
        return 0
    new_file = not CSV_PATH.exists()
    with CSV_PATH.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow([
                "capturadoEn", "actualizadoAl", "pctActasContabilizadas",
                "totalActas", "posicion", "candidato", "agrupacion",
                "votosValidos", "pctVotosValidos",
            ])
        for s in new:
            for c in s["top"]:
                w.writerow([
                    s["capturadoEn"], s["actualizadoAl"],
                    s["porcentajeActasContabilizadas"], s["totalActas"],
                    c["posicion"], c["candidato"], c["agrupacion"],
                    c["votosValidos"], c["porcentajeVotosValidos"],
                ])
    return len(new)


if __name__ == "__main__":
    snaps = build_snapshots()
    snaps.sort(key=lambda s: s["actualizadoAl"])
    print(f"\n[+] {len(snaps)} snapshots reconstruidos:")
    for s in snaps:
        lead = s["top"][0] if s["top"] else {"candidato": "-", "porcentajeVotosValidos": 0}
        print(f"  {s['actualizadoAl']}  actas={s['porcentajeActasContabilizadas']:>7.3f}%  "
              f"lider={lead['candidato'][:25]:25s} ({lead['porcentajeVotosValidos']}%)")
    added = append(snaps)
    print(f"\n[+] {added} snapshots nuevos agregados a {CSV_PATH}")
