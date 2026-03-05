import React, { useEffect, useMemo, useState } from "react";
import { database, ref, onValue } from "../FirebaseConfig";

function safe(v, fallback = "—") {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pl-PL");
  } catch {
    return "—";
  }
}

function yesNo(v) {
  return v ? "TAK" : "NIE";
}

export default function ShowAllCars() {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentUserRole = useMemo(
    () => localStorage.getItem("role") || "ADMIN",
    []
  );
  const isAdmin = currentUserRole === "ADMIN";

  useEffect(() => {
    const carsRef = ref(database, "cars");

    const unsub = onValue(
      carsRef,
      (snap) => {
        const val = snap.val();
        if (!val) {
          setCars([]);
          setLoading(false);
          return;
        }
        const arr = Object.values(val);
        // sort: najpierw nie-archiwalne, potem po tablicy
        arr.sort((a, b) => {
          const aArch = !!a?.isArchived;
          const bArch = !!b?.isArchived;
          if (aArch !== bArch) return aArch ? 1 : -1;
          return (a?.plateNumber || "").localeCompare(b?.plateNumber || "");
        });
        setCars(arr);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setCars([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const wrapper = { maxWidth: 1200, margin: "0 auto", padding: 18 };

  return (
    <div style={wrapper}>
      <h2 style={{ marginBottom: 10 }}>Wszystkie samochody (testowo z RTDB)</h2>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Odczyt z <code>/cars</code>. Rekordy: {cars.length}
      </p>

      {loading ? (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          Ładuję dane...
        </div>
      ) : cars.length === 0 ? (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          Brak samochodów w bazie.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={th}>Tablica</th>
                <th style={th}>Marka / Model</th>
                <th style={th}>Status</th>
                <th style={th}>Baza</th>
                <th style={th}>Przegląd</th>
                <th style={th}>Ubezpieczenie</th>
                <th style={th}>Olej (data)</th>
                <th style={th}>Olej (km)</th>
                <th style={th}>Akt. km</th>
                <th style={th}>Wyposażenie</th>
                <th style={th}>Opony</th>
                <th style={th}>Usterki</th>
                <th style={th}>Archiw.</th>
                <th style={th}>Audit</th>
                <th style={th}>Fleet Card PIN</th>
              </tr>
            </thead>
            <tbody>
              {cars.map((c) => {
                const m = c?.maintenance || {};
                const e = c?.equipment || {};
                const faults = Array.isArray(c?.faults) ? c.faults : [];
                const openFaults = faults.filter((f) => (f?.status || "").toUpperCase() === "OPEN");

                // Wrażliwe: pokazuję tylko adminowi, i tak najlepiej trzymać to po stronie reguł Firebase.
                const fleetPin = c?.fleetCard?.shellCardPinEncrypted || null;

                return (
                  <tr key={c.id} style={{ background: c.isArchived ? "#fcfcfc" : "#fff" }}>
                    <td style={tdStrong}>{safe(c.plateNumber)}</td>
                    <td style={td}>
                      {safe(c.make)} / {safe(c.model)}
                      <div style={{ opacity: 0.7, fontSize: 12 }}>
                        VIN: {safe(c.vin)}
                        {" · "}
                        Wewn.: {safe(c.internalNumber)}
                      </div>
                    </td>
                    <td style={td}>{safe(c.status)}</td>
                    <td style={td}>{safe(c.baseLocation)}</td>
                    <td style={td}>{fmtDate(m.inspectionDueAt)}</td>
                    <td style={td}>{fmtDate(m.insuranceDueAt)}</td>
                    <td style={td}>{fmtDate(m.lastOilServiceAt)}</td>
                    <td style={td}>{safe(m.lastOilServiceMileage)}</td>
                    <td style={td}>{safe(m.currentMileage)}</td>
                    <td style={td}>
                      Trójkąt: {yesNo(e.hasTriangle)}
                      <br />
                      Gaśnica: {yesNo(e.hasExtinguisher)}
                      <br />
                      Apteczka: {yesNo(e.hasFirstAidKit)}
                    </td>
                    <td style={td}>{safe(e.tiresDescription)}</td>
                    <td style={td}>
                      Wszystkie: {faults.length}
                      <br />
                      Otwarte: {openFaults.length}
                    </td>
                    <td style={td}>{c.isArchived ? "TAK" : "NIE"}</td>
                    <td style={td}>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>
                        createdAt: {safe(c?.audit?.createdAt)}
                        <br />
                        createdBy: {safe(c?.audit?.createdBy)}
                        <br />
                        updatedAt: {safe(c?.audit?.updatedAt)}
                        <br />
                        updatedBy: {safe(c?.audit?.updatedBy)}
                      </div>
                    </td>
                    <td style={td}>
                      {isAdmin ? (
                        <code style={{ fontSize: 12 }}>
                          {fleetPin ? fleetPin : "—"}
                        </code>
                      ) : (
                        <span style={{ opacity: 0.6 }}>ukryte</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, opacity: 0.75, fontSize: 12 }}>
        Uwaga: “Fleet Card PIN” powinien być chroniony regułami Firebase (admin-only).
      </div>
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #eee",
  whiteSpace: "nowrap",
};

const td = {
  padding: "10px 10px",
  borderBottom: "1px solid #f0f0f0",
  verticalAlign: "top",
};

const tdStrong = {
  ...td,
  fontWeight: 800,
  whiteSpace: "nowrap",
};