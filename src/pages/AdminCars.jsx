import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import md5 from "blueimp-md5";
import { database, ref, onValue, set } from "../FirebaseConfig";
import styles from "./AdminCars.module.css";
import Navbar from "./Navbar";

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
  aso: "ASO",
  assignedUser: "Przypisany użytkownik",
  baseLocation: "Baza / lokalizacja",
  batteryYear: "Rok akumulatora",
  cleanliness: "Czystość",
  engineCapacity: "Pojemność silnika (cm³)",
  enginePowerKm: "Moc silnika (KM)",
  equipment: "Wyposażenie",
  "equipment.hasExtinguisher": "Gaśnica",
  "equipment.hasFirstAidKit": "Apteczka",
  "equipment.hasTriangle": "Trójkąt ostrzegawczy",
  "equipment.tiresDescription": "Opis opon",
  "equipment.tiresDescription2": "Opis opon 2",
  fleetCard: "Karta flotowa",
  "fleetCard.shellCardPinEncrypted": "PIN karty Shell (zaszyfrowany)",
  hasCamera: "Kamera",
  hasGps: "GPS",
  hasSpare: "Koło zapasowe",
  hasSpareKey: "Zapasowy kluczyk",
  hasVirtualCard: "Karta wirtualna",
  id: "ID",
  internalNumber: "Numer wewnętrzny",
  isArchived: "Zarchiwizowane",
  kup: "KUP",
  maintenance: "Serwis / utrzymanie",
  "maintenance.currentMileage": "Aktualny przebieg (km)",
  "maintenance.inspectionDueAt": "Przegląd ważny do",
  "maintenance.insuranceDueAt": "Ubezpieczenie ważne do",
  "maintenance.lastOilServiceAt": "Ostatnia wymiana oleju (data)",
  "maintenance.lastOilServiceMileage": "Przebieg przy wymianie oleju (km)",
  make: "Marka",
  model: "Model",
  plateNumber: "Numer rejestracyjny",
  productionYear: "Rok produkcji",
  registrationDocumentStatus: "Status dowodu rejestracyjnego",
  repairNotes: "Uwagi serwisowe / naprawy",
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
  borrowedByUserId: "ID użytkownika wypożyczającego",
  returnedByUserId: "ID użytkownika zwracającego",
  startAt: "Start",
  endAt: "Koniec",
  type: "Typ",
};

const KEY_LABELS_PL = {
  // fallback po samym kluczu
  createdAt: "Utworzono (data)",
  createdBy: "Utworzył (ID)",
  updatedAt: "Zaktualizowano (data)",
  updatedBy: "Zaktualizował (ID)",

  // cars
  aso: "ASO",
  assignedUser: "Przypisany użytkownik",
  baseLocation: "Baza / lokalizacja",
  batteryYear: "Rok akumulatora",
  cleanliness: "Czystość",
  engineCapacity: "Pojemność silnika (cm³)",
  enginePowerKm: "Moc silnika (KM)",
  equipment: "Wyposażenie",
  hasExtinguisher: "Gaśnica",
  hasFirstAidKit: "Apteczka",
  hasTriangle: "Trójkąt ostrzegawczy",
  tiresDescription: "Opis opon",
  tiresDescription2: "Opis opon 2",
  fleetCard: "Karta flotowa",
  shellCardPinEncrypted: "PIN karty Shell (zaszyfrowany)",
  hasCamera: "Kamera",
  hasGps: "GPS",
  hasSpare: "Koło zapasowe",
  hasSpareKey: "Zapasowy kluczyk",
  hasVirtualCard: "Karta wirtualna",
  internalNumber: "Numer wewnętrzny",
  isArchived: "Zarchiwizowane",
  kup: "KUP",
  maintenance: "Serwis / utrzymanie",
  currentMileage: "Aktualny przebieg (km)",
  inspectionDueAt: "Przegląd ważny do",
  insuranceDueAt: "Ubezpieczenie ważne do",
  lastOilServiceAt: "Ostatnia wymiana oleju (data)",
  lastOilServiceMileage: "Przebieg przy wymianie oleju (km)",
  make: "Marka",
  model: "Model",
  plateNumber: "Numer rejestracyjny",
  productionYear: "Rok produkcji",
  registrationDocumentStatus: "Status dowodu rejestracyjnego",
  repairNotes: "Uwagi serwisowe / naprawy",
  status: "Status",
  vin: "VIN",

  // users
  name: "Imię i nazwisko",
  role: "Rola",
  isActive: "Aktywny",
  pin: "PIN",
  hashMd5: "Hash PIN (MD5)",
  salt: "Sól (salt) PIN",

  // rentals
  carId: "ID auta",
  borrowedByUserId: "ID użytkownika wypożyczającego",
  returnedByUserId: "ID użytkownika zwracającego",
  startAt: "Start",
  endAt: "Koniec",
  type: "Typ",
  id: "ID",
};

const CAR_STATUS_OPTIONS = ["AVAILABLE", "IN_SERVICE", "DAMAGED", "UNFIT"];

/** =======================
 *  PEŁNY SZABLON AUTA
 *  ======================= */
const EMPTY_CAR_TEMPLATE = {
  aso: "",
  assignedUser: "",
  baseLocation: "",
  batteryYear: undefined,
  cleanliness: "",
  engineCapacity: undefined,
  enginePowerKm: undefined,
  equipment: {
    hasExtinguisher: undefined,
    hasFirstAidKit: undefined,
    hasTriangle: undefined,
    tiresDescription: "",
    tiresDescription2: "",
  },
  fleetCard: {
    shellCardPinEncrypted: "",
  },
  hasCamera: undefined,
  hasGps: undefined,
  hasSpare: undefined,
  hasSpareKey: undefined,
  hasVirtualCard: undefined,
  id: "",
  internalNumber: "",
  isArchived: undefined,
  kup: undefined,
  maintenance: {
    currentMileage: undefined,
    inspectionDueAt: "",
    insuranceDueAt: "",
    lastOilServiceAt: "",
    lastOilServiceMileage: undefined,
  },
  make: "",
  model: "",
  plateNumber: "",
  productionYear: "",
  registrationDocumentStatus: "",
  repairNotes: "",
  status: "",
  vin: "",
};

function translateLabelPL(path, rawLabel) {
  if (rawLabel && /^\[\d+\]$/.test(rawLabel)) return rawLabel;

  if (path && PATH_LABELS_PL[path]) return PATH_LABELS_PL[path];
  if (rawLabel && KEY_LABELS_PL[rawLabel]) return KEY_LABELS_PL[rawLabel];

  if (path) {
    const last = path.split(".").slice(-1)[0];
    if (KEY_LABELS_PL[last]) return KEY_LABELS_PL[last];
  }

  return rawLabel || (path ? path.split(".").slice(-1)[0] : "Pole");
}

function safe(v, fallback = "—") {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function fmtPL(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return safe(iso);
    return d.toLocaleString("pl-PL");
  } catch {
    return safe(iso);
  }
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** =======================
 *  MERGE DEFAULTÓW
 *  ======================= */
function mergeWithDefaults(defaultValue, actualValue) {
  if (Array.isArray(defaultValue)) {
    return Array.isArray(actualValue) ? actualValue : deepClone(defaultValue);
  }

  if (isPlainObject(defaultValue)) {
    const out = {};

    const actualObj = isPlainObject(actualValue) ? actualValue : {};
    const keys = new Set([...Object.keys(defaultValue), ...Object.keys(actualObj)]);

    for (const key of keys) {
      if (key in defaultValue) {
        out[key] = mergeWithDefaults(defaultValue[key], actualObj[key]);
      } else {
        out[key] = actualObj[key];
      }
    }

    return out;
  }

  if (actualValue === undefined) return defaultValue;
  return actualValue;
}

function buildCarDraft(car) {
  return mergeWithDefaults(EMPTY_CAR_TEMPLATE, car || {});
}

function randomSalt(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `slt_${out}`;
}

function isValidPin(pin) {
  return /^[0-9]{4,8}$/.test(String(pin || "").trim());
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

function coercePrimitive(type, raw) {
  if (type === "number") {
    if (raw === "" || raw === null || raw === undefined) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === "boolean") {
    if (raw === "" || raw === null || raw === undefined) return undefined;
    return !!raw;
  }
  if (type === "null") return null;
  return String(raw ?? "");
}

/** =======================
 *  DATY / CZAS
 *  ======================= */
function isIsoDateString(value) {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (!s) return false;

  const isoRegex =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

  const localRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

  if (!isoRegex.test(s) && !localRegex.test(s)) return false;

  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function isDatePath(path) {
  if (!path) return false;
  const last = path.split(".").slice(-1)[0];
  return (
    last.endsWith("At") ||
    last.endsWith("DueAt") ||
    last === "startAt" ||
    last === "endAt"
  );
}

function toDateTimeLocalValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const pad = (n) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocalValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

/** =======================
 *  UKRYWANIE AUDYTU / PÓL
 *  ======================= */
const HIDDEN_KEYS = new Set(["audit", "createdAt", "createdBy", "updatedAt", "updatedBy"]);

function isHiddenPath(path) {
  if (!path) return false;

  const parts = String(path).split(".");
  if (parts[0] === "audit") return true;
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

  if (entityType === "rentals") {
    return path === "borrowedByUserId" || path === "returnedByUserId";
  }

  if (entityType === "cars") {
    return path === "assignedUser";
  }

  return false;
}

function isReadOnlyPath(entityType, path) {
  if (!path) return false;

  if (isIdPath(path)) return true;

  if (entityType === "users" && (path === "pin.salt" || path === "pin.hashMd5")) return true;
  if (entityType === "rentals" && path === "carId") return true;

  return false;
}

function isCarStatusPath(entityType, path) {
  return entityType === "cars" && path === "status";
}

/** =======================
 *  POLA LICZBOWE
 *  ======================= */
const NUMBER_PATHS = new Set([
  "batteryYear",
  "engineCapacity",
  "enginePowerKm",
  "maintenance.currentMileage",
  "maintenance.lastOilServiceMileage",
]);

function isNumberPath(path) {
  return !!path && NUMBER_PATHS.has(path);
}

/** =======================
 *  SORTOWANIE / FILTROWANIE RENTALS
 *  ======================= */
const RENTAL_SORT_OPTIONS = [
  { value: "startAt", label: "Data rozpoczęcia" },
  { value: "endAt", label: "Data zakończenia" },
  { value: "car.make", label: "Marka pojazdu" },
  { value: "car.model", label: "Model pojazdu" },
  { value: "car.plateNumber", label: "Numer rejestracyjny" },
  { value: "borrowedUser.name", label: "Osoba wypożyczająca" },
  { value: "returnedUser.name", label: "Osoba zwracająca" },
  { value: "car.maintenance.lastOilServiceAt", label: "Data ostatniej wymiany oleju" },
  { value: "car.maintenance.insuranceDueAt", label: "Data ważności ubezpieczenia" },
  { value: "car.maintenance.inspectionDueAt", label: "Data ważności przeglądu" },
  { value: "audit.createdAt", label: "Data utworzenia rekordu" },
  { value: "audit.updatedAt", label: "Data aktualizacji rekordu" },
];

const RENTAL_DATE_SORT_KEYS = new Set([
  "startAt",
  "endAt",
  "car.maintenance.lastOilServiceAt",
  "car.maintenance.insuranceDueAt",
  "car.maintenance.inspectionDueAt",
  "audit.createdAt",
  "audit.updatedAt",
]);

function getRentalSortValue(sortKey, rental, car, borrowedUser, returnedUser) {
  switch (sortKey) {
    case "startAt":
      return rental?.startAt ?? null;
    case "endAt":
      return rental?.endAt ?? null;
    case "car.make":
      return car?.make ?? "";
    case "car.model":
      return car?.model ?? "";
    case "car.plateNumber":
      return car?.plateNumber ?? "";
    case "borrowedUser.name":
      return borrowedUser?.name ?? "";
    case "returnedUser.name":
      return returnedUser?.name ?? "";
    case "car.maintenance.lastOilServiceAt":
      return car?.maintenance?.lastOilServiceAt ?? null;
    case "car.maintenance.insuranceDueAt":
      return car?.maintenance?.insuranceDueAt ?? null;
    case "car.maintenance.inspectionDueAt":
      return car?.maintenance?.inspectionDueAt ?? null;
    case "audit.createdAt":
      return rental?.audit?.createdAt ?? null;
    case "audit.updatedAt":
      return rental?.audit?.updatedAt ?? null;
    default:
      return "";
  }
}

function compareNullableValues(a, b, direction = "asc", isDate = false) {
  const dir = direction === "desc" ? -1 : 1;

  const emptyA = a === null || a === undefined || a === "";
  const emptyB = b === null || b === undefined || b === "";

  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;

  if (isDate) {
    const ta = new Date(a).getTime();
    const tb = new Date(b).getTime();

    const safeA = Number.isFinite(ta) ? ta : Number.POSITIVE_INFINITY;
    const safeB = Number.isFinite(tb) ? tb : Number.POSITIVE_INFINITY;

    if (safeA < safeB) return -1 * dir;
    if (safeA > safeB) return 1 * dir;
    return 0;
  }

  const sa = String(a).toLocaleLowerCase("pl-PL");
  const sb = String(b).toLocaleLowerCase("pl-PL");

  return sa.localeCompare(sb, "pl", { sensitivity: "base" }) * dir;
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
}) {
  if (isHiddenPath(currentPath)) return null;

  const value = getAtPath(rootValue, currentPath);
  const t = typeOfValue(value);

  const rawLabel = label || (currentPath ? currentPath.split(".").slice(-1)[0] : "value");
  const showLabel = translateLabelPL(currentPath, rawLabel);

  const isReadOnly = isReadOnlyPath(entityType, currentPath);
  const isUserRef = isUserReferencePath(entityType, currentPath);
  const isCarStatus = isCarStatusPath(entityType, currentPath);
  const isNumberField = isNumberPath(currentPath);
  const isDateField = (t === "string" || t === "undefined") && isDatePath(currentPath);
  const effectiveDisabled = disabled || isReadOnly;

  if (t === "string" || t === "number" || t === "boolean" || t === "null" || t === "undefined") {
    return (
      <div className={styles.fieldRow}>
        <div className={styles.fieldLabel}>
          <span>{showLabel}</span>
          {currentPath && (
            <span className={styles.fieldMeta}>
              {isDateField ? "datetime" : isNumberField ? "number" : t}
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
                  {safe(u.name)} | id: ({u.id})
                </option>
              ))}
            </select>
          ) : isCarStatus ? (
            <select
              className={styles.input}
              disabled={effectiveDisabled}
              value={value ?? ""}
              onChange={(e) => {
                onRootChange(setAtPath(rootValue, currentPath, e.target.value));
              }}
            >
              <option value="">— wybierz status —</option>
              {CAR_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          ) : isNumberField || t === "number" ? (
            <input
              className={styles.input}
              disabled={effectiveDisabled}
              type="number"
              value={value ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                onRootChange(
                  setAtPath(
                    rootValue,
                    currentPath,
                    raw === "" ? undefined : coercePrimitive("number", raw)
                  )
                );
              }}
            />
          ) : t === "boolean" || t === "undefined" ? (
            <select
              className={styles.input}
              disabled={effectiveDisabled}
              value={value === true ? "true" : value === false ? "false" : ""}
              onChange={(e) => {
                let v;
                if (e.target.value === "") v = undefined;
                else v = e.target.value === "true";
                onRootChange(setAtPath(rootValue, currentPath, v));
              }}
            >
              <option value="">— puste —</option>
              <option value="true">tak</option>
              <option value="false">nie</option>
            </select>
          ) : isDateField ? (
            <>
              <input
                className={styles.input}
                disabled={effectiveDisabled}
                type="datetime-local"
                value={isIsoDateString(value) ? toDateTimeLocalValue(value) : ""}
                onChange={(e) => {
                  onRootChange(setAtPath(rootValue, currentPath, fromDateTimeLocalValue(e.target.value)));
                }}
              />
              <div className={styles.fieldMeta} style={{ marginTop: 6 }}>
                {value ? `Podgląd: ${fmtPL(value)}` : "Brak daty"}
              </div>
            </>
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
        </div>
      </div>
    );
  }

  if (t === "array") {
    const arr = Array.isArray(value) ? value : [];

    return (
      <div className={styles.nodeBox}>
        <div className={styles.nodeHeader}>
          <div className={styles.nodeTitle}>
            {showLabel} <span className={styles.nodeMeta}>(tablica · {arr.length})</span>
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
                />
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

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
}) {
  const entries = Object.entries(obj || {})
    .filter(([k]) => !isHiddenPath(pathJoin(currentPath, k)))
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) return null;

  return (
    <div className={styles.nodeBox}>
      <div className={styles.nodeHeader}>
        <div className={styles.nodeTitle}>{label}</div>
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

  const [draftUser, setDraftUser] = useState(null);
  const [draftCar, setDraftCar] = useState(null);
  const [draftRental, setDraftRental] = useState(null);

  const [userPlainPin, setUserPlainPin] = useState("");

  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  /** =======================
   *  FILTRY / SORT RENTALS
   *  ======================= */
  const [rentalFilterUserId, setRentalFilterUserId] = useState("");
  const [rentalFilterCarId, setRentalFilterCarId] = useState("");
  const [rentalSearchText, setRentalSearchText] = useState("");
  const [rentalSortBy, setRentalSortBy] = useState("startAt");
  const [rentalSortDir, setRentalSortDir] = useState("desc");

  useEffect(() => {
    const unsubUsers = onValue(
      ref(database, "users"),
      (snap) => {
        const val = snap.val();
        const arr = val ? Object.values(val) : [];
        arr.sort((a, b) => (a?.name || "").localeCompare(b?.name || "", "pl", { sensitivity: "base" }));
        setUsers(arr);
      },
      console.error
    );

    const unsubCars = onValue(
      ref(database, "cars"),
      (snap) => {
        const val = snap.val();
        const arr = val ? Object.values(val) : [];
        arr.sort((a, b) =>
          (a?.plateNumber || "").localeCompare(b?.plateNumber || "", "pl", { sensitivity: "base" })
        );
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
    return [...users].sort((a, b) => (a?.name || "").localeCompare(b?.name || "", "pl", { sensitivity: "base" }));
  }, [users]);

  const carOptions = useMemo(() => {
    return [...cars].sort((a, b) => {
      const labelA = `${a?.plateNumber || ""} ${a?.make || ""} ${a?.model || ""}`;
      const labelB = `${b?.plateNumber || ""} ${b?.make || ""} ${b?.model || ""}`;
      return labelA.localeCompare(labelB, "pl", { sensitivity: "base" });
    });
  }, [cars]);

  const visibleRentals = useMemo(() => {
    const q = rentalSearchText.trim().toLocaleLowerCase("pl-PL");

    const filtered = rentals.filter((r) => {
      const car = carsById.get(r?.carId);
      const borrowedUser = usersById.get(r?.borrowedByUserId);
      const returnedUser = usersById.get(r?.returnedByUserId);

      if (rentalFilterUserId) {
        const matchesUser =
          r?.borrowedByUserId === rentalFilterUserId || r?.returnedByUserId === rentalFilterUserId;
        if (!matchesUser) return false;
      }

      if (rentalFilterCarId && r?.carId !== rentalFilterCarId) {
        return false;
      }

      if (q) {
        const haystack = [
          r?.id,
          r?.type,
          r?.status,
          r?.carId,
          r?.borrowedByUserId,
          r?.returnedByUserId,
          r?.startAt,
          r?.endAt,
          car?.plateNumber,
          car?.make,
          car?.model,
          car?.maintenance?.lastOilServiceAt,
          car?.maintenance?.insuranceDueAt,
          car?.maintenance?.inspectionDueAt,
          borrowedUser?.name,
          returnedUser?.name,
        ]
          .map((v) => String(v ?? "").toLocaleLowerCase("pl-PL"))
          .join(" ");

        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const carA = carsById.get(a?.carId);
      const carB = carsById.get(b?.carId);
      const borrowedA = usersById.get(a?.borrowedByUserId);
      const borrowedB = usersById.get(b?.borrowedByUserId);
      const returnedA = usersById.get(a?.returnedByUserId);
      const returnedB = usersById.get(b?.returnedByUserId);

      const valueA = getRentalSortValue(rentalSortBy, a, carA, borrowedA, returnedA);
      const valueB = getRentalSortValue(rentalSortBy, b, carB, borrowedB, returnedB);

      const isDate = RENTAL_DATE_SORT_KEYS.has(rentalSortBy);
      const mainCmp = compareNullableValues(valueA, valueB, rentalSortDir, isDate);
      if (mainCmp !== 0) return mainCmp;

      return compareNullableValues(a?.startAt, b?.startAt, "desc", true);
    });

    return sorted;
  }, [
    rentals,
    carsById,
    usersById,
    rentalFilterUserId,
    rentalFilterCarId,
    rentalSearchText,
    rentalSortBy,
    rentalSortDir,
  ]);

  function setMessage(type, text) {
    setMsg({ type, text });
  }

  function selectUser(id) {
    setSelectedUserId(id);
    setSelectedCarId("");
    setSelectedRentalId("");
    setDraftCar(null);
    setDraftRental(null);

    const u = usersById.get(id);
    if (!u) return;

    setDraftUser(deepClone(u));
    setUserPlainPin("");
    setMsg(null);
  }

  function selectCar(id) {
    setSelectedCarId(id);
    setSelectedUserId("");
    setSelectedRentalId("");
    setDraftUser(null);
    setDraftRental(null);
    setUserPlainPin("");

    const c = carsById.get(id);
    if (!c) return;

    setDraftCar(buildCarDraft(c));
    setMsg(null);
  }

  function selectRental(id) {
    setSelectedRentalId(id);
    setSelectedUserId("");
    setSelectedCarId("");
    setDraftUser(null);
    setDraftCar(null);
    setUserPlainPin("");

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

      if (kind === "users") {
        const trimmedPin = String(userPlainPin || "").trim();

        if (trimmedPin) {
          if (!isValidPin(trimmedPin)) {
            setMessage("error", "Nowy PIN musi mieć 4–8 cyfr (tylko cyfry).");
            setBusy(false);
            return;
          }

          const salt = randomSalt(10);
          const hashMd5 = md5(`${salt}${trimmedPin}`);

          next.pin = next.pin || {};
          next.pin.salt = salt;
          next.pin.hashMd5 = hashMd5;
        }
      }

      next.audit = next.audit || {};
      next.audit.updatedAt = nowIso;
      next.audit.updatedBy = adminUserId;

      await set(ref(database, `${kind}/${id}`), next);

      setMessage(
        "ok",
        kind === "users" && String(userPlainPin || "").trim()
          ? "Zapisano USER. PIN został przeliczony na hash + salt."
          : `Zapisano ${kind.toUpperCase()} (wszystkie pola).`
      );

      if (kind === "users") {
        setDraftUser(next);
        setUserPlainPin("");
      }
      if (kind === "cars") setDraftCar(buildCarDraft(next));
      if (kind === "rentals") setDraftRental(next);
    } catch (e) {
      console.error(e);
      setMessage("error", "Błąd zapisu do bazy.");
    } finally {
      setBusy(false);
    }
  }

  function fillQuickPin(pinValue) {
    const pin = String(pinValue || "").trim();

    if (!isValidPin(pin)) {
      setMessage("error", "PIN musi mieć 4–8 cyfr.");
      return;
    }

    setUserPlainPin(pin);
    setMessage("ok", "Nowy PIN ustawiony w formularzu. Kliknij „Zapisz USER”, żeby wysłać do DB.");
  }

  function resetPinQuick() {
    if (!selectedUserId || !draftUser) return;

    const plainPin = prompt("Podaj nowy PIN (4–8 cyfr):");
    if (plainPin === null) return;

    fillQuickPin(plainPin);
  }

  function resetRentalFiltersAndSort() {
    setRentalFilterUserId("");
    setRentalFilterCarId("");
    setRentalSearchText("");
    setRentalSortBy("startAt");
    setRentalSortDir("desc");
  }

  return (
    <div className={styles.wrapper}>
      <Navbar />
      <h2 className={styles.pageTitle}>Admin Panel</h2>

      {msg && (
        <div className={`${styles.message} ${msg.type === "ok" ? styles.messageOk : styles.messageError}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className={styles.box}>Ładuję dane...</div>
      ) : (
        <>
          <div className={styles.box}>
            <h3 className={styles.boxTitle}>Dane</h3>
            <div className={styles.tabsRow}>
              <button onClick={() => setActiveTab("USERS")} className={tabClass(activeTab === "USERS")}>
                Użytkownicy ({users.length})
              </button>
              <button onClick={() => setActiveTab("CARS")} className={tabClass(activeTab === "CARS")}>
                Samochody ({cars.length})
              </button>
              <button onClick={() => setActiveTab("RENTALS")} className={tabClass(activeTab === "RENTALS")}>
                Wypożyczenia ({rentals.length})
              </button>
            </div>
          </div>

          {activeTab === "USERS" && (
            <div className={styles.box}>
              <h3 className={styles.boxTitle}>USERS — edycja każdego pola</h3>

              <div className={styles.gridUsers}>
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
                        <div className={styles.itemMeta}>· aktywny: {String(!!u.isActive)} ·</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  {!selectedUserId || !draftUser ? (
                    <div className={styles.muted}>Wybierz użytkownika z listy.</div>
                  ) : (
                    <>
                      <div className={styles.actionsRow}>
                        <button onClick={() => saveWhole("users")} disabled={busy} className={styles.btnPrimary}>
                          Zapisz USER (wszystkie pola)
                        </button>

                        <button onClick={resetPinQuick} disabled={busy} className={styles.btnSecondary}>
                          Szybka zmiana PIN
                        </button>
                      </div>

                      <div className={styles.box} style={{ marginTop: 12 }}>
                        <h4 className={styles.boxTitle}>Zmiana PIN użytkownika</h4>

                        <div className={styles.fieldRow}>
                          <div className={styles.fieldLabel}>
                            <span>Aktualny hash PIN (MD5)</span>
                            <span className={styles.fieldMeta}>readonly</span>
                          </div>
                          <div className={styles.fieldControl}>
                            <input
                              className={styles.input}
                              value={draftUser?.pin?.hashMd5 || ""}
                              disabled
                              readOnly
                            />
                          </div>
                        </div>

                        <div className={styles.fieldRow}>
                          <div className={styles.fieldLabel}>
                            <span>Nowy PIN (4–8 cyfr)</span>
                          </div>
                          <div className={styles.fieldControl}>
                            <input
                              className={styles.input}
                              type="password"
                              value={userPlainPin}
                              onChange={(e) => setUserPlainPin(e.target.value)}
                              placeholder="np. 1234"
                              inputMode="numeric"
                              autoComplete="off"
                              disabled={busy}
                            />
                          </div>
                        </div>
                      </div>

                      <DynamicEditor
                        rootValue={draftUser}
                        currentPath=""
                        label="Użytkownik"
                        disabled={busy}
                        entityType="users"
                        userOptions={userOptions}
                        onRootChange={setDraftUser}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "CARS" && (
            <div className={styles.box}>
              <h3 className={styles.boxTitle}>CARS — edycja każdego pola</h3>

              <div className={styles.gridCars}>
                <div className={styles.listCard}>
                  <div className={styles.listHeader}>Lista cars</div>
                  <div className={styles.listBody}>
                    {cars.map((c) => {
                      const assignedUser = usersById.get(c?.assignedUser);

                      return (
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
                            przypisany użytkownik: {safe(assignedUser?.name, c?.assignedUser || "—")}
                          </div>

                          <div className={styles.itemMeta}>
                            przegląd: {fmtPL(c?.maintenance?.inspectionDueAt)} · ubezpieczenie:{" "}
                            {fmtPL(c?.maintenance?.insuranceDueAt)}
                          </div>

                          <div className={styles.itemMeta}>
                            fleetCard.shellCardPinEncrypted: <code>{safe(c?.fleetCard?.shellCardPinEncrypted)}</code>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  {!selectedCarId || !draftCar ? (
                    <div className={styles.muted}>Wybierz auto z listy.</div>
                  ) : (
                    <>
                      <div className={styles.actionsRow}>
                        <button onClick={() => saveWhole("cars")} disabled={busy} className={styles.btnPrimary}>
                          ZAPISZ ZMIANY (wszystkie pola)
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
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "RENTALS" && (
            <div className={styles.box}>
              <h3 className={styles.boxTitle}>WYPOŻYCZENIA — edycja każdego pola + filtrowanie i sortowanie</h3>

              <div className={styles.box} style={{ marginBottom: 16 }}>
                <h4 className={styles.boxTitle}>Filtry i sortowanie rentals</h4>

                <div className={styles.fieldRow}>
                  <div className={styles.fieldLabel}>
                    <span>Filtruj po osobie</span>
                  </div>
                  <div className={styles.fieldControl}>
                    <select
                      className={styles.input}
                      value={rentalFilterUserId}
                      onChange={(e) => setRentalFilterUserId(e.target.value)}
                    >
                      <option value="">— wszyscy użytkownicy —</option>
                      {userOptions.map((u) => (
                        <option key={u.id} value={u.id}>
                          {safe(u.name)} | id: ({u.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.fieldRow}>
                  <div className={styles.fieldLabel}>
                    <span>Filtruj po pojeździe</span>
                  </div>
                  <div className={styles.fieldControl}>
                    <select
                      className={styles.input}
                      value={rentalFilterCarId}
                      onChange={(e) => setRentalFilterCarId(e.target.value)}
                    >
                      <option value="">— wszystkie pojazdy —</option>
                      {carOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {safe(c.plateNumber)} — {safe(c.make)} {safe(c.model)} | id: ({c.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.fieldRow}>
                  <div className={styles.fieldLabel}>
                    <span>Wyszukiwanie tekstowe</span>
                  </div>
                  <div className={styles.fieldControl}>
                    <input
                      className={styles.input}
                      value={rentalSearchText}
                      onChange={(e) => setRentalSearchText(e.target.value)}
                      placeholder="np. Kowalski, WX12345, Toyota, ACTIVE..."
                    />
                  </div>
                </div>

                <div className={styles.fieldRow}>
                  <div className={styles.fieldLabel}>
                    <span>Sortuj po</span>
                  </div>
                  <div className={styles.fieldControl}>
                    <select
                      className={styles.input}
                      value={rentalSortBy}
                      onChange={(e) => setRentalSortBy(e.target.value)}
                    >
                      {RENTAL_SORT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.fieldRow}>
                  <div className={styles.fieldLabel}>
                    <span>Kierunek sortowania</span>
                  </div>
                  <div className={styles.fieldControl}>
                    <select
                      className={styles.input}
                      value={rentalSortDir}
                      onChange={(e) => setRentalSortDir(e.target.value)}
                    >
                      <option value="asc">Rosnąco</option>
                      <option value="desc">Malejąco</option>
                    </select>
                  </div>
                </div>

                <div className={styles.actionsRow}>
                  <button onClick={resetRentalFiltersAndSort} className={styles.btnSecondary}>
                    Reset filtrów i sortowania
                  </button>
                </div>
              </div>

              <div className={styles.gridRentals}>
                <div className={styles.listCard}>
                  <div className={styles.listHeader}>Lista Wypożyczeń ({visibleRentals.length})</div>
                  <div className={styles.listBody}>
                    {visibleRentals.length === 0 ? (
                      <div className={styles.muted}>Brak wyników dla aktualnych filtrów.</div>
                    ) : (
                      visibleRentals.map((r) => {
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
                              [{type}] {activeLabel} — {safe(car?.plateNumber, r.carId)} — {safe(car?.make)}{" "}
                              {safe(car?.model)}
                            </div>

                            <div className={styles.itemMeta}>
                              · status: {safe(r.status)} · start: {fmtPL(r.startAt)} · koniec: {fmtPL(r.endAt)}
                            </div>

                            <div className={styles.itemMeta}>
                              user: {safe(borrowedUser?.name, r.borrowedByUserId)}
                              {r?.returnedByUserId ? ` · zwrócił: ${safe(returnedUser?.name, r.returnedByUserId)}` : ""}
                            </div>

                            <div className={styles.itemMeta}>
                              olej: {fmtPL(car?.maintenance?.lastOilServiceAt)} · ubezpieczenie:{" "}
                              {fmtPL(car?.maintenance?.insuranceDueAt)} · przegląd:{" "}
                              {fmtPL(car?.maintenance?.inspectionDueAt)}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div>
                  {!selectedRentalId || !draftRental ? (
                    <div className={styles.muted}>Wybierz wypożyczenie / rezerwację z listy.</div>
                  ) : (
                    <>
                      <div className={styles.actionsRow}>
                        <button onClick={() => saveWhole("rentals")} disabled={busy} className={styles.btnPrimary}>
                          Zapisz Zmiany (wszystkie pola)
                        </button>
                      </div>

                      <DynamicEditor
                        rootValue={draftRental}
                        currentPath=""
                        label="Wypożyczenie"
                        disabled={busy}
                        entityType="rentals"
                        userOptions={userOptions}
                        onRootChange={setDraftRental}
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
        PODSUMOWANIE ILOŚCI DANYCH: users={users.length}, cars={cars.length}, rentals={rentals.length}
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