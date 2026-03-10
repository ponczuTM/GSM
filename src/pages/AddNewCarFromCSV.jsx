import React, { useMemo, useState } from "react";
import { database, ref, get, push, set } from "../FirebaseConfig";
import styles from "./AddNewCar.module.css";
import Navbar from "./Navbar";

const DEFAULT_STATUS = "AVAILABLE";

/**
 * Zamiana "YYYY-MM-DD" na ISO UTC.
 */
function dateToIsoOrNull(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Zamiana "DD.MM.YYYY" na ISO UTC.
 */
function polishDateToIsoOrNull(value) {
  if (!value) return null;

  const raw = String(value).trim();
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (!match) return null;

  const [, dd, mm, yyyy] = match;
  return dateToIsoOrNull(`${yyyy}-${mm}-${dd}`);
}

/**
 * Czyści tekst:
 * - trim
 * - zamienia wielokrotne spacje na jedną
 */
function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim();
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
    v === "N/A"
  );
}

/**
 * Normalizacja pod porównania nagłówków / nazw użytkowników.
 * Usuwa polskie znaki, śmieci z kodowania, spacje specjalne itd.
 */
function normalizeLoose(value) {
  return cleanText(value)
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
 * Próba odczytu CSV:
 * - najpierw windows-1250
 * - potem utf-8
 * Biorę wersję, która daje sensowniejsze polskie nagłówki.
 */
async function readCsvFile(file) {
  const buffer = await file.arrayBuffer();

  const dec1250 = new TextDecoder("windows-1250").decode(buffer);
  const decUtf8 = new TextDecoder("utf-8").decode(buffer);

  const score = (txt) => {
    const sample = txt.slice(0, 500).toLowerCase();
    let points = 0;

    if (sample.includes("rejestracja")) points += 2;
    if (sample.includes("ubezpieczenie")) points += 2;
    if (sample.includes("użytkownik")) points += 2;
    if (sample.includes("dowód")) points += 2;
    if (sample.includes("trójkąt")) points += 2;
    if (sample.includes("gaśnica")) points += 2;

    if (sample.includes("u?ytkownik")) points -= 2;
    if (sample.includes("dow�d")) points -= 2;
    if (sample.includes("tr�jk")) points -= 2;
    if (sample.includes("ga?nica")) points -= 2;

    return points;
  };

  return score(dec1250) >= score(decUtf8) ? dec1250 : decUtf8;
}

/**
 * Mapowanie nagłówków CSV na klucze wewnętrzne.
 * Obsługuje też rozwalone kodowanie.
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
    przypisanyuytkownik: "assignedUserName",
    dowodrejestracyjny: "registrationDocumentStatus",
    dowdrejestracyjny: "registrationDocumentStatus",
    gps: "hasGps",
    serwisolejowyna03102025r: "oilService",
    serwisolejowynao3102025r: "oilService",
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

function parseBooleanLike(value) {
  if (isNoData(value)) return undefined;

  const v = cleanText(value).toUpperCase();

  if (["TAK", "T", "TRUE", "1", "X", "MAM", "JEST"].includes(v)) return true;
  if (["NIE", "N", "FALSE", "0", "BRAK"].includes(v)) return false;

  return undefined;
}

/**
 * Dla pól takich jak GPS/KAMERA w Twoim CSV:
 * - "?" / "N/D" / puste => nie zapisujemy
 * - "X" / "TAK" => true
 * - "NIE" => false
 */
function parseOptionalBool(value) {
  return parseBooleanLike(value);
}

/**
 * Dla wyposażenia obowiązkowego w formularzu admina:
 * jeśli nie ma sensownej wartości w CSV, nie zapisujemy nic.
 */
function parseEquipmentBool(value) {
  return parseBooleanLike(value);
}

function parseKup(value) {
  return parseBooleanLike(value);
}

function parseNumberOrUndefined(value) {
  if (isNoData(value)) return undefined;

  const normalized = cleanText(value).replace(",", ".");
  const num = Number(normalized);

  return Number.isFinite(num) ? num : undefined;
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

function pickDefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
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
        const initials = `${parts[0][0] || ""}${parts[1][0] || ""}`;
        if (initials) {
          map.set(normalizeLoose(initials), user.id);
        }
      }
    }
  });

  return map;
}

function resolveAssignedUserId(rawValue, userLookup) {
  if (isNoData(rawValue)) return undefined;

  const normalized = normalizeLoose(rawValue);
  return userLookup.get(normalized);
}

function createPayloadFromCsvRow(row, currentUserId, userLookup) {
  const plateNumber = cleanText(row.registration).toUpperCase();
  const { make, model } = splitMakeModel(row.makeModel);

  if (!plateNumber || !make || !model) {
    return {
      error: "Brak wymaganych danych: rejestracja / marka / model",
    };
  }

  const nowIso = new Date().toISOString();

  const assignedUserId = resolveAssignedUserId(row.assignedUserName, userLookup);

  const maintenance = pickDefined({
    inspectionDueAt: polishDateToIsoOrNull(row.inspectionDueAt) || undefined,
    insuranceDueAt: polishDateToIsoOrNull(row.insuranceDueAt) || undefined,
    currentMileage: parseNumberOrUndefined(row.currentMileage),
  });

  const equipment = pickDefined({
    hasTriangle: parseEquipmentBool(row.hasTriangle),
    hasExtinguisher: parseEquipmentBool(row.hasExtinguisher),
    hasFirstAidKit: parseEquipmentBool(row.hasFirstAidKit),
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

  const payload = pickDefined({
    plateNumber,
    make,
    model,
    aso: !isNoData(row.aso) ? cleanText(row.aso) : undefined,
    assignedUser: assignedUserId,
    registrationDocumentStatus: !isNoData(row.registrationDocumentStatus)
      ? cleanText(row.registrationDocumentStatus)
      : undefined,
    hasGps: parseOptionalBool(row.hasGps),
    repairNotes: !isNoData(row.repairNotes)
      ? cleanText(row.repairNotes)
      : undefined,
    hasCamera: parseOptionalBool(row.hasCamera),
    hasSpareKey: parseOptionalBool(row.hasSpareKey),
    hasVirtualCard: parseOptionalBool(row.hasVirtualCard),
    cleanliness: !isNoData(row.cleanliness)
      ? cleanText(row.cleanliness)
      : undefined,
    hasSpare: parseOptionalBool(row.hasSpare),
    batteryYear: parseNumberOrUndefined(row.batteryYear),
    kup: parseKup(row.kup),
    status: DEFAULT_STATUS,
    isArchived: false,
    faults: [],
    audit: {
      createdAt: nowIso,
      createdBy: currentUserId,
      updatedAt: nowIso,
      updatedBy: currentUserId,
    },
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

  return { payload };
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
      const details = [];
      const seenInThisImport = new Set();

      for (let index = 0; index < dataRows.length; index += 1) {
        const row = dataRows[index];
        const csvRowNo = index + 2; // +1 nagłówek, +1 numerowanie ludzkie

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

        const { payload, error } = createPayloadFromCsvRow(
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
      }

      setResult({
        type: "ok",
        text: `Import zakończony. Dodano: ${added}. Pominięto: ${skipped}.`,
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
                Obsługiwany jest dokładnie format CSV z separatorem <strong>;</strong>.
                <br />
                Brakujące pola opcjonalne nie są zapisywane.
                <br />
                Samochody z duplikatem rejestracji są pomijane.
                <br />
                Przypisany użytkownik jest mapowany po nazwie / imieniu / skrócie,
                jeśli da się go dopasować do wpisu w <code>/users</code>.
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