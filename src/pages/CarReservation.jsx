import React, { useEffect, useMemo, useState } from "react";
import md5 from "blueimp-md5";
import { database, ref, onValue, push, set, get, update } from "../FirebaseConfig";

/**
 * RENTALS model:
 * - NOW: { type:"NOW", status:"ACTIVE", startAt: ISO, endAt: null } => auto niedostępne
 * - RESERVATION: { type:"RESERVATION", status:"ACTIVE", startAt: ISO, endAt: ISO } => blokuje okno
 *
 * Konflikt okien: [S, E) koliduje z [A, B) gdy S < B && E > A
 */

const STATUS_ALLOWED = "AVAILABLE";

function isoNow() {
  return new Date().toISOString();
}

// DateTimeLocal "YYYY-MM-DDTHH:mm" -> ISO
function dtLocalToIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v); // lokalny czas
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ISO -> "YYYY-MM-DDTHH:mm"
function isoToDtLocal(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  } catch {
    return "";
  }
}

function fmtPL(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL");
  } catch {
    return "—";
  }
}

function overlaps(startA, endA, startB, endB) {
  // [startA, endA) vs [startB, endB)
  return startA < endB && endA > startB;
}

function safe(v, fallback = "—") {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function normalizeName(name) {
  return (name || "").trim().replace(/\s+/g, " ");
}

export default function CarReservation() {
  // adminId do audytu (w realu: z auth)
  const adminUserId = useMemo(
    () => localStorage.getItem("userId") || "usr_admin_001",
    []
  );

  // Data
  const [users, setUsers] = useState([]);
  const [cars, setCars] = useState([]);
  const [rentals, setRentals] = useState([]);

  // Login
  const [selectedUserId, setSelectedUserId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [loggedUser, setLoggedUser] = useState(null);
  const [loginMsg, setLoginMsg] = useState(null);

  // Mode
  const [mode, setMode] = useState("NOW"); // "NOW" | "RESERVATION"
  const [resStartLocal, setResStartLocal] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return isoToDtLocal(d.toISOString());
  });
  const [resEndLocal, setResEndLocal] = useState(() => {
    const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
    return isoToDtLocal(d.toISOString());
  });

  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  // ===== realtime loads =====
  useEffect(() => {
    const unsubUsers = onValue(
      ref(database, "users"),
      (snap) => {
        const val = snap.val();
        const arr = val ? Object.values(val) : [];
        const filtered = arr
          .filter((u) => u?.isActive && (u?.role || "").toUpperCase() === "USER")
          .sort((a, b) => (a?.name || "").localeCompare(b?.name || ""));
        setUsers(filtered);
      },
      (err) => console.error(err)
    );

    const unsubCars = onValue(
      ref(database, "cars"),
      (snap) => {
        const val = snap.val();
        const arr = val ? Object.values(val) : [];
        arr.sort((a, b) => {
          const aArch = !!a?.isArchived;
          const bArch = !!b?.isArchived;
          if (aArch !== bArch) return aArch ? 1 : -1;
          return (a?.plateNumber || "").localeCompare(b?.plateNumber || "");
        });
        setCars(arr);
      },
      (err) => console.error(err)
    );

    const unsubRentals = onValue(
      ref(database, "rentals"),
      (snap) => {
        const val = snap.val();
        const arr = val ? Object.values(val) : [];
        setRentals(arr);
      },
      (err) => console.error(err)
    );

    return () => {
      unsubUsers();
      unsubCars();
      unsubRentals();
    };
  }, []);

  // ===== helper lookups =====
  const carsById = useMemo(() => {
    const m = new Map();
    cars.forEach((c) => c?.id && m.set(c.id, c));
    return m;
  }, [cars]);

  const activeNowByCarId = useMemo(() => {
    const map = new Map();
    rentals.forEach((r) => {
      if (!r) return;
      if ((r.type || "").toUpperCase() !== "NOW") return;
      if ((r.status || "").toUpperCase() !== "ACTIVE") return;
      if (r.endAt !== null && r.endAt !== undefined) return;
      if (!r.carId) return;
      map.set(r.carId, r);
    });
    return map;
  }, [rentals]);

  const activeReservationsByCarId = useMemo(() => {
    const map = new Map();
    rentals.forEach((r) => {
      if (!r) return;
      if ((r.type || "").toUpperCase() !== "RESERVATION") return;
      if ((r.status || "").toUpperCase() !== "ACTIVE") return;
      if (!r.carId) return;
      if (!r.startAt || !r.endAt) return;

      const list = map.get(r.carId) || [];
      list.push(r);
      map.set(r.carId, list);
    });

    for (const [k, list] of map.entries()) {
      list.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
      map.set(k, list);
    }
    return map;
  }, [rentals]);

  function carIsOperationallyAllowed(car) {
    if (!car) return false;
    if (car.isArchived) return false;
    return (car.status || "").toUpperCase() === STATUS_ALLOWED;
  }

  function carHasActiveNow(carId) {
    return activeNowByCarId.has(carId);
  }

  function carHasReservationConflict(carId, windowStartIso, windowEndIso) {
    const list = activeReservationsByCarId.get(carId) || [];
    if (!windowStartIso || !windowEndIso) return false;

    const ws = new Date(windowStartIso).getTime();
    const we = new Date(windowEndIso).getTime();
    if (Number.isNaN(ws) || Number.isNaN(we)) return true;
    if (we <= ws) return true;

    return list.some((r) => {
      const rs = new Date(r.startAt).getTime();
      const re = new Date(r.endAt).getTime();
      if (Number.isNaN(rs) || Number.isNaN(re)) return true;
      return overlaps(ws, we, rs, re);
    });
  }

  function carIsAvailableForNow(car) {
    if (!carIsOperationallyAllowed(car)) return false;
    if (carHasActiveNow(car.id)) return false;

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const endIso = new Date(now + 60 * 1000).toISOString();
    if (carHasReservationConflict(car.id, nowIso, endIso)) return false;

    return true;
  }

  function carIsAvailableForReservation(car, startIso, endIso) {
    if (!carIsOperationallyAllowed(car)) return false;
    if (carHasActiveNow(car.id)) return false;
    if (carHasReservationConflict(car.id, startIso, endIso)) return false;
    return true;
  }

  // ===== user's own stuff (after login) =====
  const myActiveNowRentals = useMemo(() => {
    if (!loggedUser) return [];
    return rentals
      .filter((r) => {
        if (!r) return false;
        if ((r.type || "").toUpperCase() !== "NOW") return false;
        if ((r.status || "").toUpperCase() !== "ACTIVE") return false;
        if (!(r.endAt === null || r.endAt === undefined)) return false;
        return r.borrowedByUserId === loggedUser.id;
      })
      .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
  }, [rentals, loggedUser]);

  const myFutureReservations = useMemo(() => {
    if (!loggedUser) return [];
    const now = Date.now();
    return rentals
      .filter((r) => {
        if (!r) return false;
        if ((r.type || "").toUpperCase() !== "RESERVATION") return false;
        if ((r.status || "").toUpperCase() !== "ACTIVE") return false;
        if (r.borrowedByUserId !== loggedUser.id) return false;
        if (!r.startAt) return false;
        const rs = new Date(r.startAt).getTime();
        return !Number.isNaN(rs) && rs > now;
      })
      .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
  }, [rentals, loggedUser]);

  // ===== login =====
  async function handleLogin(e) {
    e.preventDefault();
    setLoginMsg(null);
    setActionMsg(null);

    const uid = selectedUserId;
    const pin = pinInput.trim();

    if (!uid) {
      setLoginMsg({ type: "error", text: "Wybierz użytkownika." });
      return;
    }
    if (!/^[0-9]{4,8}$/.test(pin)) {
      setLoginMsg({ type: "error", text: "PIN ma mieć 4–8 cyfr." });
      return;
    }

    setBusy(true);
    try {
      const snap = await get(ref(database, `users/${uid}`));
      if (!snap.exists()) {
        setLoginMsg({ type: "error", text: "Nie znaleziono użytkownika w bazie." });
        setBusy(false);
        return;
      }
      const u = snap.val();
      if (!u.isActive) {
        setLoginMsg({ type: "error", text: "Użytkownik jest nieaktywny." });
        setBusy(false);
        return;
      }
      if ((u.role || "").toUpperCase() !== "USER") {
        setLoginMsg({ type: "error", text: "To nie jest konto USER." });
        setBusy(false);
        return;
      }

      const salt = u?.pin?.salt || "";
      const expected = u?.pin?.hashMd5 || "";
      const got = md5(`${salt}${pin}`);

      if (!expected || got !== expected) {
        setLoginMsg({ type: "error", text: "Zły PIN." });
        setBusy(false);
        return;
      }

      setLoggedUser({ id: u.id, name: u.name, role: u.role });
      setLoginMsg({ type: "ok", text: `Zalogowano: ${u.name}` });
      setPinInput("");
    } catch (err) {
      console.error(err);
      setLoginMsg({ type: "error", text: "Błąd logowania (sprawdź konsolę)." });
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    setLoggedUser(null);
    setSelectedUserId("");
    setPinInput("");
    setLoginMsg(null);
    setActionMsg(null);
    setMode("NOW");
  }

  // ===== actions =====
  async function createNowRental(car) {
    if (!loggedUser) return;

    setBusy(true);
    setActionMsg(null);

    try {
      const [carsSnap, rentalsSnap] = await Promise.all([
        get(ref(database, `cars/${car.id}`)),
        get(ref(database, "rentals")),
      ]);

      if (!carsSnap.exists()) {
        setActionMsg({ type: "error", text: "Auto nie istnieje w bazie." });
        setBusy(false);
        return;
      }
      const freshCar = carsSnap.val();
      const rentalsVal = rentalsSnap.exists() ? Object.values(rentalsSnap.val()) : [];

      const nowActive = rentalsVal.some(
        (r) =>
          r?.carId === car.id &&
          (r?.type || "").toUpperCase() === "NOW" &&
          (r?.status || "").toUpperCase() === "ACTIVE" &&
          (r?.endAt === null || r?.endAt === undefined)
      );

      if ((freshCar.status || "").toUpperCase() !== STATUS_ALLOWED || freshCar.isArchived) {
        setActionMsg({ type: "error", text: "Auto nie jest dostępne operacyjnie (status/archiwum)." });
        setBusy(false);
        return;
      }
      if (nowActive) {
        setActionMsg({ type: "error", text: "Ktoś właśnie wypożyczył to auto." });
        setBusy(false);
        return;
      }

      const now = Date.now();
      const reservationConflictNow = rentalsVal.some((r) => {
        if (r?.carId !== car.id) return false;
        if ((r?.type || "").toUpperCase() !== "RESERVATION") return false;
        if ((r?.status || "").toUpperCase() !== "ACTIVE") return false;
        if (!r?.startAt || !r?.endAt) return false;
        const rs = new Date(r.startAt).getTime();
        const re = new Date(r.endAt).getTime();
        return overlaps(now, now + 60 * 1000, rs, re);
      });

      if (reservationConflictNow) {
        setActionMsg({ type: "error", text: "Auto ma rezerwację na teraz (kolizja)." });
        setBusy(false);
        return;
      }

      const nowIso2 = isoNow();
      const newRef = push(ref(database, "rentals"));
      const id = newRef.key;

      const payload = {
        id,
        carId: car.id,

        type: "NOW",
        status: "ACTIVE",

        startAt: nowIso2,
        endAt: null,

        borrowedByUserId: loggedUser.id,

        returnedAt: null,
        returnedByUserId: null,

        notes: null,

        audit: {
          createdAt: nowIso2,
          createdBy: adminUserId,
          updatedAt: nowIso2,
          updatedBy: adminUserId,
        },

        adminCorrections: [],
      };

      await set(newRef, payload);
      setActionMsg({ type: "ok", text: `Wypożyczono TERAZ: ${car.plateNumber} dla ${loggedUser.name}` });
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: "Błąd zapisu wypożyczenia (sprawdź konsolę)." });
    } finally {
      setBusy(false);
    }
  }

  async function createReservation(car) {
    if (!loggedUser) return;

    const startIso = dtLocalToIsoOrNull(resStartLocal);
    const endIso = dtLocalToIsoOrNull(resEndLocal);

    if (!startIso || !endIso) {
      setActionMsg({ type: "error", text: "Podaj poprawne daty start/koniec." });
      return;
    }
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) {
      setActionMsg({ type: "error", text: "Koniec musi być po starcie." });
      return;
    }

    setBusy(true);
    setActionMsg(null);

    try {
      const [carsSnap, rentalsSnap] = await Promise.all([
        get(ref(database, `cars/${car.id}`)),
        get(ref(database, "rentals")),
      ]);

      if (!carsSnap.exists()) {
        setActionMsg({ type: "error", text: "Auto nie istnieje w bazie." });
        setBusy(false);
        return;
      }
      const freshCar = carsSnap.val();
      const rentalsVal = rentalsSnap.exists() ? Object.values(rentalsSnap.val()) : [];

      if ((freshCar.status || "").toUpperCase() !== STATUS_ALLOWED || freshCar.isArchived) {
        setActionMsg({ type: "error", text: "Auto nie jest dostępne operacyjnie (status/archiwum)." });
        setBusy(false);
        return;
      }

      const nowActive = rentalsVal.some(
        (r) =>
          r?.carId === car.id &&
          (r?.type || "").toUpperCase() === "NOW" &&
          (r?.status || "").toUpperCase() === "ACTIVE" &&
          (r?.endAt === null || r?.endAt === undefined)
      );
      if (nowActive) {
        setActionMsg({ type: "error", text: "Auto jest aktualnie wypożyczone (aktywny NOW)." });
        setBusy(false);
        return;
      }

      const conflict = rentalsVal.some((r) => {
        if (r?.carId !== car.id) return false;
        if ((r?.type || "").toUpperCase() !== "RESERVATION") return false;
        if ((r?.status || "").toUpperCase() !== "ACTIVE") return false;
        if (!r?.startAt || !r?.endAt) return false;
        const rs = new Date(r.startAt).getTime();
        const re = new Date(r.endAt).getTime();
        return overlaps(s, e, rs, re);
      });

      if (conflict) {
        setActionMsg({ type: "error", text: "Kolizja z inną rezerwacją w tym oknie." });
        setBusy(false);
        return;
      }

      const nowIso2 = isoNow();
      const newRef = push(ref(database, "rentals"));
      const id = newRef.key;

      const payload = {
        id,
        carId: car.id,

        type: "RESERVATION",
        status: "ACTIVE",

        startAt: startIso,
        endAt: endIso,

        borrowedByUserId: loggedUser.id,

        returnedAt: null,
        returnedByUserId: null,

        notes: null,

        audit: {
          createdAt: nowIso2,
          createdBy: adminUserId,
          updatedAt: nowIso2,
          updatedBy: adminUserId,
        },

        adminCorrections: [],
      };

      await set(newRef, payload);
      setActionMsg({
        type: "ok",
        text: `Zarezerwowano: ${car.plateNumber} dla ${loggedUser.name} (${resStartLocal} → ${resEndLocal})`,
      });
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: "Błąd zapisu rezerwacji (sprawdź konsolę)." });
    } finally {
      setBusy(false);
    }
  }

  async function returnCar(rental) {
    if (!loggedUser) return;

    // twarda zasada: user może zwrócić tylko swój aktywny NOW
    if (rental.borrowedByUserId !== loggedUser.id) {
      setActionMsg({ type: "error", text: "Nie możesz zwrócić auta, którego nie wypożyczyłeś." });
      return;
    }
    if ((rental.type || "").toUpperCase() !== "NOW" || (rental.status || "").toUpperCase() !== "ACTIVE") {
      setActionMsg({ type: "error", text: "Ten rekord nie jest aktywnym wypożyczeniem NOW." });
      return;
    }
    if (!(rental.endAt === null || rental.endAt === undefined)) {
      setActionMsg({ type: "error", text: "To wypożyczenie jest już zakończone." });
      return;
    }

    setBusy(true);
    setActionMsg(null);

    try {
      // re-check świeżo: rental nadal aktywny
      const snap = await get(ref(database, `rentals/${rental.id}`));
      if (!snap.exists()) {
        setActionMsg({ type: "error", text: "Nie znaleziono wypożyczenia w bazie." });
        setBusy(false);
        return;
      }
      const fresh = snap.val();
      if (!fresh || (fresh.status || "").toUpperCase() !== "ACTIVE" || (fresh.endAt !== null && fresh.endAt !== undefined)) {
        setActionMsg({ type: "error", text: "Ktoś już zakończył to wypożyczenie." });
        setBusy(false);
        return;
      }

      const nowIso = isoNow();
      const patch = {
        status: "CLOSED",
        endAt: nowIso,
        returnedAt: nowIso,
        returnedByUserId: loggedUser.id,
        "audit/updatedAt": nowIso,
        "audit/updatedBy": loggedUser.id, // tu już user wykonuje akcję
      };

      await update(ref(database, `rentals/${rental.id}`), patch);

      const car = carsById.get(rental.carId);
      setActionMsg({
        type: "ok",
        text: `Zwrócono auto: ${car?.plateNumber || rental.carId}`,
      });
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: "Błąd zwrotu (sprawdź konsolę)." });
    } finally {
      setBusy(false);
    }
  }

  // ===== list of available cars =====
  const availableCars = useMemo(() => {
    if (!loggedUser) return [];

    if (mode === "NOW") {
      return cars.filter((c) => carIsAvailableForNow(c));
    }

    const sIso = dtLocalToIsoOrNull(resStartLocal);
    const eIso = dtLocalToIsoOrNull(resEndLocal);
    if (!sIso || !eIso) return [];

    return cars.filter((c) => carIsAvailableForReservation(c, sIso, eIso));
  }, [loggedUser, mode, cars, resStartLocal, resEndLocal, rentals]);

  // ===== UI styles =====
  const box = {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: 16,
    background: "#fff",
    marginBottom: 14,
  };

  const label = { display: "block", fontSize: 12, opacity: 0.8, marginBottom: 6 };
  const input = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #ccc",
    outline: "none",
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 18 }}>
      <h2 style={{ marginBottom: 10 }}>Wypożyczenie / Rezerwacja + moje auta</h2>

      {/* LOGIN */}
      <div style={box}>
        <h3 style={{ marginTop: 0 }}>1) Wybór użytkownika + PIN</h3>

        {!loggedUser ? (
          <form onSubmit={handleLogin}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12 }}>
              <div>
                <label style={label}>Użytkownik</label>
                <select
                  style={input}
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">— wybierz —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {normalizeName(u.name)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={label}>PIN</label>
                <input
                  style={input}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="4–8 cyfr"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={busy}
                />
              </div>

              <div style={{ display: "flex", alignItems: "end" }}>
                <button type="submit" disabled={busy} style={btnPrimary(busy)}>
                  {busy ? "..." : "Zaloguj"}
                </button>
              </div>
            </div>

            {loginMsg && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #ddd" }}>
                {loginMsg.text}
              </div>
            )}
          </form>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 900 }}>Zalogowano: {loggedUser.name}</div>
              <div style={{ opacity: 0.7, fontSize: 12 }}>
                userId: <code>{loggedUser.id}</code>
              </div>
            </div>
            <button onClick={handleLogout} style={btnGhost}>
              Wyloguj
            </button>
          </div>
        )}
      </div>

      {/* MOJE - active rentals / future reservations */}
      {loggedUser && (
        <div style={box}>
          <h3 style={{ marginTop: 0 }}>2) Moje aktualne wypożyczenia + przyszłe rezerwacje</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* active NOW */}
            <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Aktualnie wypożyczone (TERAZ): {myActiveNowRentals.length}</div>

              {myActiveNowRentals.length === 0 ? (
                <div style={{ opacity: 0.75 }}>Brak aktywnych wypożyczeń.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {myActiveNowRentals.map((r) => {
                    const car = carsById.get(r.carId);
                    return (
                      <div
                        key={r.id}
                        style={{
                          border: "1px solid #ddd",
                          borderRadius: 10,
                          padding: 10,
                          background: "#fff",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>
                          {car?.plateNumber || r.carId} — {safe(car?.make)} {safe(car?.model)}
                        </div>
                        <div style={{ opacity: 0.75, fontSize: 12 }}>
                          Start: {fmtPL(r.startAt)}
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <button
                            onClick={() => returnCar(r)}
                            disabled={busy}
                            style={btnDanger(busy)}
                          >
                            {busy ? "..." : "Zwróć auto"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* future reservations */}
            <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Moje przyszłe rezerwacje: {myFutureReservations.length}</div>

              {myFutureReservations.length === 0 ? (
                <div style={{ opacity: 0.75 }}>Brak przyszłych rezerwacji.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {myFutureReservations.map((r) => {
                    const car = carsById.get(r.carId);
                    return (
                      <div
                        key={r.id}
                        style={{
                          border: "1px solid #ddd",
                          borderRadius: 10,
                          padding: 10,
                          background: "#fff",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>
                          {car?.plateNumber || r.carId} — {safe(car?.make)} {safe(car?.model)}
                        </div>
                        <div style={{ opacity: 0.75, fontSize: 12 }}>
                          Od: {fmtPL(r.startAt)}
                          <br />
                          Do: {fmtPL(r.endAt)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
            Zwrot działa tylko dla aktywnego NOW (endAt=null). Rezerwacje są tylko podglądowe w tym ekranie.
          </div>
        </div>
      )}

      {/* MODE */}
      {loggedUser && (
        <div style={box}>
          <h3 style={{ marginTop: 0 }}>3) Wybór trybu</h3>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="radio" checked={mode === "NOW"} onChange={() => setMode("NOW")} />
              <strong>Wypożycz TERAZ</strong>
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="radio"
                checked={mode === "RESERVATION"}
                onChange={() => setMode("RESERVATION")}
              />
              <strong>Rezerwacja na termin</strong>
            </label>
          </div>

          {mode === "RESERVATION" && (
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Start rezerwacji</label>
                <input
                  style={input}
                  type="datetime-local"
                  value={resStartLocal}
                  onChange={(e) => setResStartLocal(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div>
                <label style={label}>Koniec rezerwacji</label>
                <input
                  style={input}
                  type="datetime-local"
                  value={resEndLocal}
                  onChange={(e) => setResEndLocal(e.target.value)}
                  disabled={busy}
                />
              </div>

              <div style={{ gridColumn: "1 / -1", opacity: 0.75, fontSize: 12 }}>
                Rezerwacja blokuje okno: nikt nie wypożyczy ani nie zarezerwuje w kolizji.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ACTION MESSAGE */}
      {loggedUser && actionMsg && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            marginBottom: 14,
            border: "1px solid",
            borderColor: actionMsg.type === "ok" ? "#86efac" : "#fca5a5",
            background: actionMsg.type === "ok" ? "#f0fdf4" : "#fef2f2",
          }}
        >
          {actionMsg.text}
        </div>
      )}

      {/* AVAILABLE CARS */}
      {loggedUser && (
        <div style={box}>
          <h3 style={{ marginTop: 0 }}>
            4) Auta do wyboru ({mode === "NOW" ? "dostępne TERAZ" : "dostępne w oknie rezerwacji"}):{" "}
            {availableCars.length}
          </h3>

          {availableCars.length === 0 ? (
            <div style={{ opacity: 0.8 }}>
              Brak dostępnych aut dla tego trybu/okna. (Status nie pozwala, ktoś wypożyczył, albo kolizja rezerwacji.)
            </div>
          ) : (
            <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#fafafa" }}>
                    <th style={th}>Rejestracja</th>
                    <th style={th}>Marka</th>
                    <th style={th}>Model</th>
                    <th style={th}>Status</th>
                    <th style={th}>Akcja</th>
                  </tr>
                </thead>
                <tbody>
                  {availableCars.map((c) => (
                    <tr key={c.id}>
                      <td style={tdStrong}>{safe(c.plateNumber)}</td>
                      <td style={td}>{safe(c.make)}</td>
                      <td style={td}>{safe(c.model)}</td>
                      <td style={td}>{safe(c.status)}</td>
                      <td style={td}>
                        {mode === "NOW" ? (
                          <button onClick={() => createNowRental(c)} disabled={busy} style={btnPrimary(busy)}>
                            {busy ? "..." : "Wypożycz TERAZ"}
                          </button>
                        ) : (
                          <button onClick={() => createReservation(c)} disabled={busy} style={btnPrimary(busy)}>
                            {busy ? "..." : "Zarezerwuj"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 12, opacity: 0.75, fontSize: 12 }}>
            Realtime: po wypożyczeniu/rezerwacji wpis trafia do <code>/rentals</code>, a lista aut od razu się przelicza.
          </div>
        </div>
      )}

      <div style={{ opacity: 0.65, fontSize: 12 }}>
        Dane realtime: users={users.length}, cars={cars.length}, rentals={rentals.length}
      </div>
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #eee",
  whiteSpace: "nowrap",
};

const td = {
  padding: "10px 10px",
  borderBottom: "1px solid #f0f0f0",
  verticalAlign: "top",
};

const tdStrong = {
  ...td,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

function btnPrimary(disabled) {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: disabled ? "#eee" : "#111",
    color: disabled ? "#111" : "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
    width: "100%",
  };
}

function btnDanger(disabled) {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #7f1d1d",
    background: disabled ? "#eee" : "#7f1d1d",
    color: disabled ? "#111" : "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 900,
    width: "100%",
  };
}

const btnGhost = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 800,
};