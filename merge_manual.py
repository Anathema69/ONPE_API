"""
Integra capturas manuales (fotografias transcritas a JSON) al CSV historico.

Mantiene el schema original: capturadoEn, actualizadoAl, pctActasContabilizadas,
totalActas, posicion, candidato, agrupacion, votosValidos, pctVotosValidos.

La columna `capturadoEn` sigue el mismo patron que el backfill de Wayback:
incluye el sufijo "(manual)" / "(wayback)" para poder distinguir origen a ojo
o filtrando texto en pandas.

Dedupe por `actualizadoAl`. Si ya existe una fila con ese timestamp (ej. la
corrida API coincidente con una foto manual) se conserva la entrada previa
y se omite la manual.

Uso:
    python merge_manual.py                               # usa el path por defecto
    python merge_manual.py "data/onpe_latest - manual.json"
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from scrape_onpe import CSV_PATH

FIELDS = [
    "capturadoEn", "actualizadoAl",
    "pctActasContabilizadas", "totalActas",
    "posicion", "candidato", "agrupacion",
    "votosValidos", "pctVotosValidos",
]


def read_existing() -> tuple[list[dict], set[str]]:
    """Lee el CSV previo, descarta filas manuales (van a ser regeneradas
    desde el JSON) y dedupa por (actualizadoAl, posicion)."""
    if not CSV_PATH.exists():
        return [], set()
    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        raw = list(csv.DictReader(f))
    # purga cualquier fila marcada "(manual)" — se regenera desde el JSON
    non_manual = [r for r in raw
                  if "(manual)" not in (r.get("capturadoEn") or "")]
    purged = len(raw) - len(non_manual)
    if purged:
        print(f"[+] Purgo {purged} filas manuales previas del CSV")
    # dedup por (actualizadoAl, posicion), conserva la primera
    kept: dict[tuple, dict] = {}
    for r in non_manual:
        key = (r["actualizadoAl"], r.get("posicion"))
        kept.setdefault(key, r)
    removed = len(non_manual) - len(kept)
    if removed:
        print(f"[+] Dedup CSV previo: {removed} duplicados descartados")
    rows = list(kept.values())
    seen = {r["actualizadoAl"] for r in rows}
    return rows, seen


def rows_from_manual(path: Path, skip: set[str]) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    out, added, skipped = [], 0, 0
    for s in data:
        if s["actualizadoAl"] in skip:
            skipped += 1
            continue
        capturado = s["capturadoEn"]
        if "(manual)" not in capturado:
            capturado = f"{capturado} (manual)"
        for c in s.get("top", []):
            out.append({
                "capturadoEn": capturado,
                "actualizadoAl": s["actualizadoAl"],
                "pctActasContabilizadas": s.get("porcentajeActasContabilizadas"),
                "totalActas": s.get("totalActas"),
                "posicion": c.get("posicion"),
                "candidato": c.get("candidato"),
                "agrupacion": c.get("agrupacion"),
                "votosValidos": c.get("votosValidos"),
                "pctVotosValidos": c.get("porcentajeVotosValidos"),
            })
        added += 1
        skip.add(s["actualizadoAl"])
    print(f"[+] Manual: {added} snapshots nuevos, {skipped} ya existian en el CSV")
    return out


def write(rows: list[dict]) -> None:
    def posnum(r):
        try:
            return int(r.get("posicion") or 0)
        except ValueError:
            return 0

    rows.sort(key=lambda r: (r["actualizadoAl"], posnum(r)))
    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)


def main(manual_path: str) -> None:
    existing, seen = read_existing()
    print(f"[+] CSV previo: {len(existing)} filas, {len(seen)} snapshots")

    manual_rows = rows_from_manual(Path(manual_path), seen)
    merged = existing + manual_rows
    write(merged)

    print(f"[+] CSV reescrito: {len(merged)} filas, {len(seen)} snapshots unicos")

    # resumen cronologico
    print("\n[+] Lider por snapshot (cronologico):")
    for r in sorted(merged, key=lambda r: r["actualizadoAl"]):
        if str(r.get("posicion")) != "1":
            continue
        src = "manual " if "(manual)" in (r.get("capturadoEn") or "") else \
              "wayback" if "(wayback)" in (r.get("capturadoEn") or "") else "api    "
        print(f"  {r['actualizadoAl']}  {src}  "
              f"pct={str(r['pctActasContabilizadas']):>7s}%  "
              f"lider={(r['candidato'] or '')[:28]:28s} ({r['pctVotosValidos']}%)")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/onpe_latest - manual.json"
    main(path)
