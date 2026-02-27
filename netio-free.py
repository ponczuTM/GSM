#!/usr/bin/env python3
import ipaddress
import platform
import subprocess
import concurrent.futures
from typing import List, Tuple

NETWORK_PREFIX = "10.10.233."
START_HOST = 1
END_HOST = 255

# Ile równoległych pingów (zbyt dużo może dusić sieć i/lub hosta)
MAX_WORKERS = 150

# Timeout jednego pinga w ms (Windows) lub w sekundach (Linux/macOS)
TIMEOUT_MS = 500  # sensowne dla LAN; zwiększ np. do 1000 jeśli potrzeba


def ping(ip: str, timeout_ms: int = TIMEOUT_MS) -> bool:
    """
    Zwraca True jeśli host odpowiada na ping (czyli uznajemy go za zajęty),
    False jeśli brak odpowiedzi.
    """
    system = platform.system().lower()

    if "windows" in system:
        # -n 1 => 1 echo request
        # -w timeout_ms => timeout w ms
        cmd = ["ping", "-n", "1", "-w", str(timeout_ms), ip]
    else:
        # Linux/macOS:
        # -c 1 => 1 pakiet
        # -W timeout => timeout w sekundach (linux)
        # macOS używa -W w ms inaczej; żeby było w miarę przenośne, użyjemy subprocess timeout.
        cmd = ["ping", "-c", "1", ip]

    try:
        # dodatkowy twardy timeout na cały proces pinga
        hard_timeout = max(1.0, timeout_ms / 1000.0 + 0.5)
        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=hard_timeout,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def scan_range(prefix: str, start: int, end: int) -> Tuple[List[int], List[int]]:
    """
    Pingujemy prefix.start..prefix.end
    Zwraca (occupied_hosts, free_hosts) jako listy numerów hostów (ostatni oktet).
    """
    occupied = []
    free = []

    ips = [(h, f"{prefix}{h}") for h in range(start, end + 1)]

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        future_to_host = {ex.submit(ping, ip): host for host, ip in ips}
        for fut in concurrent.futures.as_completed(future_to_host):
            host = future_to_host[fut]
            try:
                is_up = fut.result()
            except Exception:
                is_up = False

            if is_up:
                occupied.append(host)
            else:
                free.append(host)

    occupied.sort()
    free.sort()
    return occupied, free


def build_free_quads(free_hosts: List[int], quad_size: int = 4) -> List[Tuple[int, int]]:
    """
    Z listy wolnych hostów (ostatni oktet) buduje zakresy (start,end)
    dla czterech kolejnych wolnych IP.
    """
    free_set = set(free_hosts)
    quads = []

    h = min(free_hosts) if free_hosts else None
    if h is None:
        return quads

    # iterujemy po całym zakresie, a nie po samych wolnych, żeby łatwo łapać ciągi
    for start in range(START_HOST, END_HOST - quad_size + 2):
        ok = True
        for x in range(start, start + quad_size):
            if x not in free_set:
                ok = False
                break
        if ok:
            quads.append((start, start + quad_size - 1))

    # Opcjonalnie: usuń nachodzące na siebie czwórki, jeśli chcesz TYLKO rozłączne zestawy
    # np. mając wolne 1..10, powyżej dostaniesz (1-4),(2-5),(3-6)...
    # a zwykle chcesz (1-4),(5-8) itd. – czyli rozłączne.
    disjoint = []
    last_end = 0
    for s, e in quads:
        if s > last_end:
            disjoint.append((s, e))
            last_end = e

    return disjoint


def main():
    occupied, free = scan_range(NETWORK_PREFIX, START_HOST, END_HOST)

    print(f"Zajęte (odpowiadają na ping): {len(occupied)}")
    if occupied:
        print(", ".join(f"{NETWORK_PREFIX}{h}" for h in occupied))
    print()

    print(f"Wolne (brak odpowiedzi): {len(free)}")
    print()

    quads = build_free_quads(free, quad_size=4)

    print("Zestawy 4 kolejnych wolnych IP (rozłączne):")
    if not quads:
        print("Brak czterech kolejnych wolnych IP w tym zakresie.")
        return

    for s, e in quads:
        ips = [f"{NETWORK_PREFIX}{h}" for h in range(s, e + 1)]
        # wypisz jako "2,3,4,5" (ostatnie oktety) i pełne IP obok
        octets = ",".join(str(h) for h in range(s, e + 1))
        print(f"{octets}   ->   {', '.join(ips)}")


if __name__ == "__main__":
    main()