import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import md5 from "blueimp-md5";
import { database, ref, onValue, set } from "../FirebaseConfig";
import styles from "./AdminCars.module.css";
import Navbar from './Navbar';

/** =======================
 *  TŁUMACZENIA PÓL (PL)
 *  ======================= */
const PATH_LABELS_PL = {
  // wspólne / audit
  audit: "Audyt",
  "audit.createdAt": "Utworzono (data)",
  "audit.createdBy": "Utworzył (ID)",
  "audit.updatedAt": "Zaktualizowano (data)",
  "audit.updatedBy": "Zaktualizował (ID)",

  // === CARS ===
  baseLocation: "Baza / lokalizacja",
  equipment: "Wyposażenie",
  "equipment.hasExtinguisher": "Gaśnica",
  "equipment.hasFirstAidKit": "Apteczka",
  "equipment.hasTriangle": "Trójkąt ostrzegawczy",
  fleetCard: "Karta flotowa",
  "fleetCard.shellCardPinEncrypted": "PIN karty Shell (zaszyfrowany)",
  id: "ID",
  isArchived: "Zarchiwizowane",
  maintenance: "Serwis / utrzymanie",
  "maintenance.currentMileage": "Aktualny przebieg (km)",
  "maintenance.inspectionDueAt": "Przegląd ważny do",
  "maintenance.insuranceDueAt": "Ubezpieczenie ważne do",
  "maintenance.lastOilServiceAt": "Ostatnia wymiana oleju (data)",
  "maintenance.lastOilServiceMileage": "Przebieg przy wymianie oleju (km)",
  make: "Marka",
  model: "Model",
  plateNumber: "Numer rejestracyjny",
  status: "Status",
  vin: "VIN",

  // === USERS (typowe) ===
  name: "Imię i nazwisko",
  role: "Rola",
  isActive: "Aktywny",
  pin: "PIN",
  "pin.hashMd5": "Hash PIN (MD5)",
  "pin.salt": "Sól (salt) PIN",

  // === RENTALS (typowe) ===
  carId: "ID auta",
  borrowedByUserId: "ID użytkownika",
  returnedByUserId: "ID użytkownika zwracającego",
  startAt: "Start",
  endAt: "Koniec",
  type: "Typ"
};

const KEY_LABELS_PL = {
  // fallback po samym kluczu (gdy nie ma dopasowania po pełnej ścieżce)
  createdAt: "Utworzono (data)",
  createdBy: "Utworzył (ID)",
  updatedAt: "Zaktualizowano (data)",
  updatedBy: "Zaktualizował (ID)",

  baseLocation: "Baza / lokalizacja",
  equipment: "Wyposażenie",
  hasExtinguisher: "Gaśnica",
  hasFirstAidKit: "Apteczka",
  hasTriangle: "Trójkąt ostrzegawczy",
  fleetCard: "Karta flotowa",
  shellCardPinEncrypted: "PIN karty Shell (zaszyfrowany)",
  isArchived: "Zarchiwizowane",
  maintenance: "Serwis / utrzymanie",
  currentMileage: "Aktualny przebieg (km)",
  inspectionDueAt: "Przegląd ważny do",
  insuranceDueAt: "Ubezpieczenie ważne do",
  lastOilServiceAt: "Ostatnia wymiana oleju (data)",
  lastOilServiceMileage: "Przebieg przy wymianie oleju (km)",
  make: "Marka",
  model: "Model",
  plateNumber: "Numer rejestracyjny",
  status: "Status",
  vin: "VIN",

  name: "Imię i nazwisko",
  role: "Rola",
  isActive: "Aktywny",
  pin: "PIN",
  hashMd5: "Hash PIN (MD5)",
  salt: "Sól (salt) PIN",

  carId: "ID auta",
  borrowedByUserId: "ID użytkownika",
  returnedByUserId: "ID użytkownika zwracającego",
  startAt: "Start",
  endAt: "Koniec",
  type: "Typ",
  id: "ID",
};

function translateLabelPL(path, rawLabel) {
  // label typu "[0]" zostawiamy
  if (rawLabel && /^\[\d+\]$/.test(rawLabel)) return rawLabel;

  // 1) pełna ścieżka (najbardziej precyzyjna)
  if (path && PATH_LABELS_PL[path]) return PATH_LABELS_PL[path];

  // 2) sam label (czasem label==klucz)
  if (rawLabel && KEY_LABELS_PL[rawLabel]) return KEY_LABELS_PL[rawLabel];

  // 3) ostatni segment ścieżki
  if (path) {
    const last = path.split(".").slice(-1)[0];
    if (KEY_LABELS_PL[last]) return KEY_LABELS_PL[last];
  }

  // 4) fallback
  return rawLabel || (path ? path.split(".").slice(-1)[0] : "Pole");
}

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

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function randomSalt(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `slt_${out}`;
}

function typeOfValue(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function pathJoin(path, key) {
  if (!path) return String(key);
  return `${path}.${String(key)}`;
}

function getAtPath(root, path) {
  if (!path) return root;
  const parts = path.split(".");
  let cur = root;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setAtPath(root, path, value) {
  const copy = deepClone(root);
  if (!path) return value;

  const parts = path.split(".");
  let cur = copy;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!isPlainObject(cur[k]) && !Array.isArray(cur[k])) {
      cur[k] = {};
    }
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return copy;
}

function deleteAtPath(root, path) {
  const copy = deepClone(root);
  if (!path) return copy;
  const parts = path.split(".");
  let cur = copy;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur == null) return copy;
    cur = cur[k];
  }
  const last = parts[parts.length - 1];

  if (Array.isArray(cur)) {
    const idx = Number(last);
    if (!Number.isNaN(idx)) cur.splice(idx, 1);
    return copy;
  }

  if (isPlainObject(cur)) {
    delete cur[last];
  }
  return copy;
}

function coercePrimitive(type, raw) {
  if (type === "number") {
    if (raw === "" || raw === null || raw === undefined) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (type === "boolean") {
    return !!raw;
  }
  if (type === "null") return null;
  return String(raw ?? "");
}

/** =======================
 *  UKRYWANIE AUDYTU / PÓL
 *  ======================= */
const HIDDEN_KEYS = new Set(["audit", "createdAt", "createdBy", "updatedAt", "updatedBy"]);

// ukrywa:
// - całe drzewo audit (audit oraz audit.*)
// - oraz każdy klucz createdAt/createdBy/updatedAt/updatedBy gdziekolwiek się pojawi
function isHiddenPath(path) {
  if (!path) return false;

  const parts = String(path).split(".");
  // audit lub cokolwiek pod audit
  if (parts[0] === "audit") return true;
  // dowolny segment z listy ukrytych
  return parts.some((p) => HIDDEN_KEYS.has(p));
}

function isIdPath(path) {
  if (!path) return false;
  const parts = String(path).split(".");
  return parts[parts.length - 1] === "id";
}

/** =======================
 *  REGUŁY EDYCJI
 *  ======================= */

function isUserReferencePath(entityType, path) {
  if (!path) return false;

  // tylko dla RENTALS
  if (entityType !== "rentals") return false;

  return path === "borrowedByUserId" || path === "returnedByUserId";
}

function isReadOnlyPath(entityType, path) {
  if (!path) return false;

  // własne id zawsze readonly
  if (isIdPath(path)) return true;

  // users -> pin.salt readonly
  if (entityType === "users" && path === "pin.salt") return true;

  // rentals -> carId readonly
  if (entityType === "rentals" && path === "carId") return true;

  return false;
}

function canDeletePath(entityType, path) {
  if (!path) return false;
  if (isReadOnlyPath(entityType, path)) return false;
  return true;
}

/** === Dynamic Editor (rekurencyjny) === **/
function DynamicEditor({
  rootValue,
  currentPath = "",
  label = "",
  disabled = false,
  entityType,
  userOptions = [],
  onRootChange,
  onDeletePath,
}) {
  // nic z audytu i nic z created*/updated* nie renderujemy
  if (isHiddenPath(currentPath)) return null;

  const value = getAtPath(rootValue, currentPath);
  const t = typeOfValue(value);

  const rawLabel = label || (currentPath ? currentPath.split(".").slice(-1)[0] : "value");
  const showLabel = translateLabelPL(currentPath, rawLabel);

  const isReadOnly = isReadOnlyPath(entityType, currentPath);
  const isUserRef = isUserReferencePath(entityType, currentPath);
  const effectiveDisabled = disabled || isReadOnly;
  const canDelete = canDeletePath(entityType, currentPath);

  // PRIMITIVES
  if (t === "string" || t === "number" || t === "boolean" || t === "null" || t === "undefined") {
    return (
      <div className={styles.fieldRow}>
        <div className={styles.fieldLabel}>
          <span>{showLabel}</span>
          {currentPath && (
            <span className={styles.fieldMeta}>
              {t}
              {isReadOnly ? " · readonly" : ""}
            </span>
          )}
        </div>

        <div className={styles.fieldControl}>
          {isUserRef ? (
            <select
              className={styles.input}
              disabled={effectiveDisabled}
              value={value ?? ""}
              onChange={(e) => {
                onRootChange(setAtPath(rootValue, currentPath, e.target.value));
              }}
            >
              <option value="">— wybierz użytkownika —</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {/* {u.id} — {safe(u.name)} */}
                  {safe(u.name)} | id: ({u.id})
                </option>
              ))}
            </select>
          ) : t === "boolean" ? (
            <select
              className={styles.input}
              disabled={effectiveDisabled}
              value={value ? "true" : "false"}
              onChange={(e) => {
                const v = e.target.value === "true";
                onRootChange(setAtPath(rootValue, currentPath, v));
              }}
            >
              <option value="true">tak</option>
              <option value="false">nie</option>
            </select>
          ) : t === "number" ? (
            <input
              className={styles.input}
              disabled={effectiveDisabled}
              type="number"
              value={Number.isFinite(value) ? value : 0}
              onChange={(e) => {
                onRootChange(setAtPath(rootValue, currentPath, coercePrimitive("number", e.target.value)));
              }}
            />
          ) : (
            <input
              className={styles.input}
              disabled={effectiveDisabled}
              value={value === null || value === undefined ? "" : String(value)}
              placeholder={value === null ? "null" : value === undefined ? "undefined" : ""}
              onChange={(e) => {
                const newVal = coercePrimitive("string", e.target.value);
                onRootChange(setAtPath(rootValue, currentPath, newVal));
              }}
            />
          )}

          {canDelete && (
            <div className={styles.fieldBtnRow}>
              <button
                className={styles.btnGhost}
                disabled={disabled}
                onClick={() => onRootChange(setAtPath(rootValue, currentPath, null))}
                title="Ustaw null"
              >
                null
              </button>

              <button
                className={styles.btnDanger}
                disabled={disabled}
                onClick={() => onDeletePath(currentPath)}
                title="Usuń to pole / element"
              >
                Usuń
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ARRAY
  if (t === "array") {
    const arr = Array.isArray(value) ? value : [];

    return (
      <div className={styles.nodeBox}>
        <div className={styles.nodeHeader}>
          <div className={styles.nodeTitle}>
            {showLabel} <span className={styles.nodeMeta}>(tablica · {arr.length})</span>
          </div>

          <div className={styles.nodeActions}>
            {canDelete && (
              <button
                className={styles.btnDanger}
                disabled={disabled}
                onClick={() => onDeletePath(currentPath)}
                title="Usuń tablicę"
              >
                Usuń
              </button>
            )}
          </div>
        </div>

        <div className={styles.nodeBody}>
          {arr.length === 0 ? (
            <div className={styles.muted}>Pusta tablica.</div>
          ) : (
            arr.map((_, idx) => (
              <div key={idx} className={styles.nodeChild}>
                <DynamicEditor
                  rootValue={rootValue}
                  currentPath={pathJoin(currentPath, idx)}
                  label={`[${idx}]`}
                  disabled={disabled}
                  entityType={entityType}
                  userOptions={userOptions}
                  onRootChange={onRootChange}
                  onDeletePath={onDeletePath}
                />
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // OBJECT
  const obj = isPlainObject(value) ? value : {};

  return (
    <ObjectNodeEditor
      rootValue={rootValue}
      currentPath={currentPath}
      label={showLabel}
      obj={obj}
      disabled={disabled}
      entityType={entityType}
      userOptions={userOptions}
      onRootChange={onRootChange}
      onDeletePath={onDeletePath}
    />
  );
}

function ObjectNodeEditor({
  rootValue,
  currentPath,
  label,
  obj,
  disabled,
  entityType,
  userOptions,
  onRootChange,
  onDeletePath,
}) {
  const entries = Object.entries(obj || {})
    .filter(([k]) => !isHiddenPath(pathJoin(currentPath, k)))
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) return null;

  const canDelete = canDeletePath(entityType, currentPath);

  return (
    <div className={styles.nodeBox}>
      <div className={styles.nodeHeader}>
        <div className={styles.nodeTitle}>
          {label} <span className={styles.nodeMeta}>(obiekt · {entries.length})</span>
        </div>

        <div className={styles.nodeActions}>
          {canDelete && (
            <button
              className={styles.btnDanger}
              disabled={disabled}
              onClick={() => onDeletePath(currentPath)}
              title="Usuń obiekt"
            >
              Usuń
            </button>
          )}
        </div>
      </div>

      <div className={styles.nodeBody}>
        {entries.map(([k]) => (
          <div key={k} className={styles.nodeChild}>
            <DynamicEditor
              rootValue={rootValue}
              currentPath={pathJoin(currentPath, k)}
              label={k}
              disabled={disabled}
              entityType={entityType}
              userOptions={userOptions}
              onRootChange={onRootChange}
              onDeletePath={onDeletePath}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminCars() {
  const adminUserId = useMemo(() => localStorage.getItem("userId") || "usr_admin_001", []);

  const [users, setUsers] = useState([]);
  const [cars, setCars] = useState([]);
  const [rentals, setRentals] = useState([]);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("USERS"); // USERS | CARS | RENTALS

  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedCarId, setSelectedCarId] = useState("");
  const [selectedRentalId, setSelectedRentalId] = useState("");

  // drafty do edycji
  const [draftUser, setDraftUser] = useState(null);
  const [draftCar, setDraftCar] = useState(null);
  const [draftRental, setDraftRental] = useState(null);

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

  const userOptions = useMemo(() => {
    return [...users].sort((a, b) => (a?.name || "").localeCompare(b?.name || ""));
  }, [users]);

  function setMessage(type, text) {
    setMsg({ type, text });
  }

  // ===== selection handlers =====
  function selectUser(id) {
    setSelectedUserId(id);
    setSelectedCarId("");
    setSelectedRentalId("");
    setDraftCar(null);
    setDraftRental(null);

    const u = usersById.get(id);
    if (!u) return;

    setDraftUser(deepClone(u));
    setMsg(null);
  }

  function selectCar(id) {
    setSelectedCarId(id);
    setSelectedUserId("");
    setSelectedRentalId("");
    setDraftUser(null);
    setDraftRental(null);

    const c = carsById.get(id);
    if (!c) return;

    setDraftCar(deepClone(c));
    setMsg(null);
  }

  function selectRental(id) {
    setSelectedRentalId(id);
    setSelectedUserId("");
    setSelectedCarId("");
    setDraftUser(null);
    setDraftCar(null);

    const r = rentalsById.get(id);
    if (!r) return;

    setDraftRental(deepClone(r));
    setMsg(null);
  }

  function tabClass(isActive) {
    return isActive ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn;
  }

  function listItemClass(isActive) {
    return isActive ? `${styles.listItemBtn} ${styles.listItemBtnActive}` : styles.listItemBtn;
  }

  // ===== SAVE helpers =====
  async function saveWhole(kind) {
    let id = "";
    let obj = null;

    if (kind === "users") {
      id = selectedUserId;
      obj = draftUser;
    } else if (kind === "cars") {
      id = selectedCarId;
      obj = draftCar;
    } else {
      id = selectedRentalId;
      obj = draftRental;
    }

    if (!id || !obj) return;

    if (!obj.id || obj.id !== id) {
      setMessage("error", "Pole id musi istnieć i być zgodne z wybranym rekordem.");
      return;
    }

    setBusy(true);
    setMsg(null);

    try {
      const nowIso = new Date().toISOString();
      const next = deepClone(obj);
      next.audit = next.audit || {};
      next.audit.updatedAt = nowIso;
      next.audit.updatedBy = adminUserId;

      await set(ref(database, `${kind}/${id}`), next);

      setMessage("ok", `Zapisano ${kind.toUpperCase()} (wszystkie pola).`);

      if (kind === "users") setDraftUser(next);
      if (kind === "cars") setDraftCar(next);
      if (kind === "rentals") setDraftRental(next);
    } catch (e) {
      console.error(e);
      setMessage("error", "Błąd zapisu do bazy.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPinQuick() {
    if (!selectedUserId || !draftUser) return;

    const plainPin = prompt("Podaj nowy PIN (4–8 cyfr):");
    if (plainPin === null) return;

    const pin = String(plainPin).trim();
    if (!/^[0-9]{4,8}$/.test(pin)) {
      setMessage("error", "PIN musi mieć 4–8 cyfr.");
      return;
    }

    const salt = randomSalt(10);
    const hashMd5 = md5(`${salt}${pin}`);

    const next = deepClone(draftUser);
    next.pin = next.pin || {};
    next.pin.salt = salt;
    next.pin.hashMd5 = hashMd5;

    setDraftUser(next);
    setMessage("ok", "Ustawiono nowy PIN (hash+salt) w edytorze. Kliknij Zapisz, żeby wysłać do DB.");
  }

  function deletePathInDraft(draft, setDraftFn, path, entityType) {
    if (!canDeletePath(entityType, path)) return;
    const next = deleteAtPath(draft, path);
    setDraftFn(next);
  }

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.pageTitle}>Admin Panel</h2>
      <Navbar/>

      {/* MESSAGE */}
      {msg && (
        <div className={`${styles.message} ${msg.type === "ok" ? styles.messageOk : styles.messageError}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className={styles.box}>Ładuję dane...</div>
      ) : (
        <>
          {/* TABS */}
          <div className={styles.box}>
            <h3 className={styles.boxTitle}>Dane</h3>
            <div className={styles.tabsRow}>
              <button onClick={() => setActiveTab("USERS")} className={tabClass(activeTab === "USERS")}>
                Users ({users.length})
              </button>
              <button onClick={() => setActiveTab("CARS")} className={tabClass(activeTab === "CARS")}>
                Cars ({cars.length})
              </button>
              <button onClick={() => setActiveTab("RENTALS")} className={tabClass(activeTab === "RENTALS")}>
                Rentals ({rentals.length})
              </button>
            </div>
          </div>

          {/* USERS */}
          {activeTab === "USERS" && (
            <div className={styles.box}>
              <h3 className={styles.boxTitle}>USERS — edycja każdego pola</h3>

              <div className={styles.gridUsers}>
                {/* list */}
                <div className={styles.listCard}>
                  <div className={styles.listHeader}>Lista users</div>
                  <div className={styles.listBody}>
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => selectUser(u.id)}
                        className={listItemClass(selectedUserId === u.id)}
                      >
                        <div className={styles.itemTitle}>{safe(u.name)}</div>
                        <div className={styles.itemMeta}>
                          id: {u.id} · rola: {safe(u.role)} · aktywny: {String(!!u.isActive)}
                        </div>
                        <div className={styles.itemMeta}>
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
                  {!selectedUserId || !draftUser ? (
                    <div className={styles.muted}>Wybierz użytkownika z listy.</div>
                  ) : (
                    <>
                      <div className={styles.actionsRow}>
                        <button onClick={() => saveWhole("users")} disabled={busy} className={styles.btnPrimary}>
                          Zapisz USER (wszystkie pola)
                        </button>

                        <button onClick={resetPinQuick} disabled={busy} className={styles.btnDanger}>
                          Reset PIN (szybko)
                        </button>
                      </div>

                      <div className={styles.smallNote}>
                        Możesz edytować ręcznie <code>pin.hashMd5</code>, ale <code>pin.salt</code> jest readonly.
                        Reset PIN ustawia oba pola automatycznie.
                      </div>

                      <DynamicEditor
                        rootValue={draftUser}
                        currentPath=""
                        label="Użytkownik"
                        disabled={busy}
                        entityType="users"
                        userOptions={userOptions}
                        onRootChange={setDraftUser}
                        onDeletePath={(p) => deletePathInDraft(draftUser, setDraftUser, p, "users")}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* CARS */}
          {activeTab === "CARS" && (
            <div className={styles.box}>
              <h3 className={styles.boxTitle}>CARS — edycja każdego pola</h3>

              <div className={styles.gridCars}>
                {/* list */}
                <div className={styles.listCard}>
                  <div className={styles.listHeader}>Lista cars</div>
                  <div className={styles.listBody}>
                    {cars.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => selectCar(c.id)}
                        className={listItemClass(selectedCarId === c.id)}
                      >
                        <div className={styles.itemTitle}>
                          {safe(c.plateNumber)} — {safe(c.make)} {safe(c.model)}
                        </div>
                        <div className={styles.itemMeta}>
                          id: {c.id} · status: {safe(c.status)} · zarchiwizowane: {String(!!c.isArchived)}
                        </div>
                        <div className={styles.itemMeta}>
                          fleetCard.shellCardPinEncrypted: <code>{safe(c?.fleetCard?.shellCardPinEncrypted)}</code>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* editor */}
                <div>
                  {!selectedCarId || !draftCar ? (
                    <div className={styles.muted}>Wybierz auto z listy.</div>
                  ) : (
                    <>
                      <div className={styles.actionsRow}>
                        <button onClick={() => saveWhole("cars")} disabled={busy} className={styles.btnPrimary}>
                          Zapisz CAR (wszystkie pola)
                        </button>
                      </div>

                      <DynamicEditor
                        rootValue={draftCar}
                        currentPath=""
                        label="Auto"
                        disabled={busy}
                        entityType="cars"
                        userOptions={userOptions}
                        onRootChange={setDraftCar}
                        onDeletePath={(p) => deletePathInDraft(draftCar, setDraftCar, p, "cars")}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* RENTALS */}
          {activeTab === "RENTALS" && (
            <div className={styles.box}>
              <h3 className={styles.boxTitle}>RENTALS — edycja każdego pola</h3>

              <div className={styles.gridRentals}>
                {/* list */}
                <div className={styles.listCard}>
                  <div className={styles.listHeader}>Lista rentals</div>
                  <div className={styles.listBody}>
                    {rentals.map((r) => {
                      const car = carsById.get(r.carId);
                      const borrowedUser = usersById.get(r.borrowedByUserId);
                      const returnedUser = usersById.get(r.returnedByUserId);
                      const type = (r.type || "").toUpperCase();
                      const status = (r.status || "").toUpperCase();
                      const activeLabel =
                        status === "ACTIVE" && (r.endAt === null || r.endAt === undefined) ? "AKTYWNE" : "HISTORIA";

                      return (
                        <button
                          key={r.id}
                          onClick={() => selectRental(r.id)}
                          className={listItemClass(selectedRentalId === r.id)}
                        >
                          <div className={styles.itemTitle}>
                            [{type}] {activeLabel} — {safe(car?.plateNumber, r.carId)}
                          </div>
                          <div className={styles.itemMeta}>
                            rentalId: {r.id} · status: {safe(r.status)} · start: {fmtPL(r.startAt)} · end:{" "}
                            {fmtPL(r.endAt)}
                          </div>
                          <div className={styles.itemMeta}>
                            user: {safe(borrowedUser?.name, r.borrowedByUserId)}
                            {r?.returnedByUserId ? ` · zwrócił: ${safe(returnedUser?.name, r.returnedByUserId)}` : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* editor */}
                <div>
                  {!selectedRentalId || !draftRental ? (
                    <div className={styles.muted}>Wybierz rental z listy.</div>
                  ) : (
                    <>
                      <div className={styles.actionsRow}>
                        <button onClick={() => saveWhole("rentals")} disabled={busy} className={styles.btnPrimary}>
                          Zapisz RENTAL (wszystkie pola)
                        </button>
                      </div>

                      <div className={styles.smallNote}>
                        W tym widoku <code>borrowedByUserId</code> i <code>returnedByUserId</code> wybierasz z listy
                        użytkowników. <code>id</code> i <code>carId</code> są readonly.
                      </div>

                      <DynamicEditor
                        rootValue={draftRental}
                        currentPath=""
                        label="Wypożyczenie"
                        disabled={busy}
                        entityType="rentals"
                        userOptions={userOptions}
                        onRootChange={setDraftRental}
                        onDeletePath={(p) => deletePathInDraft(draftRental, setDraftRental, p, "rentals")}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className={styles.footerNote}>
        Realtime: users={users.length}, cars={cars.length}, rentals={rentals.length}
      </div>
    </div>
  );
}

function NavBtn({ to, text }) {
  return (
    <Link to={to} className={styles.navBtn}>
      {text}
    </Link>
  );
}