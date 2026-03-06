import React, { useEffect, useMemo, useState } from "react";
import { database, ref, onValue } from "../FirebaseConfig";
import styles from "./ShowAllCars.module.css";
import Navbar from './Navbar';

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

  return (
    <div className={styles.wrapper}>
      <Navbar/>
      <h2 className={styles.title}>Wszystkie samochody (testowo z RTDB)</h2>

      {loading ? (
        <div className={styles.infoBox}>Ładuję dane...</div>
      ) : cars.length === 0 ? (
        <div className={styles.infoBox}>Brak samochodów w bazie.</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.tableHeadRow}>
                <th className={styles.th}>Tablica</th>
                <th className={styles.th}>Marka / Model</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Baza</th>
                <th className={styles.th}>Przegląd</th>
                <th className={styles.th}>Ubezpieczenie</th>
                <th className={styles.th}>Olej (data)</th>
                <th className={styles.th}>Olej (km)</th>
                <th className={styles.th}>Akt. km</th>
                <th className={styles.th}>Wyposażenie</th>
                <th className={styles.th}>Opony</th>
                <th className={styles.th}>Usterki</th>
                <th className={styles.th}>Archiw.</th>
                <th className={styles.th}>Audit</th>
                <th className={styles.th}>Fleet Card PIN</th>
              </tr>
            </thead>

            <tbody>
              {cars.map((c) => {
                const m = c?.maintenance || {};
                const e = c?.equipment || {};
                const faults = Array.isArray(c?.faults) ? c.faults : [];
                const openFaults = faults.filter(
                  (f) => (f?.status || "").toUpperCase() === "OPEN"
                );

                const fleetPin = c?.fleetCard?.shellCardPinEncrypted || null;

                return (
                  <tr
                    key={c.id}
                    className={c.isArchived ? styles.archivedRow : styles.activeRow}
                  >
                    <td className={styles.tdStrong}>{safe(c.plateNumber)}</td>

                    <td className={styles.td}>
                      {safe(c.make)} / {safe(c.model)}
                      <div className={styles.metaText}>
                        VIN: {safe(c.vin)} {" · "} Wewn.: {safe(c.internalNumber)}
                      </div>
                    </td>

                    <td className={styles.td}>{safe(c.status)}</td>
                    <td className={styles.td}>{safe(c.baseLocation)}</td>
                    <td className={styles.td}>{fmtDate(m.inspectionDueAt)}</td>
                    <td className={styles.td}>{fmtDate(m.insuranceDueAt)}</td>
                    <td className={styles.td}>{fmtDate(m.lastOilServiceAt)}</td>
                    <td className={styles.td}>{safe(m.lastOilServiceMileage)}</td>
                    <td className={styles.td}>{safe(m.currentMileage)}</td>

                    <td className={styles.td}>
                      Trójkąt: {yesNo(e.hasTriangle)}
                      <br />
                      Gaśnica: {yesNo(e.hasExtinguisher)}
                      <br />
                      Apteczka: {yesNo(e.hasFirstAidKit)}
                    </td>

                    <td className={styles.td}>{safe(e.tiresDescription)}</td>

                    <td className={styles.td}>
                      Wszystkie: {faults.length}
                      <br />
                      Otwarte: {openFaults.length}
                    </td>

                    <td className={styles.td}>{c.isArchived ? "TAK" : "NIE"}</td>

                    <td className={styles.td}>
                      <div className={styles.auditText}>
                        createdAt: {safe(c?.audit?.createdAt)}
                        <br />
                        createdBy: {safe(c?.audit?.createdBy)}
                        <br />
                        updatedAt: {safe(c?.audit?.updatedAt)}
                        <br />
                        updatedBy: {safe(c?.audit?.updatedBy)}
                      </div>
                    </td>

                    <td className={styles.td}>
                      {isAdmin ? (
                        <code className={styles.pinCode}>
                          {fleetPin ? fleetPin : "—"}
                        </code>
                      ) : (
                        <span className={styles.hiddenText}>ukryte</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}