"""
Compara el actualizadoAl del snapshot actual vs el ultimo desplegado.
Si cambio, ejecuta `npm run build` + `vercel deploy --prod`.

Uso: invocado desde run_scrape.bat tras el scrape.
  python scripts/check_and_deploy.py

Archivos:
  data/onpe_latest.json    -> corte mas reciente (salida de scrape_onpe.py)
  .last_deployed           -> actualizadoAl de la ultima corrida subida
  .vercel_token            -> token (una sola linea)

Exit codes:
  0  -> deploy hecho (o nada que hacer, mismo snapshot)
  1  -> error en scrape / build / deploy
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LATEST_JSON = ROOT / "data" / "onpe_latest.json"
STATE_FILE = ROOT / ".last_deployed"
TOKEN_FILE = ROOT / ".vercel_token"
WEB_DIR = ROOT / "web2"


def run(cmd: list[str], cwd: Path | None = None, env: dict | None = None) -> int:
    print(f"  [$] {' '.join(cmd)}  (cwd={cwd or ROOT})", flush=True)
    # En Windows: CREATE_NO_WINDOW evita que vercel.cmd (y sus hijos node.exe)
    # abran ventanas cmd cuando la tarea corre en segundo plano via wscript.
    kwargs: dict = {}
    if os.name == "nt":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return subprocess.run(cmd, cwd=cwd or ROOT, env=env, shell=False, **kwargs).returncode


def main() -> int:
    if not LATEST_JSON.exists():
        print("[deploy] no hay onpe_latest.json — salgo sin hacer nada")
        return 0

    snap = json.loads(LATEST_JSON.read_text(encoding="utf-8"))
    current = snap.get("actualizadoAl")
    if not current:
        print("[deploy] snapshot sin actualizadoAl — salgo")
        return 0

    last = STATE_FILE.read_text(encoding="utf-8").strip() if STATE_FILE.exists() else ""
    if current == last:
        print(f"[deploy] sin cambios (actualizadoAl={current}) — no redeploy")
        return 0

    print(f"[deploy] nuevo snapshot: {last or '(ninguno)'} -> {current}")

    if not TOKEN_FILE.exists():
        print("[deploy] ERROR: falta .vercel_token en la raiz del proyecto")
        return 1
    token = TOKEN_FILE.read_text(encoding="utf-8").strip()

    vercel = "vercel.cmd" if os.name == "nt" else "vercel"

    # pull settings primero (idempotente, cachea .vercel/project settings)
    rc = run(
        [vercel, "pull", "--yes", "--environment=production", f"--token={token}"],
        cwd=WEB_DIR,
    )
    if rc != 0:
        print("[deploy] vercel pull fallido")
        return 1

    # vercel build ejecuta internamente el npm run build (copy-data + vite)
    # y produce .vercel/output listo para --prebuilt deploy
    rc = run([vercel, "build", "--prod", f"--token={token}"], cwd=WEB_DIR)
    if rc != 0:
        print("[deploy] vercel build fallido")
        return 1

    rc = run(
        [vercel, "deploy", "--prebuilt", "--prod", f"--token={token}", "--yes"],
        cwd=WEB_DIR,
    )
    if rc != 0:
        print("[deploy] vercel deploy fallido")
        return 1

    STATE_FILE.write_text(current, encoding="utf-8")
    print(f"[deploy] OK — estado guardado: {current}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
