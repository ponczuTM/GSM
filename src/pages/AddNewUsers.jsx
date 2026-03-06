import React, { useMemo, useState } from "react";
import { database, ref, set, push, get } from "../FirebaseConfig";
import md5 from "blueimp-md5";
import styles from "./AddNewUsers.module.css";
import Navbar from './Navbar';


function randomSalt(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `slt_${out}`;
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function isValidPin(pin) {
  // PIN: tylko cyfry, 4-8 znaków
  return /^[0-9]{4,8}$/.test(pin);
}

export default function AddNewUsers() {
  // w praktyce weźmiesz z kontekstu auth/admina; tu fallback
  const currentUserId = useMemo(
    () => localStorage.getItem("userId") || "usr_admin_001",
    []
  );

  const [form, setForm] = useState({
    name: "",
    pin: "",
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function nameIsUnique(name) {
    // Nie jest wymagane, ale przydatne: nie dodajesz 2x "Jan Kowalski"
    const snap = await get(ref(database, "users"));
    if (!snap.exists()) return true;

    const usersObj = snap.val();
    const users = Object.values(usersObj);
    const target = name.toLowerCase();

    return !users.some((u) => (u?.name || "").toLowerCase() === target);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    const name = normalizeName(form.name);
    const pin = form.pin.trim();

    if (!name) {
      setMsg({ type: "error", text: "Podaj imię i nazwisko." });
      return;
    }

    if (!isValidPin(pin)) {
      setMsg({ type: "error", text: "PIN ma mieć 4 cyfry" });
      return;
    }

    setSaving(true);

    try {
      const unique = await nameIsUnique(name);
      if (!unique) {
        setMsg({
          type: "error",
          text: "Taki użytkownik już istnieje (po nazwie).",
        });
        setSaving(false);
        return;
      }

      const nowIso = new Date().toISOString();
      const salt = randomSalt(10);
      const hashMd5 = md5(`${salt}${pin}`);

      const usersRef = ref(database, "users");
      const newUserRef = push(usersRef);
      const id = newUserRef.key; // RTDB key

      const payload = {
        id,
        name,
        role: "USER",
        isActive: true,
        pin: {
          hashMd5,
          salt,
        },
        audit: {
          createdAt: nowIso,
          createdBy: currentUserId,
          updatedAt: nowIso,
          updatedBy: currentUserId,
        },
      };

      await set(newUserRef, payload);

      setMsg({ type: "ok", text: `Dodano użytkownika: ${name}` });
      setForm({ name: "", pin: "" });
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
      <h2 className={styles.title}>Dodaj nowego użytkownika</h2>
      {msg && (
        <div
          className={`${styles.alert} ${
            msg.type === "ok" ? styles.alertSuccess : styles.alertError
          }`}
        >
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.box}>
          <h3 className={styles.sectionTitle}>Dane użytkownika</h3>

          <div className={styles.field}>
            <label className={styles.label}>Imię i nazwisko *</label>
            <input
              className={styles.input}
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="np. Jan Kowalski"
              autoComplete="off"
            />
          </div>

          <div className={styles.fieldSmallMargin}>
            <label className={styles.label}>PIN (4 cyfry) *</label>
            <input
              className={styles.input}
              value={form.pin}
              onChange={(e) => setField("pin", e.target.value)}
              placeholder="np. 1234"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className={`${styles.submitButton} ${
            saving ? styles.submitButtonDisabled : ""
          }`}
        >
          {saving ? "Zapisuję..." : "Dodaj użytkownika"}
        </button>
      </form>
    </div>
  );
}