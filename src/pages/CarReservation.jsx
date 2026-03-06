import React, { useEffect, useMemo, useState } from "react";
import md5 from "blueimp-md5";
import { database, ref, onValue, push, set, get, update } from "../FirebaseConfig";
import styles from "./CarReservation.module.css";
import Navbar from "./Navbar";

/**
 * RENTALS model:
 * - NOW: { type:"NOW", status:"ACTIVE", startAt: ISO, endAt: null } => auto niedostępne
 * - RESERVATION: { type:"RESERVATION", status:"ACTIVE", startAt: ISO, endAt: ISO } => blokuje okno
 *
 * Konflikt okien: [S, E) koliduje z [A, B) gdy S < B && E > A
 *
 * Dodatkowo:
 * - description: string
 */

const STATUS_ALLOWED = "AVAILABLE";

function isoNow() {
  return new Date().toISOString();
}

// DateTimeLocal "YYYY-MM-DDTHH:mm" -> ISO
function dtLocalToIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
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
  return startA < endB && endA > startB;
}

function safe(v, fallback = "—") {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function normalizeName(name) {
  return (name || "").trim().replace(/\s+/g, " ");
}

function getReservationBucket(r, nowTs) {
  const s = new Date(r?.startAt || "").getTime();
  const e = new Date(r?.endAt || "").getTime();

  if (Number.isNaN(s) || Number.isNaN(e)) return "UNKNOWN";
  if (nowTs < s) return "FUTURE";
  if (nowTs >= s && nowTs < e) return "CURRENT";
  return "PAST";
}

function reservationBucketLabel(bucket) {
  switch (bucket) {
    case "CURRENT":
      return "Obecne rezerwacje";
    case "FUTURE":
      return "Przyszłe rezerwacje";
    case "PAST":
      return "Przeszłe rezerwacje";
    default:
      return "Pozostałe rezerwacje";
  }
}

export default function CarReservation() {
  const adminUserId = useMemo(
    () => localStorage.getItem("userId") || "usr_admin_001",
    []
  );

  const [users, setUsers] = useState([]);
  const [cars, setCars] = useState([]);
  const [rentals, setRentals] = useState([]);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [loggedUser, setLoggedUser] = useState(null);
  const [loginMsg, setLoginMsg] = useState(null);

  const [mode, setMode] = useState("NOW");
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

  const [returnDrafts, setReturnDrafts] = useState({});
  const [openReturnFormId, setOpenReturnFormId] = useState(null);

  const [descriptionDrafts, setDescriptionDrafts] = useState({});
  const [savingDescriptionId, setSavingDescriptionId] = useState(null);

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

  useEffect(() => {
    if (!loggedUser) {
      setDescriptionDrafts({});
      setReturnDrafts({});
      setOpenReturnFormId(null);
      return;
    }

    const mine = rentals.filter((r) => r?.borrowedByUserId === loggedUser.id);
    setDescriptionDrafts((prev) => {
      const next = { ...prev };
      mine.forEach((r) => {
        if (next[r.id] === undefined) {
          next[r.id] = r?.description ?? "";
        }
      });
      return next;
    });
  }, [rentals, loggedUser]);

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

  const myReservationsGrouped = useMemo(() => {
    if (!loggedUser) {
      return {
        current: [],
        future: [],
        past: [],
        other: [],
      };
    }

    const now = Date.now();
    const mine = rentals
      .filter((r) => {
        if (!r) return false;
        if ((r.type || "").toUpperCase() !== "RESERVATION") return false;
        return r.borrowedByUserId === loggedUser.id;
      })
      .sort((a, b) => {
        const as = new Date(a.startAt || "").getTime();
        const bs = new Date(b.startAt || "").getTime();
        return as - bs;
      });

    const grouped = {
      current: [],
      future: [],
      past: [],
      other: [],
    };

    mine.forEach((r) => {
      const bucket = getReservationBucket(r, now);
      if (bucket === "CURRENT") grouped.current.push(r);
      else if (bucket === "FUTURE") grouped.future.push(r);
      else if (bucket === "PAST") grouped.past.push(r);
      else grouped.other.push(r);
    });

    grouped.current.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    grouped.future.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    grouped.past.sort((a, b) => new Date(b.endAt).getTime() - new Date(a.endAt).getTime());

    return grouped;
  }, [rentals, loggedUser]);

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
      setLoginMsg({ type: "error", text: "PIN ma mieć 4 cyfry." });
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
    setReturnDrafts({});
    setOpenReturnFormId(null);
    setDescriptionDrafts({});
    setSavingDescriptionId(null);
  }

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
        description: "",
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
        description: "",
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

  function openReturnComment(rental) {
    setOpenReturnFormId(rental.id);
    setReturnDrafts((prev) => ({
      ...prev,
      [rental.id]: prev[rental.id] ?? (rental?.description ?? ""),
    }));
    setActionMsg(null);
  }

  function cancelReturnComment() {
    setOpenReturnFormId(null);
  }

  async function returnCar(rental) {
    if (!loggedUser) return;

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
      const description = (returnDrafts[rental.id] ?? "").trim();

      const patch = {
        status: "CLOSED",
        endAt: nowIso,
        returnedAt: nowIso,
        returnedByUserId: loggedUser.id,
        description,
        "audit/updatedAt": nowIso,
        "audit/updatedBy": loggedUser.id,
      };

      await update(ref(database, `rentals/${rental.id}`), patch);

      const car = carsById.get(rental.carId);
      setActionMsg({
        type: "ok",
        text: `Zwrócono auto: ${car?.plateNumber || rental.carId}`,
      });
      setOpenReturnFormId(null);
      setReturnDrafts((prev) => ({
        ...prev,
        [rental.id]: description,
      }));
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: "Błąd zwrotu (sprawdź konsolę)." });
    } finally {
      setBusy(false);
    }
  }

  async function saveReservationDescription(rental) {
    if (!loggedUser) return;
    if (rental.borrowedByUserId !== loggedUser.id) {
      setActionMsg({ type: "error", text: "Nie możesz edytować opisu nie swojej rezerwacji." });
      return;
    }
    if ((rental.type || "").toUpperCase() !== "RESERVATION") {
      setActionMsg({ type: "error", text: "Opis możesz edytować tylko dla rezerwacji." });
      return;
    }

    const description = (descriptionDrafts[rental.id] ?? "").trim();

    setSavingDescriptionId(rental.id);
    setActionMsg(null);

    try {
      const snap = await get(ref(database, `rentals/${rental.id}`));
      if (!snap.exists()) {
        setActionMsg({ type: "error", text: "Nie znaleziono rezerwacji w bazie." });
        setSavingDescriptionId(null);
        return;
      }

      const fresh = snap.val();
      if (!fresh || fresh.borrowedByUserId !== loggedUser.id) {
        setActionMsg({ type: "error", text: "Nie możesz edytować tej rezerwacji." });
        setSavingDescriptionId(null);
        return;
      }

      const nowIso = isoNow();
      await update(ref(database, `rentals/${rental.id}`), {
        description,
        "audit/updatedAt": nowIso,
        "audit/updatedBy": loggedUser.id,
      });

      setActionMsg({ type: "ok", text: "Zapisano opis rezerwacji." });
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: "Błąd zapisu opisu rezerwacji." });
    } finally {
      setSavingDescriptionId(null);
    }
  }

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

  function renderReservationCard(r, bucket) {
    const car = carsById.get(r.carId);
    const isSaving = savingDescriptionId === r.id;
    const statusLabel = (r.status || "").toUpperCase() || "—";

    return (
      <div key={r.id} className={styles.card}>
        <div className={styles.cardTitle}>
          {car?.plateNumber || r.carId} — {safe(car?.make)} {safe(car?.model)}
        </div>

        <div className={styles.cardMeta}>
          Typ: REZERWACJA
          <br />
          Okres: {fmtPL(r.startAt)} → {fmtPL(r.endAt)}
          <br />
          Kategoria czasu: {reservationBucketLabel(bucket)}
          <br />
          Status rekordu: {statusLabel}
        </div>

        <div className={styles.cardMeta} style={{ marginTop: 10 }}>
          <strong>Opis / komentarz</strong>
        </div>

        <textarea
          className={styles.input}
          value={descriptionDrafts[r.id] ?? ""}
          onChange={(e) =>
            setDescriptionDrafts((prev) => ({
              ...prev,
              [r.id]: e.target.value,
            }))
          }
          placeholder="Dodaj komentarz do rezerwacji..."
          disabled={busy || isSaving}
          rows={4}
          style={{ width: "100%", resize: "vertical", marginTop: 8 }}
        />

        <div className={styles.cardAction} style={{ marginTop: 10 }}>
          <button
            onClick={() => saveReservationDescription(r)}
            disabled={busy || isSaving}
            className={`${styles.btnPrimary} ${(busy || isSaving) ? styles.btnDisabled : ""}`}
          >
            {isSaving ? "..." : "Zapisz opis"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* <Navbar/> */}
      <h2 className={styles.title}>Wypożyczenie / Rezerwacja + moje auta</h2>

      <div className={styles.box}>
        <h3 className={styles.sectionTitle}>1) Wybór użytkownika + PIN</h3>

        {!loggedUser ? (
          <form onSubmit={handleLogin}>
            <div className={styles.loginGrid}>
              <div>
                <label className={styles.label}>Użytkownik</label>
                <select
                  className={styles.input}
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
                <label className={styles.label}>PIN</label>
                <input
                  className={styles.input}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="4 cyfry"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={busy}
                />
              </div>

              <div className={styles.loginButtonWrap}>
                <button
                  type="submit"
                  disabled={busy}
                  className={`${styles.btnPrimary} ${busy ? styles.btnDisabled : ""}`}
                >
                  {busy ? "..." : "Zaloguj"}
                </button>
              </div>
            </div>

            {loginMsg && <div className={styles.loginMsg}>{loginMsg.text}</div>}
          </form>
        ) : (
          <div className={styles.loggedRow}>
            <div>
              <div className={styles.loggedTitle}>Zalogowano: {loggedUser.name}</div>
            </div>
            <button onClick={handleLogout} className={styles.btnGhost}>
              Wyloguj
            </button>
          </div>
        )}
      </div>

      {loggedUser && (
        <div className={styles.box}>
          <h3 className={styles.sectionTitle}>2) Moje aktualne wypożyczenia + wszystkie moje rezerwacje</h3>

          <div className={styles.twoCols}>
            <div className={styles.innerPanel}>
              <div className={styles.panelTitle}>
                Aktualnie wypożyczone (TERAZ): {myActiveNowRentals.length}
              </div>

              {myActiveNowRentals.length === 0 ? (
                <div className={styles.muted}>Brak aktywnych wypożyczeń.</div>
              ) : (
                <div className={styles.cardsList}>
                  {myActiveNowRentals.map((r) => {
                    const car = carsById.get(r.carId);
                    const returnDesc = returnDrafts[r.id] ?? (r?.description ?? "");
                    const isOpen = openReturnFormId === r.id;

                    return (
                      <div key={r.id} className={styles.card}>
                        <div className={styles.cardTitle}>
                          {car?.plateNumber || r.carId} — {safe(car?.make)} {safe(car?.model)}
                        </div>

                        <div className={styles.cardMeta}>
                          Start: {fmtPL(r.startAt)}
                        </div>

                        {!isOpen ? (
                          <div className={styles.cardAction}>
                            <button
                              onClick={() => openReturnComment(r)}
                              disabled={busy}
                              className={`${styles.btnDanger} ${busy ? styles.btnDisabled : ""}`}
                            >
                              {busy ? "..." : "Zwróć auto"}
                            </button>
                          </div>
                        ) : (
                          <div style={{ marginTop: 12 }}>
                            <label className={styles.label}>Opis / komentarz przy zwrocie</label>
                            <textarea
                              className={styles.input}
                              rows={4}
                              style={{ width: "100%", resize: "vertical" }}
                              value={returnDesc}
                              onChange={(e) =>
                                setReturnDrafts((prev) => ({
                                  ...prev,
                                  [r.id]: e.target.value,
                                }))
                              }
                              placeholder="Np. kolizja, uszkodzenie, uwagi, brak uwag..."
                              disabled={busy}
                            />

                            <div className={styles.cardAction} style={{ marginTop: 10, display: "flex", gap: 8 }}>
                              <button
                                onClick={() => returnCar(r)}
                                disabled={busy}
                                className={`${styles.btnDanger} ${busy ? styles.btnDisabled : ""}`}
                              >
                                {busy ? "..." : "Potwierdź zwrot"}
                              </button>

                              <button
                                onClick={cancelReturnComment}
                                disabled={busy}
                                className={styles.btnGhost}
                              >
                                Anuluj
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.innerPanel}>
              <div className={styles.panelTitle}>
                Wszystkie moje rezerwacje:{" "}
                {myReservationsGrouped.current.length +
                  myReservationsGrouped.future.length +
                  myReservationsGrouped.past.length +
                  myReservationsGrouped.other.length}
              </div>

              <div className={styles.cardsList}>
                {myReservationsGrouped.current.length > 0 && (
                  <>
                    <div className={styles.panelTitle}>
                      Obecne rezerwacje: {myReservationsGrouped.current.length}
                    </div>
                    {myReservationsGrouped.current.map((r) => renderReservationCard(r, "CURRENT"))}
                  </>
                )}

                {myReservationsGrouped.future.length > 0 && (
                  <>
                    <div className={styles.panelTitle} style={{ marginTop: 12 }}>
                      Przyszłe rezerwacje: {myReservationsGrouped.future.length}
                    </div>
                    {myReservationsGrouped.future.map((r) => renderReservationCard(r, "FUTURE"))}
                  </>
                )}

                {myReservationsGrouped.past.length > 0 && (
                  <>
                    <div className={styles.panelTitle} style={{ marginTop: 12 }}>
                      Przeszłe rezerwacje: {myReservationsGrouped.past.length}
                    </div>
                    {myReservationsGrouped.past.map((r) => renderReservationCard(r, "PAST"))}
                  </>
                )}

                {myReservationsGrouped.other.length > 0 && (
                  <>
                    <div className={styles.panelTitle} style={{ marginTop: 12 }}>
                      Pozostałe / niepoprawne daty: {myReservationsGrouped.other.length}
                    </div>
                    {myReservationsGrouped.other.map((r) => renderReservationCard(r, "UNKNOWN"))}
                  </>
                )}

                {myReservationsGrouped.current.length === 0 &&
                  myReservationsGrouped.future.length === 0 &&
                  myReservationsGrouped.past.length === 0 &&
                  myReservationsGrouped.other.length === 0 && (
                    <div className={styles.muted}>Brak rezerwacji.</div>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {loggedUser && (
        <div className={styles.box}>
          <h3 className={styles.sectionTitle}>3) Wybór trybu</h3>

          <div className={styles.modeRow}>
            <label className={styles.radioLabel}>
              <input type="radio" checked={mode === "NOW"} onChange={() => setMode("NOW")} />
              <strong>Wypożycz TERAZ</strong>
            </label>

            <label className={styles.radioLabel}>
              <input
                type="radio"
                checked={mode === "RESERVATION"}
                onChange={() => setMode("RESERVATION")}
              />
              <strong>Rezerwacja na termin</strong>
            </label>
          </div>

          {mode === "RESERVATION" && (
            <div className={styles.reservationGrid}>
              <div>
                <label className={styles.label}>Start rezerwacji</label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={resStartLocal}
                  onChange={(e) => setResStartLocal(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div>
                <label className={styles.label}>Koniec rezerwacji</label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={resEndLocal}
                  onChange={(e) => setResEndLocal(e.target.value)}
                  disabled={busy}
                />
              </div>

              <div className={styles.gridFullNote}>
                Rezerwacja blokuje okno: nikt nie wypożyczy ani nie zarezerwuje w kolizji.
              </div>
            </div>
          )}
        </div>
      )}

      {loggedUser && actionMsg && (
        <div
          className={`${styles.actionMsg} ${
            actionMsg.type === "ok" ? styles.actionMsgOk : styles.actionMsgError
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {loggedUser && (
        <div className={styles.box}>
          <h3 className={styles.sectionTitle}>
            4) Auta do wyboru ({mode === "NOW" ? "dostępne TERAZ" : "dostępne w oknie rezerwacji"}):{" "}
            {availableCars.length}
          </h3>

          {availableCars.length === 0 ? (
            <div className={styles.emptyText}>
              Brak dostępnych aut dla tego trybu/okna. (Status nie pozwala, ktoś wypożyczył, albo kolizja rezerwacji.)
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr className={styles.tableHeadRow}>
                    <th className={styles.th}>Rejestracja</th>
                    <th className={styles.th}>Marka</th>
                    <th className={styles.th}>Model</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Akcja</th>
                  </tr>
                </thead>
                <tbody>
                  {availableCars.map((c) => (
                    <tr key={c.id}>
                      <td className={styles.tdStrong}>{safe(c.plateNumber)}</td>
                      <td className={styles.td}>{safe(c.make)}</td>
                      <td className={styles.td}>{safe(c.model)}</td>
                      <td className={styles.td}>{safe(c.status)}</td>
                      <td className={styles.td}>
                        {mode === "NOW" ? (
                          <button
                            onClick={() => createNowRental(c)}
                            disabled={busy}
                            className={`${styles.btnPrimary} ${busy ? styles.btnDisabled : ""}`}
                          >
                            {busy ? "..." : "Wypożycz TERAZ"}
                          </button>
                        ) : (
                          <button
                            onClick={() => createReservation(c)}
                            disabled={busy}
                            className={`${styles.btnPrimary} ${busy ? styles.btnDisabled : ""}`}
                          >
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
        </div>
      )}
    </div>
  );
}