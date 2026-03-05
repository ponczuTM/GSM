import React, { useMemo, useState } from "react";
import { database, ref, set, push, get } from "../FirebaseConfig";

// Pomocnicze: zamiana wartości z <input type="date"> na ISO (UTC)
function dateToIsoOrNull(dateStr) {
  if (!dateStr) return null;
  // dateStr: "YYYY-MM-DD"
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return d.toISOString();
}

// Pomocnicze: value do <input type="date"> z ISO
function isoToDateInputValue(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

const STATUS_OPTIONS = ["AVAILABLE", "IN_SERVICE", "DAMAGED", "UNFIT"];

export default function AddNewCar() {
  const currentUserId = useMemo(
    () => localStorage.getItem("userId") || "usr_admin_001",
    []
  );

  const [form, setForm] = useState({
    plateNumber: "",
    make: "",
    model: "",

    vin: "",
    internalNumber: "",
    baseLocation: "",

    inspectionDueAt: "",
    insuranceDueAt: "",
    lastOilServiceAt: "",
    lastOilServiceMileage: "",
    currentMileage: "",

    hasTriangle: true,
    hasExtinguisher: true,
    hasFirstAidKit: true,
    tiresDescription: "",

    // U Ciebie jest "shellCardPinEncrypted".
    // Tu zapisuję jako string. W realu: szyfrowanie/sekret po stronie backendu/KMS.
    shellCardPinEncrypted: "",

    status: "AVAILABLE",
    isArchived: false,
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function plateIsUnique(plateNumber) {
    const snap = await get(ref(database, "cars"));
    if (!snap.exists()) return true;
    const carsObj = snap.val();
    const cars = Object.values(carsObj);
    return !cars.some(
      (c) => (c?.plateNumber || "").toUpperCase() === plateNumber.toUpperCase()
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    const plate = form.plateNumber.trim();
    const make = form.make.trim();
    const model = form.model.trim();

    if (!plate || !make || !model) {
      setMsg({ type: "error", text: "Uzupełnij: tablica, marka, model." });
      return;
    }

    setSaving(true);
    try {
      const unique = await plateIsUnique(plate);
      if (!unique) {
        setMsg({ type: "error", text: "Ta tablica rejestracyjna już istnieje." });
        setSaving(false);
        return;
      }

      const nowIso = new Date().toISOString();

      const carsRef = ref(database, "cars");
      const newCarRef = push(carsRef);
      const id = newCarRef.key; // unikalny id z Firebase

      const payload = {
        id,
        plateNumber: plate.toUpperCase(),
        make: make.toUpperCase(),
        model: model.toUpperCase(),

        vin: form.vin.trim() || null,
        internalNumber: form.internalNumber.trim() || null,
        baseLocation: form.baseLocation.trim() || null,

        maintenance: {
          inspectionDueAt: dateToIsoOrNull(form.inspectionDueAt),
          insuranceDueAt: dateToIsoOrNull(form.insuranceDueAt),
          lastOilServiceAt: dateToIsoOrNull(form.lastOilServiceAt),
          lastOilServiceMileage:
            form.lastOilServiceMileage === ""
              ? null
              : Number(form.lastOilServiceMileage),
          currentMileage:
            form.currentMileage === "" ? null : Number(form.currentMileage),
        },

        equipment: {
          hasTriangle: !!form.hasTriangle,
          hasExtinguisher: !!form.hasExtinguisher,
          hasFirstAidKit: !!form.hasFirstAidKit,
          tiresDescription: form.tiresDescription.trim() || null,
        },

        fleetCard: {
          shellCardPinEncrypted: form.shellCardPinEncrypted.trim() || null,
        },

        status: form.status,
        isArchived: !!form.isArchived,

        faults: [],

        audit: {
          createdAt: nowIso,
          createdBy: currentUserId,
          updatedAt: nowIso,
          updatedBy: currentUserId,
        },
      };

      await set(newCarRef, payload);

      setMsg({ type: "ok", text: `Dodano auto: ${payload.plateNumber}` });

      // reset formularza (zostawiam domyślne checki)
      setForm((prev) => ({
        ...prev,
        plateNumber: "",
        make: "",
        model: "",
        vin: "",
        internalNumber: "",
        baseLocation: "",
        inspectionDueAt: "",
        insuranceDueAt: "",
        lastOilServiceAt: "",
        lastOilServiceMileage: "",
        currentMileage: "",
        tiresDescription: "",
        shellCardPinEncrypted: "",
        status: "AVAILABLE",
        isArchived: false,
      }));
    } catch (err) {
      console.error(err);
      setMsg({
        type: "error",
        text: "Błąd zapisu do bazy (sprawdź konsolę).",
      });
    } finally {
      setSaving(false);
    }
  }

  const boxStyle = {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
    background: "#fff",
  };

  const grid2 = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  };

  const labelStyle = { display: "block", fontSize: 12, opacity: 0.8, marginBottom: 6 };
  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #ccc",
    outline: "none",
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 18 }}>
      <h2 style={{ marginBottom: 10 }}>Dodaj nowy samochód</h2>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Zapis do Firebase RTDB: <code>/cars</code>
      </p>

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

      <form onSubmit={handleSubmit}>
        {/* Identyfikacja */}
        <div style={boxStyle}>
          <h3 style={{ marginTop: 0 }}>Dane identyfikacyjne</h3>
          <div style={grid2}>
            <div>
              <label style={labelStyle}>Tablica rejestracyjna (unique) *</label>
              <input
                style={inputStyle}
                value={form.plateNumber}
                onChange={(e) => setField("plateNumber", e.target.value)}
                placeholder="np. CT257CU"
                autoComplete="off"
              />
            </div>
            <div>
              <label style={labelStyle}>Status operacyjny</label>
              <select
                style={inputStyle}
                value={form.status}
                onChange={(e) => setField("status", e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Marka *</label>
              <input
                style={inputStyle}
                value={form.make}
                onChange={(e) => setField("make", e.target.value)}
                placeholder="np. PEUGEOT"
                autoComplete="off"
              />
            </div>
            <div>
              <label style={labelStyle}>Model *</label>
              <input
                style={inputStyle}
                value={form.model}
                onChange={(e) => setField("model", e.target.value)}
                placeholder="np. EXPERT"
                autoComplete="off"
              />
            </div>

            <div>
              <label style={labelStyle}>VIN (opcjonalnie)</label>
              <input
                style={inputStyle}
                value={form.vin}
                onChange={(e) => setField("vin", e.target.value)}
                placeholder="np. VF3EXPERT123456789"
                autoComplete="off"
              />
            </div>
            <div>
              <label style={labelStyle}>Numer wewnętrzny (opcjonalnie)</label>
              <input
                style={inputStyle}
                value={form.internalNumber}
                onChange={(e) => setField("internalNumber", e.target.value)}
                placeholder="np. F-001"
                autoComplete="off"
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Lokalizacja bazowa (opcjonalnie)</label>
              <input
                style={inputStyle}
                value={form.baseLocation}
                onChange={(e) => setField("baseLocation", e.target.value)}
                placeholder="np. Baza Katowice"
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        {/* Terminy i utrzymanie */}
        <div style={boxStyle}>
          <h3 style={{ marginTop: 0 }}>Terminy i utrzymanie</h3>
          <div style={grid2}>
            <div>
              <label style={labelStyle}>Termin przeglądu</label>
              <input
                style={inputStyle}
                type="date"
                value={form.inspectionDueAt}
                onChange={(e) => setField("inspectionDueAt", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Termin ubezpieczenia</label>
              <input
                style={inputStyle}
                type="date"
                value={form.insuranceDueAt}
                onChange={(e) => setField("insuranceDueAt", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Olej – data ostatniego serwisu</label>
              <input
                style={inputStyle}
                type="date"
                value={form.lastOilServiceAt}
                onChange={(e) => setField("lastOilServiceAt", e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Olej – przebieg przy serwisie</label>
              <input
                style={inputStyle}
                type="number"
                value={form.lastOilServiceMileage}
                onChange={(e) => setField("lastOilServiceMileage", e.target.value)}
                placeholder="np. 142300"
                min="0"
              />
            </div>
            <div>
              <label style={labelStyle}>Aktualny przebieg (opcjonalnie)</label>
              <input
                style={inputStyle}
                type="number"
                value={form.currentMileage}
                onChange={(e) => setField("currentMileage", e.target.value)}
                placeholder="np. 150120"
                min="0"
              />
            </div>
          </div>
        </div>

        {/* Wyposażenie */}
        <div style={boxStyle}>
          <h3 style={{ marginTop: 0 }}>Wyposażenie / stan</h3>
          <div style={grid2}>
            <div>
              <label style={labelStyle}>Trójkąt</label>
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.hasTriangle}
                  onChange={(e) => setField("hasTriangle", e.target.checked)}
                />
                <span style={{ opacity: 0.9 }}>
                  {form.hasTriangle ? "TAK" : "NIE"}
                </span>
              </label>
            </div>

            <div>
              <label style={labelStyle}>Gaśnica</label>
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.hasExtinguisher}
                  onChange={(e) => setField("hasExtinguisher", e.target.checked)}
                />
                <span style={{ opacity: 0.9 }}>
                  {form.hasExtinguisher ? "TAK" : "NIE"}
                </span>
              </label>
            </div>

            <div>
              <label style={labelStyle}>Apteczka</label>
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.hasFirstAidKit}
                  onChange={(e) => setField("hasFirstAidKit", e.target.checked)}
                />
                <span style={{ opacity: 0.9 }}>
                  {form.hasFirstAidKit ? "TAK" : "NIE"}
                </span>
              </label>
            </div>

            <div>
              <label style={labelStyle}>Opony/koła (opis)</label>
              <input
                style={inputStyle}
                value={form.tiresDescription}
                onChange={(e) => setField("tiresDescription", e.target.value)}
                placeholder='np. zimowe 16" stalowe'
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        {/* Fleet card */}
        <div style={boxStyle}>
          <h3 style={{ marginTop: 0 }}>Pin do karty flotowej</h3>
          <div style={grid2}>
            <div style={{ gridColumn: "1 / -1" }}>
              <input
                style={inputStyle}
                value={form.shellCardPinEncrypted}
                onChange={(e) => setField("shellCardPinEncrypted", e.target.value)}
                placeholder="np. 1234"
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            border: "1px solid #111",
            background: saving ? "#eee" : "#111",
            color: saving ? "#111" : "#fff",
            cursor: saving ? "not-allowed" : "pointer",
            width: "100%",
            fontWeight: 700,
          }}
        >
          {saving ? "Zapisuję..." : "Dodaj samochód"}
        </button>
      </form>
    </div>
  );
}