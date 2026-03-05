import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import md5 from "blueimp-md5";
import { database, ref, onValue, get, update, set } from "../FirebaseConfig";

/**
 * ADMIN PANEL:
 * - linki do podstron
 * - pełny odczyt i edycja: users, cars, rentals
 * - edycja: UI + edycja JSON
 *
 * Uwaga: PIN w plain nie istnieje w bazie (jest hash+salt). Admin widzi hash/salt i może resetować PIN.
 */

function safe(v, fallback = "—") {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function fmtPL(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL");
  } catch {
    return "—";
  }
}

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

function parseJsonSafe(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e?.message || "JSON parse error" };
  }
}

function randomSalt(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `slt_${out}`;
}

export default function AdminCars() {
  const adminUserId = useMemo(
    () => localStorage.getItem("userId") || "usr_admin_001",
    []
  );

  const [users, setUsers] = useState([]);
  const [cars, setCars] = useState([]);
  const [rentals, setRentals] = useState([]);

  const [loading, setLoading] = useState(true);

  // Editor state
  const [activeTab, setActiveTab] = useState("USERS"); // USERS | CARS | RENTALS

  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedCarId, setSelectedCarId] = useState("");
  const [selectedRentalId, setSelectedRentalId] = useState("");

  // JSON editors (full control)
  const [userJson, setUserJson] = useState("");
  const [carJson, setCarJson] = useState("");
  const [rentalJson, setRentalJson] = useState("");

  // “friendly” editor fields for rentals
  const [rentalEdit, setRentalEdit] = useState({
    carId: "",
    type: "NOW",
    status: "ACTIVE",
    startAt: "",
    endAt: "",
    borrowedByUserId: "",
    returnedByUserId: "",
    returnedAt: "",
  });

  // “friendly” editor fields for users
  const [userEdit, setUserEdit] = useState({
    name: "",
    role: "USER",
    isActive: true,
  });
  const [newPin, setNewPin] = useState("");

  // Messages
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // ===== realtime loads =====
  useEffect(() => {
    const unsubUsers = onValue(
      ref(database, "users"),
      (snap) => {
        const val = snap.val();
        const arr = val ? Object.values(val) : [];
        arr.sort((a, b) => (a?.name || "").localeCompare(b?.name || ""));
        setUsers(arr);
      },
      console.error
    );

    const unsubCars = onValue(
      ref(database, "cars"),
      (snap) => {
        const val = snap.val();
        const arr = val ? Object.values(val) : [];
        arr.sort((a, b) => (a?.plateNumber || "").localeCompare(b?.plateNumber || ""));
        setCars(arr);
      },
      console.error
    );

    const unsubRentals = onValue(
      ref(database, "rentals"),
      (snap) => {
        const val = snap.val();
        const arr = val ? Object.values(val) : [];
        // sort: najnowsze createdAt pierwsze
        arr.sort((a, b) => String(b?.audit?.createdAt || "").localeCompare(String(a?.audit?.createdAt || "")));
        setRentals(arr);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setRentals([]);
        setLoading(false);
      }
    );

    return () => {
      unsubUsers();
      unsubCars();
      unsubRentals();
    };
  }, []);

  const usersById = useMemo(() => {
    const m = new Map();
    users.forEach((u) => u?.id && m.set(u.id, u));
    return m;
  }, [users]);

  const carsById = useMemo(() => {
    const m = new Map();
    cars.forEach((c) => c?.id && m.set(c.id, c));
    return m;
  }, [cars]);

  const rentalsById = useMemo(() => {
    const m = new Map();
    rentals.forEach((r) => r?.id && m.set(r.id, r));
    return m;
  }, [rentals]);

  // ===== selection handlers =====
  function selectUser(id) {
    setSelectedUserId(id);
    const u = usersById.get(id);
    if (!u) return;

    setUserEdit({
      name: safe(u.name, ""),
      role: safe(u.role, "USER"),
      isActive: !!u.isActive,
    });
    setUserJson(pretty(u));
    setNewPin("");
    setMsg(null);
  }

  function selectCar(id) {
    setSelectedCarId(id);
    const c = carsById.get(id);
    if (!c) return;
    setCarJson(pretty(c));
    setMsg(null);
  }

  function selectRental(id) {
    setSelectedRentalId(id);
    const r = rentalsById.get(id);
    if (!r) return;

    setRentalEdit({
      carId: safe(r.carId, ""),
      type: safe(r.type, "NOW"),
      status: safe(r.status, "ACTIVE"),
      startAt: safe(r.startAt, ""),
      endAt: r.endAt === null || r.endAt === undefined ? "" : String(r.endAt),
      borrowedByUserId: safe(r.borrowedByUserId, ""),
      returnedByUserId: r.returnedByUserId === null || r.returnedByUserId === undefined ? "" : String(r.returnedByUserId),
      returnedAt: r.returnedAt === null || r.returnedAt === undefined ? "" : String(r.returnedAt),
    });

    setRentalJson(pretty(r));
    setMsg(null);
  }

  // ===== write helpers =====
  function setMessage(type, text) {
    setMsg({ type, text });
  }

  async function adminUpdate(path, patch) {
    const nowIso = new Date().toISOString();
    const patchWithAudit = {
      ...patch,
      "audit/updatedAt": nowIso,
      "audit/updatedBy": adminUserId,
    };
    await update(ref(database, path), patchWithAudit);
  }

  // ===== USERS actions =====
  async function saveUserFriendly() {
    if (!selectedUserId) return;
    const name = userEdit.name.trim().replace(/\s+/g, " ");
    if (!name) {
      setMessage("error", "Nazwa użytkownika nie może być pusta.");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      await adminUpdate(`users/${selectedUserId}`, {
        name,
        role: userEdit.role,
        isActive: !!userEdit.isActive,
      });
      setMessage("ok", "Zapisano użytkownika.");
    } catch (e) {
      console.error(e);
      setMessage("error", "Błąd zapisu użytkownika.");
    } finally {
      setBusy(false);
    }
  }

  async function resetUserPin() {
    if (!selectedUserId) return;

    const pin = newPin.trim();
    if (!/^[0-9]{4,8}$/.test(pin)) {
      setMessage("error", "PIN musi mieć 4–8 cyfr.");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const salt = randomSalt(10);
      const hashMd5 = md5(`${salt}${pin}`);

      // nie używam adminUpdate, bo edytuję pin.* + audit
      await adminUpdate(`users/${selectedUserId}`, {
        "pin/salt": salt,
        "pin/hashMd5": hashMd5,
      });

      setNewPin("");
      setMessage("ok", "Zresetowano PIN (zapisano nowy hash+salt).");
    } catch (e) {
      console.error(e);
      setMessage("error", "Błąd resetu PIN.");
    } finally {
      setBusy(false);
    }
  }

  async function saveUserJson() {
    if (!selectedUserId) return;

    const parsed = parseJsonSafe(userJson);
    if (!parsed.ok) {
      setMessage("error", `Błędny JSON: ${parsed.error}`);
      return;
    }
    const obj = parsed.value;

    // minimalny sanity: id musi się zgadzać (żeby nie wpuścić “podmiany”)
    if (!obj?.id || obj.id !== selectedUserId) {
      setMessage("error", "JSON musi zawierać id zgodne z wybranym rekordem.");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      // dopnij audit.updated*
      const nowIso = new Date().toISOString();
      obj.audit = obj.audit || {};
      obj.audit.updatedAt = nowIso;
      obj.audit.updatedBy = adminUserId;

      await set(ref(database, `users/${selectedUserId}`), obj);
      setMessage("ok", "Zapisano USER (pełny JSON).");
    } catch (e) {
      console.error(e);
      setMessage("error", "Błąd zapisu JSON usera.");
    } finally {
      setBusy(false);
    }
  }

  // ===== CARS actions =====
  async function saveCarJson() {
    if (!selectedCarId) return;

    const parsed = parseJsonSafe(carJson);
    if (!parsed.ok) {
      setMessage("error", `Błędny JSON: ${parsed.error}`);
      return;
    }
    const obj = parsed.value;

    if (!obj?.id || obj.id !== selectedCarId) {
      setMessage("error", "JSON musi zawierać id zgodne z wybranym rekordem.");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const nowIso = new Date().toISOString();
      obj.audit = obj.audit || {};
      obj.audit.updatedAt = nowIso;
      obj.audit.updatedBy = adminUserId;

      await set(ref(database, `cars/${selectedCarId}`), obj);
      setMessage("ok", "Zapisano CAR (pełny JSON).");
    } catch (e) {
      console.error(e);
      setMessage("error", "Błąd zapisu JSON auta.");
    } finally {
      setBusy(false);
    }
  }

  // ===== RENTALS actions =====
  async function saveRentalFriendly() {
    if (!selectedRentalId) return;

    // minimalne sanity
    if (!rentalEdit.carId) {
      setMessage("error", "Wybierz carId.");
      return;
    }
    if (!rentalEdit.borrowedByUserId) {
      setMessage("error", "Wybierz borrowedByUserId.");
      return;
    }
    if (!rentalEdit.startAt) {
      setMessage("error", "startAt nie może być puste.");
      return;
    }

    // endAt / returnedAt mogą być puste => null
    const patch = {
      carId: rentalEdit.carId,
      type: rentalEdit.type,
      status: rentalEdit.status,
      startAt: rentalEdit.startAt,
      endAt: rentalEdit.endAt.trim() === "" ? null : rentalEdit.endAt.trim(),
      borrowedByUserId: rentalEdit.borrowedByUserId,
      returnedByUserId: rentalEdit.returnedByUserId.trim() === "" ? null : rentalEdit.returnedByUserId.trim(),
      returnedAt: rentalEdit.returnedAt.trim() === "" ? null : rentalEdit.returnedAt.trim(),
    };

    setBusy(true);
    setMsg(null);
    try {
      await adminUpdate(`rentals/${selectedRentalId}`, patch);
      setMessage("ok", "Zapisano RENTAL (pola kluczowe).");
    } catch (e) {
      console.error(e);
      setMessage("error", "Błąd zapisu rentals.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRentalJson() {
    if (!selectedRentalId) return;

    const parsed = parseJsonSafe(rentalJson);
    if (!parsed.ok) {
      setMessage("error", `Błędny JSON: ${parsed.error}`);
      return;
    }
    const obj = parsed.value;

    if (!obj?.id || obj.id !== selectedRentalId) {
      setMessage("error", "JSON musi zawierać id zgodne z wybranym rekordem.");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const nowIso = new Date().toISOString();
      obj.audit = obj.audit || {};
      obj.audit.updatedAt = nowIso;
      obj.audit.updatedBy = adminUserId;

      await set(ref(database, `rentals/${selectedRentalId}`), obj);
      setMessage("ok", "Zapisano RENTAL (pełny JSON).");
    } catch (e) {
      console.error(e);
      setMessage("error", "Błąd zapisu JSON rentals.");
    } finally {
      setBusy(false);
    }
  }

  // ===== UI =====
  const wrapper = { maxWidth: 1400, margin: "0 auto", padding: 18 };
  const box = {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: 16,
    background: "#fff",
    marginBottom: 14,
  };

  return (
    <div style={wrapper}>
      <h2 style={{ marginBottom: 10 }}>Admin Panel (pełny podgląd + edycja)</h2>

      {/* NAV LINKS */}
      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Skróty</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <NavBtn to="/addnewcar" text="AddNewCar" />
          <NavBtn to="/addnewusers" text="AddNewUsers" />
          <NavBtn to="/showallcars" text="ShowAllCars" />
          <NavBtn to="/showallreservations" text="ShowAllReservations" />
          <NavBtn to="/carreservation" text="CarReservation" />
        </div>

        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
          Panel poniżej pokazuje i pozwala edytować <code>/users</code>, <code>/cars</code>, <code>/rentals</code>.
        </div>
      </div>

      {/* MESSAGE */}
      {msg && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            marginBottom: 14,
            border: "1px solid",
            borderColor: msg.type === "ok" ? "#86efac" : "#fca5a5",
            background: msg.type === "ok" ? "#f0fdf4" : "#fef2f2",
          }}
        >
          {msg.text}
        </div>
      )}

      {loading ? (
        <div style={box}>Ładuję dane...</div>
      ) : (
        <>
          {/* TABS */}
          <div style={box}>
            <h3 style={{ marginTop: 0 }}>Dane</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => setActiveTab("USERS")} style={tabBtn(activeTab === "USERS")}>
                Users ({users.length})
              </button>
              <button onClick={() => setActiveTab("CARS")} style={tabBtn(activeTab === "CARS")}>
                Cars ({cars.length})
              </button>
              <button onClick={() => setActiveTab("RENTALS")} style={tabBtn(activeTab === "RENTALS")}>
                Rentals ({rentals.length})
              </button>
            </div>
          </div>

          {/* USERS */}
          {activeTab === "USERS" && (
            <div style={box}>
              <h3 style={{ marginTop: 0 }}>USERS — pełny komplet</h3>

              <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 14 }}>
                {/* list */}
                <div style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: 10, background: "#fafafa", fontWeight: 900 }}>
                    Lista users
                  </div>
                  <div style={{ maxHeight: 560, overflow: "auto" }}>
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => selectUser(u.id)}
                        style={listItemBtn(selectedUserId === u.id)}
                      >
                        <div style={{ fontWeight: 900 }}>{safe(u.name)}</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          id: {u.id} · role: {safe(u.role)} · active: {String(!!u.isActive)}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          pin.hashMd5: <code>{safe(u?.pin?.hashMd5)}</code>
                          <br />
                          pin.salt: <code>{safe(u?.pin?.salt)}</code>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* editor */}
                <div>
                  {!selectedUserId ? (
                    <div style={{ opacity: 0.8 }}>Wybierz użytkownika z listy.</div>
                  ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={label}>Name</label>
                          <input
                            style={input}
                            value={userEdit.name}
                            onChange={(e) => setUserEdit((p) => ({ ...p, name: e.target.value }))}
                            disabled={busy}
                          />
                        </div>

                        <div>
                          <label style={label}>Role</label>
                          <select
                            style={input}
                            value={userEdit.role}
                            onChange={(e) => setUserEdit((p) => ({ ...p, role: e.target.value }))}
                            disabled={busy}
                          >
                            <option value="USER">USER</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        </div>

                        <div>
                          <label style={label}>isActive</label>
                          <select
                            style={input}
                            value={userEdit.isActive ? "true" : "false"}
                            onChange={(e) => setUserEdit((p) => ({ ...p, isActive: e.target.value === "true" }))}
                            disabled={busy}
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button onClick={saveUserFriendly} disabled={busy} style={btnPrimary(busy)}>
                          Zapisz (pola)
                        </button>
                      </div>

                      <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 14 }}>
                        <h4 style={{ margin: "0 0 8px 0" }}>Reset PIN (ustaw nowy)</h4>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                          <input
                            style={input}
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value)}
                            placeholder="4–8 cyfr"
                            inputMode="numeric"
                            disabled={busy}
                          />
                          <button onClick={resetUserPin} disabled={busy} style={btnDanger(busy)}>
                            Reset PIN
                          </button>
                        </div>
                        <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                          Admin widzi tylko hash+salt. Plain PIN nie istnieje w DB.
                        </div>
                      </div>

                      <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 14 }}>
                        <h4 style={{ margin: "0 0 8px 0" }}>Pełna edycja JSON</h4>
                        <textarea
                          style={textarea}
                          value={userJson}
                          onChange={(e) => setUserJson(e.target.value)}
                          disabled={busy}
                        />
                        <div style={{ marginTop: 10 }}>
                          <button onClick={saveUserJson} disabled={busy} style={btnPrimary(busy)}>
                            Zapisz USER (JSON)
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* CARS */}
          {activeTab === "CARS" && (
            <div style={box}>
              <h3 style={{ marginTop: 0 }}>CARS — pełny komplet</h3>

              <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 14 }}>
                {/* list */}
                <div style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: 10, background: "#fafafa", fontWeight: 900 }}>
                    Lista cars
                  </div>
                  <div style={{ maxHeight: 560, overflow: "auto" }}>
                    {cars.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => selectCar(c.id)}
                        style={listItemBtn(selectedCarId === c.id)}
                      >
                        <div style={{ fontWeight: 900 }}>{safe(c.plateNumber)} — {safe(c.make)} {safe(c.model)}</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          id: {c.id} · status: {safe(c.status)} · archived: {String(!!c.isArchived)}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          fleetCard.shellCardPinEncrypted: <code>{safe(c?.fleetCard?.shellCardPinEncrypted)}</code>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* editor */}
                <div>
                  {!selectedCarId ? (
                    <div style={{ opacity: 0.8 }}>Wybierz auto z listy.</div>
                  ) : (
                    <>
                      <h4 style={{ marginTop: 0 }}>Pełna edycja JSON auta</h4>
                      <textarea
                        style={textarea}
                        value={carJson}
                        onChange={(e) => setCarJson(e.target.value)}
                        disabled={busy}
                      />
                      <div style={{ marginTop: 10 }}>
                        <button onClick={saveCarJson} disabled={busy} style={btnPrimary(busy)}>
                          Zapisz CAR (JSON)
                        </button>
                      </div>

                      <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
                        Możesz zmienić absolutnie wszystko, łącznie z faults[] i fleetCard. To admin panel.
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* RENTALS */}
          {activeTab === "RENTALS" && (
            <div style={box}>
              <h3 style={{ marginTop: 0 }}>RENTALS — pełny komplet (NOW + RESERVATION + historia)</h3>

              <div style={{ display: "grid", gridTemplateColumns: "460px 1fr", gap: 14 }}>
                {/* list */}
                <div style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: 10, background: "#fafafa", fontWeight: 900 }}>
                    Lista rentals
                  </div>
                  <div style={{ maxHeight: 560, overflow: "auto" }}>
                    {rentals.map((r) => {
                      const car = carsById.get(r.carId);
                      const u = usersById.get(r.borrowedByUserId);
                      const type = (r.type || "").toUpperCase();
                      const status = (r.status || "").toUpperCase();
                      const activeLabel = status === "ACTIVE" && (r.endAt === null || r.endAt === undefined) ? "AKTYWNE" : "HISTORIA";

                      return (
                        <button
                          key={r.id}
                          onClick={() => selectRental(r.id)}
                          style={listItemBtn(selectedRentalId === r.id)}
                        >
                          <div style={{ fontWeight: 900 }}>
                            [{type}] {activeLabel} — {safe(car?.plateNumber, r.carId)}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>
                            rentalId: {r.id} · status: {safe(r.status)} · start: {fmtPL(r.startAt)} · end: {fmtPL(r.endAt)}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>
                            user: {safe(u?.name, r.borrowedByUserId)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* editor */}
                <div>
                  {!selectedRentalId ? (
                    <div style={{ opacity: 0.8 }}>Wybierz rental z listy.</div>
                  ) : (
                    <>
                      <h4 style={{ marginTop: 0 }}>Szybka edycja kluczowych pól</h4>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={label}>carId (lista aut)</label>
                          <select
                            style={input}
                            value={rentalEdit.carId}
                            onChange={(e) => setRentalEdit((p) => ({ ...p, carId: e.target.value }))}
                            disabled={busy}
                          >
                            <option value="">— wybierz auto —</option>
                            {cars.map((c) => (
                              <option key={c.id} value={c.id}>
                                {safe(c.plateNumber)} — {safe(c.make)} {safe(c.model)} ({c.id})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={label}>type</label>
                          <select
                            style={input}
                            value={rentalEdit.type}
                            onChange={(e) => setRentalEdit((p) => ({ ...p, type: e.target.value }))}
                            disabled={busy}
                          >
                            <option value="NOW">NOW</option>
                            <option value="RESERVATION">RESERVATION</option>
                          </select>
                        </div>

                        <div>
                          <label style={label}>status</label>
                          <select
                            style={input}
                            value={rentalEdit.status}
                            onChange={(e) => setRentalEdit((p) => ({ ...p, status: e.target.value }))}
                            disabled={busy}
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="CLOSED">CLOSED</option>
                            <option value="CANCELLED">CANCELLED</option>
                            <option value="FULFILLED">FULFILLED</option>
                          </select>
                        </div>

                        <div>
                          <label style={label}>startAt (ISO)</label>
                          <input
                            style={input}
                            value={rentalEdit.startAt}
                            onChange={(e) => setRentalEdit((p) => ({ ...p, startAt: e.target.value }))}
                            disabled={busy}
                          />
                        </div>

                        <div>
                          <label style={label}>endAt (ISO lub puste => null)</label>
                          <input
                            style={input}
                            value={rentalEdit.endAt}
                            onChange={(e) => setRentalEdit((p) => ({ ...p, endAt: e.target.value }))}
                            disabled={busy}
                          />
                        </div>

                        <div>
                          <label style={label}>returnedAt (ISO lub puste => null)</label>
                          <input
                            style={input}
                            value={rentalEdit.returnedAt}
                            onChange={(e) => setRentalEdit((p) => ({ ...p, returnedAt: e.target.value }))}
                            disabled={busy}
                          />
                        </div>

                        <div>
                          <label style={label}>borrowedByUserId (lista users)</label>
                          <select
                            style={input}
                            value={rentalEdit.borrowedByUserId}
                            onChange={(e) => setRentalEdit((p) => ({ ...p, borrowedByUserId: e.target.value }))}
                            disabled={busy}
                          >
                            <option value="">— wybierz usera —</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {safe(u.name)} ({u.id})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={label}>returnedByUserId (lista users / puste => null)</label>
                          <select
                            style={input}
                            value={rentalEdit.returnedByUserId}
                            onChange={(e) => setRentalEdit((p) => ({ ...p, returnedByUserId: e.target.value }))}
                            disabled={busy}
                          >
                            <option value="">— null —</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {safe(u.name)} ({u.id})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button onClick={saveRentalFriendly} disabled={busy} style={btnPrimary(busy)}>
                          Zapisz (pola)
                        </button>
                      </div>

                      <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 14 }}>
                        <h4 style={{ margin: "0 0 8px 0" }}>Pełna edycja JSON rentals</h4>
                        <textarea
                          style={textarea}
                          value={rentalJson}
                          onChange={(e) => setRentalJson(e.target.value)}
                          disabled={busy}
                        />
                        <div style={{ marginTop: 10 }}>
                          <button onClick={saveRentalJson} disabled={busy} style={btnPrimary(busy)}>
                            Zapisz RENTAL (JSON)
                          </button>
                        </div>

                        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
                          Tu możesz dopisać np. <code>adminCorrections[]</code> ręcznie albo edytować wszystko 1:1.
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ opacity: 0.65, fontSize: 12 }}>
        Realtime: users={users.length}, cars={cars.length}, rentals={rentals.length}
      </div>
    </div>
  );
}

function NavBtn({ to, text }) {
  return (
    <Link
      to={to}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #111",
        background: "#111",
        color: "#fff",
        textDecoration: "none",
        fontWeight: 900,
      }}
    >
      {text}
    </Link>
  );
}

function tabBtn(active) {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#111",
    cursor: "pointer",
    fontWeight: 900,
  };
}

function listItemBtn(active) {
  return {
    width: "100%",
    textAlign: "left",
    padding: 10,
    border: "none",
    borderBottom: "1px solid #f0f0f0",
    background: active ? "#f6f6f6" : "#fff",
    cursor: "pointer",
  };
}

const label = { display: "block", fontSize: 12, opacity: 0.8, marginBottom: 6 };
const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  outline: "none",
};

const textarea = {
  width: "100%",
  minHeight: 380,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #ccc",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  outline: "none",
};

function btnPrimary(disabled) {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: disabled ? "#eee" : "#111",
    color: disabled ? "#111" : "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 900,
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
  };
}