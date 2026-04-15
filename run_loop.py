"""
Runner: ejecuta scrape_onpe.fetch() cada N minutos con jitter y backoff.
Uso:
    python run_loop.py --interval 30          # produccion: cada 30 min
    python run_loop.py --interval 1 --cycles 5  # prueba: 5 iteraciones cada 1 min

Para produccion real se recomienda Windows Task Scheduler invocando
directamente scrape_onpe.py (ver README). Este runner es util para pruebas
locales y para entornos donde no haya scheduler disponible.
"""
from __future__ import annotations

import argparse
import random
import sys
import time
from datetime import datetime

import requests

import scrape_onpe


def run_once() -> bool:
    try:
        snap = scrape_onpe.fetch()
        scrape_onpe.save(snap)
        print(f"[{datetime.now().isoformat(timespec='seconds')}] "
              f"OK  actas={snap['porcentajeActasContabilizadas']}%  "
              f"actualizado={snap['actualizadoAl']}  "
              f"lider={snap['top'][0]['candidato'][:25]} "
              f"({snap['top'][0]['porcentajeVotosValidos']}%)")
        return True
    except requests.HTTPError as e:
        code = e.response.status_code if e.response else "?"
        print(f"[{datetime.now().isoformat(timespec='seconds')}] "
              f"HTTP {code}: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[{datetime.now().isoformat(timespec='seconds')}] "
              f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return False


def loop(interval_min: float, cycles: int | None) -> None:
    i = 0
    consecutive_errors = 0
    while True:
        i += 1
        ok = run_once()
        consecutive_errors = 0 if ok else consecutive_errors + 1

        if cycles and i >= cycles:
            print(f"[done] {i} ciclo(s) completados")
            return

        # backoff si hay errores seguidos
        base = interval_min * 60
        if consecutive_errors >= 3:
            base = min(base * (2 ** (consecutive_errors - 2)), 3600)
            print(f"  [backoff] {consecutive_errors} errores seguidos, "
                  f"esperando {base:.0f}s")

        jitter = random.uniform(-10, 10) if interval_min >= 1 else 0
        wait = max(5, base + jitter)
        print(f"  siguiente corrida en {wait:.0f}s\n")
        time.sleep(wait)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--interval", type=float, default=30,
                    help="minutos entre corridas (default: 30)")
    ap.add_argument("--cycles", type=int, default=None,
                    help="numero de corridas; omitir para infinito")
    args = ap.parse_args()
    loop(args.interval, args.cycles)
