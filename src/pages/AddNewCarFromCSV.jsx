import React, { useMemo, useState } from "react";
import { database, ref, get, push, set } from "../FirebaseConfig";
import styles from "./AddNewCar.module.css";
import Navbar from "./Navbar";
import useRequireSuperAdmin from "./useRequireSuperAdmin";

const DEFAULT_STATUS = "AVAILABLE";

/**
 * Usuwa BOM, trimuje i normalizuje spacje.
 */
function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Zamiana "YYYY-MM-DD" na ISO UTC.
 */
function dateToIsoOrNull(dateStr) {
  if (!dateStr) return null;

  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, yyyy, mm, dd] = match;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);

  if (Number.isNaN(d.getTime())) return null;

  // dodatkowa walidacja, żeby 31.02 nie weszło jako marzec
  if (
    d.getUTCFullYear() !== Number(yyyy) ||
    d.getUTCMonth() + 1 !== Number(mm) ||
    d.getUTCDate() !== Number(dd)
  ) {
    return null;
  }

  return d.toISOString();
}

/**
 * Zamiana dokładnego "DD.MM.YYYY" na ISO UTC.
 */
function polishDateToIsoOrNull(value) {
  if (!value) return null;

  const raw = cleanText(value);
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (!match) return null;

  const [, dd, mm, yyyy] = match;
  return dateToIsoOrNull(`${yyyy}-${mm}-${dd}`);
}

/**
 * Wyciąga pierwszą datę DD.MM.YYYY z dowolnego tekstu i zwraca ISO.
 * Np. "29.09.2026 lub 30000 km" -> ISO dla 2026-09-29
 */
function extractFirstPolishDateToIsoOrNull(value) {
  if (!value) return null;

  const raw = cleanText(value);
  const match = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);

  if (!match) return null;

  const [, dd, mm, yyyy] = match;
  return dateToIsoOrNull(`${yyyy}-${mm}-${dd}`);
}

/**
 * Czy wartość wygląda na "brak danych".
 */
function isNoData(value) {
  const v = cleanText(value).toUpperCase();

  return (
    v === "" ||
    v === "-" ||
    v === "N/D" ||
    v === "ND" ||
    v === "BRAK" ||
    v === "?" ||
    v === "WPISAĆ" ||
    v === "WPISA?" ||
    v === "WPISAC" ||
    v === "N/A"
  );
}

/**
 * Normalizacja pod porównania nagłówków / nazw użytkowników.
 * Usuwa polskie znaki, śmieci z kodowania, znaki specjalne itd.
 */
function normalizeLoose(value) {
  return cleanText(value)
    .replace(/�/g, "")
    .replace(/\?/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Łł]/g, "l")
    .replace(/[Óó]/g, "o")
    .replace(/[Śś]/g, "s")
    .replace(/[ŻżŹź]/g, "z")
    .replace(/[Ćć]/g, "c")
    .replace(/[Ńń]/g, "n")
    .replace(/[Ęę]/g, "e")
    .replace(/[Ąą]/g, "a")
    .replace(/[^\w]+/g, "")
    .toLowerCase();
}

/**
 * Parser prostego CSV z separatorem ; i obsługą cudzysłowów.
 */
function parseSemicolonCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ";" && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }

      row.push(cell);
      const hasAnyValue = row.some((c) => cleanText(c) !== "");
      if (hasAnyValue) rows.push(row);

      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    const hasAnyValue = row.some((c) => cleanText(c) !== "");
    if (hasAnyValue) rows.push(row);
  }

  return rows;
}

/**
 * Odczyt CSV:
 * - windows-1250
 * - iso-8859-2
 * - utf-8
 * Wybierana jest wersja z najlepszym wynikiem jakości.
 */
async function readCsvFile(file) {
  const buffer = await file.arrayBuffer();

  const tryDecode = (encoding) => {
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(buffer);
    } catch {
      return "";
    }
  };

  const candidates = [
    { encoding: "windows-1250", text: tryDecode("windows-1250") },
    { encoding: "iso-8859-2", text: tryDecode("iso-8859-2") },
    { encoding: "utf-8", text: tryDecode("utf-8") },
  ];

  const score = (txt) => {
    const sample = txt.slice(0, 4000).toLowerCase();

    let points = 0;

    // dobre sygnały
    [
      "rejestracja",
      "marka/ model",
      "data badania technicznego",
      "ubezpieczenie",
      "użytkownik",
      "uzytkownik",
      "dowód",
      "dowod",
      "trójkąt",
      "trojkat",
      "apteczka",
      "gaśnica",
      "gasnica",
      "czystość",
      "czystosc",
      "dodatkowy klucz",
      "przebieg",
      "aku rok",
    ].forEach((needle) => {
      if (sample.includes(needle)) points += 4;
    });

    // dobre znaki
    points += (sample.match(/[ąćęłńóśźż]/g) || []).length * 0.5;

    // złe sygnały kodowania
    points -= (sample.match(/�/g) || []).length * 3;
    points -= (sample.match(/Ã|Å|Ä|Ę|Â/g) || []).length * 2;

    // częste rozwalone formy
    [
      "u?ytkownik",
      "tr�jk",
      "ga?nica",
      "czysto??",
      "do?o?y",
      "zamontowa?",
      "widzia?em",
      "popraw?",
      "ma?y",
      "du?y",
    ].forEach((needle) => {
      if (sample.includes(needle)) points -= 1;
    });

    return points;
  };

  const best = candidates.sort((a, b) => score(b.text) - score(a.text))[0];
  return best.text;
}

/**
 * Mapowanie nagłówków CSV na klucze wewnętrzne.
 */
function mapHeaderToKey(header) {
  const h = normalizeLoose(header);

  const map = {
    lp: "lp",
    rejestracja: "registration",
    markamodel: "makeModel",
    aso: "aso",
    databadaniatechnicznego: "inspectionDueAt",
    ubezpieczenie: "insuranceDueAt",
    kup: "kup",
    przypisanyuzytkownik: "assignedUserName",
    dowodrejestracyjny: "registrationDocumentStatus",
    dowdrejestracyjny: "registrationDocumentStatus",
    gps: "hasGps",
    serwisolejowyna03102025r: "oilService",
    serwisolejowynao3102025r: "oilService",
    serwisolejowyna03102025: "oilService",
    serwisolejowy: "oilService",
    donaprawyzrobienia: "repairNotes",
    oponyzimalato: "tiresDescription",
    kamera: "hasCamera",
    flotapin: "shellCardPinEncrypted",
    dodatkowyklucz: "hasSpareKey",
    trojkat: "hasTriangle",
    trjkt: "hasTriangle",
    apteczka: "hasFirstAidKit",
    gasnica: "hasExtinguisher",
    ganica: "hasExtinguisher",
    kartawirtualna: "hasVirtualCard",
    czystosc: "cleanliness",
    czysto: "cleanliness",
    oponyzimalato2: "tiresDescription2",
    zapas: "hasSpare",
    przebiegna03102025r: "currentMileage",
    akurok: "batteryYear",
  };

  return map[h] || null;
}

function csvRowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];

  const headers = rows[0].map((h) => mapHeaderToKey(h));

  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((key, index) => {
      if (!key) return;
      obj[key] = cleanText(row[index] ?? "");
    });
    return obj;
  });
}

function pickDefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  );
}

function parseNumericValue(value) {
  if (isNoData(value)) return undefined;

  const raw = cleanText(value).replace(",", ".");
  const match = raw.match(/-?\d+(?:\.\d+)?/);

  if (!match) return undefined;

  const num = Number(match[0]);
  return Number.isFinite(num) ? num : undefined;
}

function parseIntegerFromText(value) {
  if (isNoData(value)) return undefined;

  const raw = cleanText(value).toUpperCase();
  const digits = raw.replace(/[^\d]/g, "");

  if (!digits) return undefined;

  const num = Number(digits);
  return Number.isFinite(num) ? num : undefined;
}

function parseMileage(value) {
  return parseIntegerFromText(value);
}

function parseBatteryData(value) {
  if (isNoData(value)) return {};

  const raw = cleanText(value);
  const upper = raw.toUpperCase();

  let batteryYear;
  const batteryLabel = raw;

  // pełny rok: 2025
  const fullYearMatch = upper.match(/\b(19\d{2}|20\d{2})\b/);
  if (fullYearMatch) {
    batteryYear = Number(fullYearMatch[1]);
    return pickDefined({ batteryYear, batteryLabel });
  }

  // mm.yy np. 12.21
  const monthYearMatch = upper.match(/\b(\d{1,2})[./-](\d{2})\b/);
  if (monthYearMatch) {
    const yy = Number(monthYearMatch[2]);
    batteryYear = yy <= 79 ? 2000 + yy : 1900 + yy;
    return pickDefined({ batteryYear, batteryLabel });
  }

  // pierwsze sensowne 2 cyfry np. "24 5 lat", "19 2 lata", "25"
  const shortYearMatch = upper.match(/\b(\d{2})\b/);
  if (shortYearMatch) {
    const yy = Number(shortYearMatch[1]);
    batteryYear = yy <= 79 ? 2000 + yy : 1900 + yy;
    return pickDefined({ batteryYear, batteryLabel });
  }

  return pickDefined({ batteryLabel });
}

function splitMakeModel(value) {
  const raw = cleanText(value);
  if (!raw || isNoData(raw)) {
    return { make: "", model: "" };
  }

  const upper = raw.toUpperCase();

  const knownTwoWordMakes = [
    "ALFA ROMEO",
    "ASTON MARTIN",
    "LAND ROVER",
    "MERCEDES BENZ",
    "MERCEDES-BENZ",
    "ROLLS ROYCE",
  ];

  for (const brand of knownTwoWordMakes) {
    if (upper.startsWith(brand)) {
      const make = brand.replace(/\s+/g, " ").toUpperCase();
      const model = upper.slice(brand.length).trim();
      return { make, model: model || "" };
    }
  }

  const parts = upper.split(/\s+/);
  if (parts.length === 1) {
    return { make: parts[0], model: "" };
  }

  return {
    make: parts[0],
    model: parts.slice(1).join(" "),
  };
}

function parseBooleanDecision(value) {
  if (isNoData(value)) {
    return { value: undefined, raw: undefined };
  }

  const raw = cleanText(value);
  const upper = raw.toUpperCase();
  const normalized = normalizeLoose(raw);

  const exactTrue = new Set([
    "TAK",
    "T",
    "TRUE",
    "1",
    "X",
    "✓",
    "✔",
    "☑",
    "V",
    "MAM",
    "JEST",
    "POSIADA",
    "OK",
  ]);

  const exactFalse = new Set([
    "NIE",
    "N",
    "FALSE",
    "0",
    "BRAK",
    "NIE MA",
  ]);

  if (exactTrue.has(upper)) {
    return { value: true, raw };
  }

  if (exactFalse.has(upper)) {
    return { value: false, raw };
  }

  // raczej pozytywne
  if (
    normalized.includes("zamontow") ||
    normalized.includes("doloz") ||
    normalized.includes("zestaw") ||
    normalized.includes("mamdowod") ||
    normalized.includes("prezesma") ||
    normalized.includes("przemekma") ||
    normalized.includes("wwa")
  ) {
    return { value: true, raw };
  }

  // raczej negatywne
  if (
    normalized.includes("niewidzial") ||
    normalized.includes("niemam") ||
    normalized.includes("brak")
  ) {
    return { value: false, raw };
  }

  return { value: undefined, raw };
}

function parseOptionalBool(value) {
  return parseBooleanDecision(value);
}

function parseEquipmentBool(value) {
  return parseBooleanDecision(value);
}

function parseKup(value) {
  return parseBooleanDecision(value);
}

function parseOilService(value) {
  if (isNoData(value)) return undefined;

  const raw = cleanText(value);
  const dueAt = extractFirstPolishDateToIsoOrNull(raw) || undefined;

  const mileageMatches = [...raw.matchAll(/(\d[\d\s]*)\s*km/gi)]
    .map((m) => Number(String(m[1]).replace(/[^\d]/g, "")))
    .filter((n) => Number.isFinite(n));

  const oilTypeMatch = raw.match(/\b([A-Z][A-Z0-9]*\s*\d{1,2}W\d{2})\b/i);
  const oilType = oilTypeMatch
    ? cleanText(oilTypeMatch[1]).toUpperCase()
    : undefined;

  const normalized = normalizeLoose(raw);

  return pickDefined({
    raw,
    dueAt,
    oilType,
    mileageValues: mileageMatches.length > 0 ? mileageMatches : undefined,
    currentMileageAtService:
      mileageMatches.length >= 2 ? mileageMatches[0] : undefined,
    nextMileageDue:
      mileageMatches.length >= 2
        ? mileageMatches[1]
        : mileageMatches.length === 1 &&
          (normalized.includes("lub") || normalized.includes("przy"))
        ? mileageMatches[0]
        : undefined,
  });
}

function parseAso(value) {
  if (isNoData(value)) return undefined;

  const raw = cleanText(value);
  const dueAt = extractFirstPolishDateToIsoOrNull(raw) || undefined;

  const mileageMatches = [...raw.matchAll(/(\d[\d\s]*)\s*km/gi)]
    .map((m) => Number(String(m[1]).replace(/[^\d]/g, "")))
    .filter((n) => Number.isFinite(n));

  return pickDefined({
    raw,
    dueAt,
    mileageValues: mileageMatches.length > 0 ? mileageMatches : undefined,
    nextMileageDue: mileageMatches.length > 0 ? mileageMatches[0] : undefined,
  });
}

function sanitizeSourceCsv(row) {
  return pickDefined(
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        !isNoData(value) ? cleanText(value) : undefined,
      ])
    )
  );
}

function buildUserLookup(users) {
  const map = new Map();

  users.forEach((user) => {
    const candidates = [
      user.displayName,
      user.fullName,
      user.name,
      user.email,
      user.id,
    ]
      .map(cleanText)
      .filter(Boolean);

    candidates.forEach((label) => {
      map.set(normalizeLoose(label), user.id);
    });

    const display =
      cleanText(user.displayName) ||
      cleanText(user.fullName) ||
      cleanText(user.name) ||
      "";

    if (display) {
      const parts = display.split(/\s+/).filter(Boolean);

      if (parts[0]) {
        map.set(normalizeLoose(parts[0]), user.id);
      }

      if (parts.length >= 2) {
        const firstLast = `${parts[0]} ${parts[1]}`;
        map.set(normalizeLoose(firstLast), user.id);

        const shortLast = `${parts[0]} ${parts[1][0]}.`;
        map.set(normalizeLoose(shortLast), user.id);

        const initials = `${parts[0][0] || ""}${parts[1][0] || ""}`;
        if (initials) {
          map.set(normalizeLoose(initials), user.id);
        }
      }
    }
  });

  return map;
}

function splitAssignedUserTokens(rawValue) {
  if (isNoData(rawValue)) return [];

  return cleanText(rawValue)
    .split(/\s*,\s*|\s*\/\s*|\s*&\s*|\s+i\s+/i)
    .map(cleanText)
    .filter(Boolean);
}

function resolveAssignedUsers(rawValue, userLookup) {
  if (isNoData(rawValue)) {
    return {
      assignedUser: undefined,
      assignedUsers: undefined,
      assignedUserRaw: undefined,
      unmatchedTokens: [],
    };
  }

  const raw = cleanText(rawValue);
  const tokens = splitAssignedUserTokens(raw);
  const sourceTokens = tokens.length > 0 ? tokens : [raw];

  const matchedIds = [];
  const unmatchedTokens = [];

  sourceTokens.forEach((token) => {
    const normalized = normalizeLoose(token);
    const id = userLookup.get(normalized);

    if (id) {
      if (!matchedIds.includes(id)) matchedIds.push(id);
    } else {
      unmatchedTokens.push(token);
    }
  });

  return {
    assignedUser: matchedIds[0],
    assignedUsers: matchedIds.length > 0 ? matchedIds : undefined,
    assignedUserRaw: raw,
    unmatchedTokens,
  };
}

function createPayloadFromCsvRow(row, currentUserId, userLookup) {
  const warnings = [];

  const plateNumber = cleanText(row.registration).toUpperCase();
  const { make, model } = splitMakeModel(row.makeModel);

  if (!plateNumber || !make || !model) {
    return {
      error: "Brak wymaganych danych: rejestracja / marka / model",
      warnings,
    };
  }

  const nowIso = new Date().toISOString();

  const assignedUserInfo = resolveAssignedUsers(row.assignedUserName, userLookup);

  if (
    assignedUserInfo.assignedUserRaw &&
    !assignedUserInfo.assignedUser &&
    assignedUserInfo.unmatchedTokens.length > 0
  ) {
    warnings.push(
      `Nie dopasowano użytkownika: ${assignedUserInfo.unmatchedTokens.join(", ")}`
    );
  }

  if (
    assignedUserInfo.assignedUsers &&
    assignedUserInfo.assignedUsers.length > 1
  ) {
    warnings.push(
      `Wykryto wielu użytkowników (${assignedUserInfo.assignedUsers.length}); assignedUser ustawiono na pierwszego, pełna lista jest w assignedUsers`
    );
  }

  const gpsDecision = parseOptionalBool(row.hasGps);
  const cameraDecision = parseOptionalBool(row.hasCamera);
  const spareKeyDecision = parseOptionalBool(row.hasSpareKey);
  const virtualCardDecision = parseOptionalBool(row.hasVirtualCard);
  const spareDecision = parseOptionalBool(row.hasSpare);
  const triangleDecision = parseEquipmentBool(row.hasTriangle);
  const extinguisherDecision = parseEquipmentBool(row.hasExtinguisher);
  const firstAidDecision = parseEquipmentBool(row.hasFirstAidKit);
  const kupDecision = parseKup(row.kup);

  const batteryData = parseBatteryData(row.batteryYear);
  const oilServiceData = parseOilService(row.oilService);
  const asoData = parseAso(row.aso);

  const maintenance = pickDefined({
    inspectionDueAt: polishDateToIsoOrNull(row.inspectionDueAt) || undefined,
    insuranceDueAt: polishDateToIsoOrNull(row.insuranceDueAt) || undefined,
    currentMileage: parseMileage(row.currentMileage),
    oilService: oilServiceData,
    aso: asoData,
  });

  const equipment = pickDefined({
    hasTriangle: triangleDecision.value,
    hasExtinguisher: extinguisherDecision.value,
    hasFirstAidKit: firstAidDecision.value,
    tiresDescription: !isNoData(row.tiresDescription)
      ? cleanText(row.tiresDescription)
      : undefined,
    tiresDescription2: !isNoData(row.tiresDescription2)
      ? cleanText(row.tiresDescription2)
      : undefined,
  });

  const fleetCard = pickDefined({
    shellCardPinEncrypted: !isNoData(row.shellCardPinEncrypted)
      ? cleanText(row.shellCardPinEncrypted)
      : undefined,
  });

  const importNotes = pickDefined({
    gpsRaw:
      gpsDecision.raw && gpsDecision.value === undefined
        ? gpsDecision.raw
        : undefined,
    cameraRaw:
      cameraDecision.raw && cameraDecision.value === undefined
        ? cameraDecision.raw
        : undefined,
    spareKeyRaw:
      spareKeyDecision.raw && spareKeyDecision.value === undefined
        ? spareKeyDecision.raw
        : undefined,
    virtualCardRaw:
      virtualCardDecision.raw && virtualCardDecision.value === undefined
        ? virtualCardDecision.raw
        : undefined,
    spareRaw:
      spareDecision.raw && spareDecision.value === undefined
        ? spareDecision.raw
        : undefined,
    triangleRaw:
      triangleDecision.raw && triangleDecision.value === undefined
        ? triangleDecision.raw
        : undefined,
    extinguisherRaw:
      extinguisherDecision.raw && extinguisherDecision.value === undefined
        ? extinguisherDecision.raw
        : undefined,
    firstAidKitRaw:
      firstAidDecision.raw && firstAidDecision.value === undefined
        ? firstAidDecision.raw
        : undefined,
    kupRaw:
      kupDecision.raw && kupDecision.value === undefined
        ? kupDecision.raw
        : undefined,
    registrationDocumentStatusRaw:
      !isNoData(row.registrationDocumentStatus)
        ? cleanText(row.registrationDocumentStatus)
        : undefined,
    assignedUserUnmatched:
      assignedUserInfo.unmatchedTokens.length > 0
        ? assignedUserInfo.unmatchedTokens
        : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  });

  const payload = pickDefined({
    plateNumber,
    make,
    model,
    aso: !isNoData(row.aso) ? cleanText(row.aso) : undefined,
    assignedUser: assignedUserInfo.assignedUser,
    assignedUsers: assignedUserInfo.assignedUsers,
    assignedUserRaw: assignedUserInfo.assignedUserRaw,
    registrationDocumentStatus: !isNoData(row.registrationDocumentStatus)
      ? cleanText(row.registrationDocumentStatus)
      : undefined,
    hasGps: gpsDecision.value,
    repairNotes: !isNoData(row.repairNotes)
      ? cleanText(row.repairNotes)
      : undefined,
    hasCamera: cameraDecision.value,
    hasSpareKey: spareKeyDecision.value,
    hasVirtualCard: virtualCardDecision.value,
    cleanliness: !isNoData(row.cleanliness)
      ? cleanText(row.cleanliness)
      : undefined,
    hasSpare: spareDecision.value,
    batteryYear: batteryData.batteryYear,
    batteryLabel: batteryData.batteryLabel,
    kup: kupDecision.value,
    status: DEFAULT_STATUS,
    isArchived: false,
    faults: [],
    audit: {
      createdAt: nowIso,
      createdBy: currentUserId,
      updatedAt: nowIso,
      updatedBy: currentUserId,
    },
    sourceCsv: sanitizeSourceCsv(row),
    importNotes:
      Object.keys(importNotes).length > 0 ? importNotes : undefined,
  });

  if (Object.keys(maintenance).length > 0) {
    payload.maintenance = maintenance;
  }

  if (Object.keys(equipment).length > 0) {
    payload.equipment = equipment;
  }

  if (Object.keys(fleetCard).length > 0) {
    payload.fleetCard = fleetCard;
  }

  return { payload, warnings };
}

export default function AddNewCarFromCSV() {
  const currentUserId = useMemo(
    () => localStorage.getItem("userId") || "usr_admin_001",
    []
  );

  const [file, setFile] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const snap = await get(ref(database, "users"));

      if (!snap.exists()) {
        setUsers([]);
        return [];
      }

      const usersObj = snap.val();
      const usersArr = Object.entries(usersObj).map(([key, value]) => ({
        id: value?.id || key,
        ...value,
      }));

      setUsers(usersArr);
      return usersArr;
    } catch (err) {
      console.error("Błąd ładowania users:", err);
      setUsers([]);
      return [];
    } finally {
      setLoadingUsers(false);
    }
  }

  async function getExistingPlateNumbers() {
    const snap = await get(ref(database, "cars"));
    if (!snap.exists()) return new Set();

    const carsObj = snap.val();
    const setOfPlates = new Set();

    Object.values(carsObj).forEach((car) => {
      const plate = cleanText(car?.plateNumber).toUpperCase();
      if (plate) setOfPlates.add(plate);
    });

    return setOfPlates;
  }

  async function handleImport(e) {
    e.preventDefault();

    if (!file) {
      setResult({
        type: "error",
        text: "Najpierw wybierz plik CSV.",
        details: [],
      });
      return;
    }

    setImporting(true);
    setResult(null);

    try {
      const [loadedUsers, existingPlates] = await Promise.all([
        users.length > 0 ? Promise.resolve(users) : loadUsers(),
        getExistingPlateNumbers(),
      ]);

      const userLookup = buildUserLookup(loadedUsers);
      const text = await readCsvFile(file);
      const rows = parseSemicolonCsv(text);
      const dataRows = csvRowsToObjects(rows);

      if (dataRows.length === 0) {
        setResult({
          type: "error",
          text: "Plik CSV jest pusty albo ma nieprawidłowy format.",
          details: [],
        });
        setImporting(false);
        return;
      }

      let added = 0;
      let skipped = 0;
      let addedWithWarnings = 0;
      const details = [];
      const seenInThisImport = new Set();

      for (let index = 0; index < dataRows.length; index += 1) {
        const row = dataRows[index];
        const csvRowNo = index + 2;

        const plate = cleanText(row.registration).toUpperCase();

        if (!plate) {
          skipped += 1;
          details.push(`Wiersz ${csvRowNo}: pominięto — brak rejestracji.`);
          continue;
        }

        if (existingPlates.has(plate)) {
          skipped += 1;
          details.push(
            `Wiersz ${csvRowNo} (${plate}): pominięto — auto już istnieje w bazie.`
          );
          continue;
        }

        if (seenInThisImport.has(plate)) {
          skipped += 1;
          details.push(
            `Wiersz ${csvRowNo} (${plate}): pominięto — duplikat w tym samym pliku CSV.`
          );
          continue;
        }

        const { payload, error, warnings } = createPayloadFromCsvRow(
          row,
          currentUserId,
          userLookup
        );

        if (error) {
          skipped += 1;
          details.push(`Wiersz ${csvRowNo} (${plate}): pominięto — ${error}.`);
          continue;
        }

        const carsRef = ref(database, "cars");
        const newCarRef = push(carsRef);
        const id = newCarRef.key;

        await set(newCarRef, {
          id,
          ...payload,
        });

        existingPlates.add(plate);
        seenInThisImport.add(plate);
        added += 1;

        if (warnings?.length > 0) {
          addedWithWarnings += 1;
          details.push(
            `Wiersz ${csvRowNo} (${plate}): dodano z uwagami — ${warnings.join(
              "; "
            )}.`
          );
        }
      }

      setResult({
        type: "ok",
        text: `Import zakończony. Dodano: ${added}. Pominięto: ${skipped}. Z uwagami: ${addedWithWarnings}.`,
        details,
      });
    } catch (err) {
      console.error("Błąd importu CSV:", err);
      setResult({
        type: "error",
        text: "Wystąpił błąd podczas importu CSV. Sprawdź konsolę.",
        details: [],
      });
    } finally {
      setImporting(false);
    }
  }

  useRequireSuperAdmin();

  return (
    <div className={styles.wrapper}>
      <Navbar />

      <h2 className={styles.title}>Import samochodów z CSV</h2>

      {result && (
        <div
          className={`${styles.message} ${
            result.type === "ok" ? styles.messageOk : styles.messageError
          }`}
        >
          <div>{result.text}</div>

          {result.details?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong>Szczegóły:</strong>
              <div
                style={{
                  marginTop: 8,
                  whiteSpace: "pre-wrap",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {result.details.join("\n")}
              </div>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleImport}>
        <div className={styles.box}>
          <h3 className={styles.sectionTitle}>Plik CSV</h3>

          <div className={styles.grid2}>
            <div className={styles.fullWidth}>
              <label className={styles.label}>Wybierz plik CSV</label>
              <input
                className={styles.input}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>

            <div className={styles.fullWidth}>
              <div className={styles.helperText}>
                Obsługiwany jest format CSV z separatorem <strong>;</strong>.
                <br />
                Brakujące pola opcjonalne nie są zapisywane jako wartości końcowe,
                ale surowe dane z wiersza trafiają do <code>sourceCsv</code>.
                <br />
                Samochody z duplikatem rejestracji są pomijane.
                <br />
                Przypisany użytkownik jest mapowany po nazwie / imieniu / skrócie.
                Przy wielu użytkownikach zapisuje się też <code>assignedUsers</code>.
                {loadingUsers && (
                  <>
                    <br />
                    Ładowanie listy użytkowników...
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={importing || !file}
          className={`${styles.submitButton} ${
            importing || !file ? styles.submitButtonDisabled : ""
          }`}
        >
          {importing ? "Importuję..." : "Importuj CSV"}
        </button>
      </form>
    </div>
  );
}