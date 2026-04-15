"""
Sniffer: abre la SPA de ONPE con Chromium headless y registra todas las
llamadas XHR/fetch que devuelven JSON. Imprime cada URL + status + tamaño y
guarda los cuerpos en ./captures/ para inspeccionarlos.
"""
from pathlib import Path
from urllib.parse import urlparse
import json
import re
import time

from playwright.sync_api import sync_playwright

URL = "https://resultadoelectoral.onpe.gob.pe/main/presidenciales"
OUT_DIR = Path(__file__).parent / "captures"
OUT_DIR.mkdir(exist_ok=True)

SKIP_HOSTS = ("fonts.gstatic.com", "googletagmanager.com",
              "google-analytics.com", "gstatic.com", "recaptcha.net",
              "googletagservices.com", "doubleclick.net")


def safe_name(url: str) -> str:
    p = urlparse(url)
    name = f"{p.netloc}{p.path}".replace("/", "_")
    if p.query:
        name += "_" + re.sub(r"[^\w=&-]", "_", p.query)[:80]
    return re.sub(r"[^\w.=&-]", "_", name)[:180] + ".json"


def main():
    seen = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/125.0.0.0 Safari/537.36"),
            viewport={"width": 1366, "height": 900},
            locale="es-PE",
        )
        page = ctx.new_page()
        all_log = []
        page.on("response",
                lambda r: all_log.append(
                    (r.request.resource_type, r.status, r.url)))

        def on_response(resp):
            url = resp.url
            if any(h in url for h in SKIP_HOSTS):
                return
            req = resp.request
            # solo XHR/fetch, sin documentos, imágenes, css, fuentes, scripts
            if req.resource_type not in ("xhr", "fetch"):
                return
            ctype = resp.headers.get("content-type", "")
            try:
                body = resp.body()
            except Exception:
                body = b""
            seen.append((resp.status, len(body), ctype, url))
            fp = OUT_DIR / safe_name(url)
            try:
                fp.write_bytes(body)
            except OSError:
                pass

        page.on("response", on_response)
        page.on("requestfailed",
                lambda r: print(f"  [FAIL] {r.resource_type} {r.url} -> {r.failure}"))

        print(f"[+] Navegando a {URL}")
        page.goto(URL, wait_until="networkidle", timeout=60000)
        # deja unos segundos extra por si hay polling diferido
        time.sleep(8)
        # dump completo del DOM para verificar render
        html = page.content()
        (OUT_DIR / "_rendered.html").write_text(html, encoding="utf-8")
        browser.close()

    print("\n[+] LOG COMPLETO DE RESPUESTAS:")
    for rtype, status, url in all_log:
        if any(h in url for h in SKIP_HOSTS):
            continue
        print(f"  [{rtype:12s}] {status} {url[:140]}")

    print(f"\n[+] Se capturaron {len(seen)} respuestas XHR/fetch:\n")
    for status, size, ctype, url in seen:
        print(f"  {status}  {size:>8}B  {ctype[:30]:30s}  {url}")
    print(f"\n[+] Cuerpos guardados en: {OUT_DIR}")


if __name__ == "__main__":
    main()
