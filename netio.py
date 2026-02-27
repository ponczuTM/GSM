#!/usr/bin/env python3

import argparse
import concurrent.futures as cf
import http.client
import socket
import ssl
import webbrowser
from pathlib import Path
from typing import Optional, Tuple, List

BASE = "10.10.233."

def fetch_is_html(ip: str, port: int, timeout: float, max_bytes: int) -> bool:
    """
    Próbuje pobrać '/' i stwierdzić, czy odpowiedź wygląda na HTML.
    Najpierw HEAD, potem (gdy trzeba) GET z limitem bajtów.
    """
    ctx = None
    if port == 443:
        ctx = ssl.create_default_context()
        # w sieciach LAN często są self-signed certyfikaty – niech nie blokują skanu
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    conn = None
    try:
        if port == 80:
            conn = http.client.HTTPConnection(ip, port=port, timeout=timeout)
        else:
            conn = http.client.HTTPSConnection(ip, port=port, timeout=timeout, context=ctx)

        # HEAD (szybciej)
        try:
            conn.request("HEAD", "/")
            resp = conn.getresponse()
            ctype = (resp.getheader("Content-Type") or "").lower()
            resp.read(0)
            if "text/html" in ctype or "application/xhtml" in ctype:
                return True
        except Exception:
            # niektóre serwery nie lubią HEAD – lecimy GET
            pass
        finally:
            try:
                conn.close()
            except Exception:
                pass

        # GET (z limitem danych)
        if port == 80:
            conn = http.client.HTTPConnection(ip, port=port, timeout=timeout)
        else:
            conn = http.client.HTTPSConnection(ip, port=port, timeout=timeout, context=ctx)

        conn.request("GET", "/", headers={"User-Agent": "lan-html-scan/1.0"})
        resp = conn.getresponse()

        ctype = (resp.getheader("Content-Type") or "").lower()
        if "text/html" in ctype or "application/xhtml" in ctype:
            return True

        # czasem brak content-type, więc sprawdzamy treść
        data = resp.read(max_bytes) or b""
        sniff = data.lstrip()[:2048].lower()
        if b"<html" in sniff or b"<!doctype html" in sniff:
            return True

        return False

    except (socket.timeout, ConnectionRefusedError, OSError, http.client.HTTPException):
        return False
    finally:
        try:
            if conn:
                conn.close()
        except Exception:
            pass

def check_host(i: int, timeout: float, max_bytes: int) -> Optional[Tuple[int, bool, bool]]:
    """
    Zwraca: (oktet, http_ok, https_ok) albo None.
    """
    ip = f"{BASE}{i}"
    http_ok = fetch_is_html(ip, 80, timeout, max_bytes)
    https_ok = fetch_is_html(ip, 443, timeout, max_bytes)
    if http_ok or https_ok:
        return (i, http_ok, https_ok)
    return None

def build_urls(octet: int, http_ok: bool, https_ok: bool, prefer_https: bool) -> List[str]:
    ip = f"{BASE}{octet}"
    urls = []
    if prefer_https:
        if https_ok:
            urls.append(f"https://{ip}/")
        if http_ok:
            urls.append(f"http://{ip}/")
    else:
        if http_ok:
            urls.append(f"http://{ip}/")
        if https_ok:
            urls.append(f"https://{ip}/")
    return urls

def write_index_html(urls: List[str], out_path: Path) -> None:
    links = "\n".join(f'<li><a href="{u}" target="_blank" rel="noopener">{u}</a></li>' for u in urls)
    html = f"""<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LAN HTML Scan</title>
  <style>
    body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 20px; }}
    code {{ background: #f3f3f3; padding: 2px 6px; border-radius: 6px; }}
    a {{ text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
  </style>
</head>
<body>
  <h1>Wyniki skanu</h1>
  <p>Łącznie: <b>{len(urls)}</b> URL-i. Kliknij, żeby otworzyć w nowych kartach.</p>
  <ul>
    {links}
  </ul>
</body>
</html>
"""
    out_path.write_text(html, encoding="utf-8")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeout", type=float, default=1.2, help="timeout na połączenie/odpowiedź (sek)")
    ap.add_argument("--workers", type=int, default=120, help="liczba wątków")
    ap.add_argument("--max-bytes", type=int, default=8192, help="ile bajtów max czytać przy GET")
    ap.add_argument(
        "--open",
        choices=["none", "tabs", "html", "both"],
        default="tabs",
        help="co zrobić po skanie: none/tabs/html/both (domyślnie tabs)",
    )
    ap.add_argument(
        "--prefer-https",
        action="store_true",
        help="jeśli host ma i HTTP i HTTPS, otwieraj najpierw HTTPS",
    )
    ap.add_argument(
        "--max-tabs",
        type=int,
        default=50,
        help="limit kart do otwarcia w trybie tabs/both (reszta będzie tylko w HTML). Domyślnie 50.",
    )
    args = ap.parse_args()

    hits: List[Tuple[int, bool, bool]] = []
    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(check_host, i, args.timeout, args.max_bytes) for i in range(1, 256)]
        for f in cf.as_completed(futs):
            res = f.result()
            if res is not None:
                hits.append(res)

    hits.sort(key=lambda x: x[0])

    # druk jak wcześniej: tylko oktety
    for octet, _, _ in hits:
        print(octet)

    # budujemy URL-e do otwarcia
    urls: List[str] = []
    for octet, http_ok, https_ok in hits:
        urls.extend(build_urls(octet, http_ok, https_ok, prefer_https=args.prefer_https))

    if args.open == "none" or not urls:
        return

    # zawsze sensownie: HTML z linkami (nawet jeśli też otwieramy karty)
    out_html = Path.cwd() / "lan_html_scan_results.html"
    if args.open in ("html", "both"):
        write_index_html(urls, out_html)
        webbrowser.open(out_html.as_uri())

    # masowe otwieranie kart często kończy się blokadą/padem przeglądarki, więc daję limit
    if args.open in ("tabs", "both"):
        to_open = urls[: max(0, args.max_tabs)]
        for u in to_open:
            webbrowser.open_new_tab(u)

        if len(urls) > len(to_open):
            # dopisz info do konsoli — reszta jest w pliku HTML
            print(f"\n[INFO] Otworzyłem {len(to_open)} kart (limit --max-tabs).")
            print(f"[INFO] Pełna lista jest w: {out_html}")

if __name__ == "__main__":
    main()