import React, { useMemo, useState } from "react";
import { database, ref, set, push, get } from "../FirebaseConfig";
import styles from "./AddNewCar.module.css";
import Navbar from './Navbar';

// Pomocnicze: zamiana wartości z <input type="date"> na ISO (UTC)
function dateToIsoOrNull(dateStr) {
  if (!dateStr) return null;
  // dateStr: "YYYY-MM-DD"
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return d.toISOString();
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
        setMsg({
          type: "error",
          text: "Ta tablica rejestracyjna już istnieje.",
        });
        setSaving(false);
        return;
      }

      const nowIso = new Date().toISOString();

      const carsRef = ref(database, "cars");
      const newCarRef = push(carsRef);
      const id = newCarRef.key;

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

  return (
    <div className={styles.wrapper}>
      <Navbar/>
      <h2 className={styles.title}>Dodaj nowy samochód</h2>
      <p className={styles.subtitle}>
        Zapis do Firebase RTDB: <code>/cars</code>
      </p>

      {msg && (
        <div
          className={`${styles.message} ${
            msg.type === "ok" ? styles.messageOk : styles.messageError
          }`}
        >
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Identyfikacja */}
        <div className={styles.box}>
          <h3 className={styles.sectionTitle}>Dane identyfikacyjne</h3>

          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>
                Tablica rejestracyjna (unique) *
              </label>
              <input
                className={styles.input}
                value={form.plateNumber}
                onChange={(e) => setField("plateNumber", e.target.value)}
                placeholder="np. CT257CU"
                autoComplete="off"
              />
            </div>

            <div>
              <label className={styles.label}>Status operacyjny</label>
              <select
                className={styles.input}
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
              <label className={styles.label}>Marka *</label>
              <input
                className={styles.input}
                value={form.make}
                onChange={(e) => setField("make", e.target.value)}
                placeholder="np. PEUGEOT"
                autoComplete="off"
              />
            </div>

            <div>
              <label className={styles.label}>Model *</label>
              <input
                className={styles.input}
                value={form.model}
                onChange={(e) => setField("model", e.target.value)}
                placeholder="np. EXPERT"
                autoComplete="off"
              />
            </div>

            <div>
              <label className={styles.label}>VIN (opcjonalnie)</label>
              <input
                className={styles.input}
                value={form.vin}
                onChange={(e) => setField("vin", e.target.value)}
                placeholder="np. VF3EXPERT123456789"
                autoComplete="off"
              />
            </div>

            <div>
              <label className={styles.label}>
                Numer wewnętrzny (opcjonalnie)
              </label>
              <input
                className={styles.input}
                value={form.internalNumber}
                onChange={(e) => setField("internalNumber", e.target.value)}
                placeholder="np. F-001"
                autoComplete="off"
              />
            </div>

            <div className={styles.fullWidth}>
              <label className={styles.label}>
                Lokalizacja bazowa (opcjonalnie)
              </label>
              <input
                className={styles.input}
                value={form.baseLocation}
                onChange={(e) => setField("baseLocation", e.target.value)}
                placeholder="np. Baza Katowice"
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        {/* Terminy i utrzymanie */}
        <div className={styles.box}>
          <h3 className={styles.sectionTitle}>Terminy i utrzymanie</h3>

          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>Termin przeglądu</label>
              <input
                className={styles.input}
                type="date"
                value={form.inspectionDueAt}
                onChange={(e) => setField("inspectionDueAt", e.target.value)}
              />
            </div>

            <div>
              <label className={styles.label}>Termin ubezpieczenia</label>
              <input
                className={styles.input}
                type="date"
                value={form.insuranceDueAt}
                onChange={(e) => setField("insuranceDueAt", e.target.value)}
              />
            </div>

            <div>
              <label className={styles.label}>
                Olej – data ostatniego serwisu
              </label>
              <input
                className={styles.input}
                type="date"
                value={form.lastOilServiceAt}
                onChange={(e) => setField("lastOilServiceAt", e.target.value)}
              />
            </div>

            <div>
              <label className={styles.label}>
                Olej – przebieg przy serwisie
              </label>
              <input
                className={styles.input}
                type="number"
                value={form.lastOilServiceMileage}
                onChange={(e) =>
                  setField("lastOilServiceMileage", e.target.value)
                }
                placeholder="np. 142300"
                min="0"
              />
            </div>

            <div>
              <label className={styles.label}>
                Aktualny przebieg (opcjonalnie)
              </label>
              <input
                className={styles.input}
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
        <div className={styles.box}>
          <h3 className={styles.sectionTitle}>Wyposażenie / stan</h3>

          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>Trójkąt</label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={form.hasTriangle}
                  onChange={(e) => setField("hasTriangle", e.target.checked)}
                />
                <span className={styles.checkboxText}>
                  {form.hasTriangle ? "TAK" : "NIE"}
                </span>
              </label>
            </div>

            <div>
              <label className={styles.label}>Gaśnica</label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={form.hasExtinguisher}
                  onChange={(e) =>
                    setField("hasExtinguisher", e.target.checked)
                  }
                />
                <span className={styles.checkboxText}>
                  {form.hasExtinguisher ? "TAK" : "NIE"}
                </span>
              </label>
            </div>

            <div>
              <label className={styles.label}>Apteczka</label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={form.hasFirstAidKit}
                  onChange={(e) => setField("hasFirstAidKit", e.target.checked)}
                />
                <span className={styles.checkboxText}>
                  {form.hasFirstAidKit ? "TAK" : "NIE"}
                </span>
              </label>
            </div>

            <div>
              <label className={styles.label}>Opony/koła (opis)</label>
              <input
                className={styles.input}
                value={form.tiresDescription}
                onChange={(e) => setField("tiresDescription", e.target.value)}
                placeholder={'np. zimowe 16" stalowe'}
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        {/* Fleet card */}
        <div className={styles.box}>
          <h3 className={styles.sectionTitle}>Pin do karty flotowej</h3>

          <div className={styles.grid2}>
            <div className={styles.fullWidth}>
              <input
                className={styles.input}
                value={form.shellCardPinEncrypted}
                onChange={(e) =>
                  setField("shellCardPinEncrypted", e.target.value)
                }
                placeholder="np. 1234"
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className={`${styles.submitButton} ${
            saving ? styles.submitButtonDisabled : ""
          }`}
        >
          {saving ? "Zapisuję..." : "Dodaj samochód"}
        </button>
      </form>
    </div>
  );
}