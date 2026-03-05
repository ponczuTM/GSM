import React, { useMemo, useState } from "react";
import { database, ref, set, push, get } from "../FirebaseConfig";
import md5 from "blueimp-md5";

function randomSalt(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `slt_${out}`;
}

function normalizeName(name) {
  return name
    .trim()
    .replace(/\s+/g, " ");
}

function isValidPin(pin) {
  // PIN: tylko cyfry, 4-8 znaków (zmień jak chcesz)
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
      setMsg({ type: "error", text: "PIN ma mieć 4–8 cyfr (tylko cyfry)." });
      return;
    }

    setSaving(true);
    try {
      const unique = await nameIsUnique(name);
      if (!unique) {
        setMsg({ type: "error", text: "Taki użytkownik już istnieje (po nazwie)." });
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
      setMsg({ type: "error", text: "Błąd zapisu do bazy (sprawdź konsolę)." });
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

  const labelStyle = { display: "block", fontSize: 12, opacity: 0.8, marginBottom: 6 };
  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #ccc",
    outline: "none",
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 18 }}>
      <h2 style={{ marginBottom: 10 }}>Dodaj nowego użytkownika</h2>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Admin dodaje usera: <code>name</code> + <code>pin</code>. Zapis do{" "}
        <code>/users</code>.
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
        <div style={boxStyle}>
          <h3 style={{ marginTop: 0 }}>Dane użytkownika</h3>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Imię i nazwisko *</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="np. Jan Kowalski"
              autoComplete="off"
            />
          </div>

          <div style={{ marginBottom: 4 }}>
            <label style={labelStyle}>PIN (4–8 cyfr) *</label>
            <input
              style={inputStyle}
              value={form.pin}
              onChange={(e) => setField("pin", e.target.value)}
              placeholder="np. 1234"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>

          <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
            Zapis: <code>pin.hashMd5 = md5(salt + pin)</code>, <code>pin.salt</code> trzymamy jawnie.
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
          {saving ? "Zapisuję..." : "Dodaj użytkownika"}
        </button>
      </form>

      <div style={{ marginTop: 14, opacity: 0.75, fontSize: 12 }}>
        Tip: jak chcesz “dezaktywuj”, robisz <code>update(ref(database, "users/&lt;userId&gt;"), &#123; isActive: false &#125;)</code>.
      </div>
    </div>
  );
}