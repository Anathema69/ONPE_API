"""
Los timestamps del JSON manual fueron transcritos de capturas de la pagina
de ONPE, que muestra la hora en UTC-3 (no en hora Lima real UTC-5). Este
script desplaza todos los campos de fecha 2 horas hacia atras y conserva
el offset "-05:00", dejando la serie alineada con los demas origenes
(API y Wayback) que ya viven en Lima/UTC-5.

Uso:
    python fix_tz_manual.py "data/onpe_latest - manual.json"
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

LIMA = timezone(timedelta(hours=-5))
SHIFT = timedelta(hours=-2)


def shift(iso: str) -> str:
    dt = datetime.fromisoformat(iso)
    return (dt + SHIFT).astimezone(LIMA).isoformat(timespec="seconds")


def main(path: str) -> None:
    p = Path(path)
    data = json.loads(p.read_text(encoding="utf-8"))
    for s in data:
        for k in ("capturadoEn", "actualizadoAl"):
            if k in s:
                s[k] = shift(s[k])
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                 encoding="utf-8")
    print(f"[+] {len(data)} snapshots ajustados (-2h) en {p.name}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data/onpe_latest - manual.json")
