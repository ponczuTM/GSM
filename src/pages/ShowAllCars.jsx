import React, { useEffect, useMemo, useState } from "react";
import { database, ref, onValue } from "../FirebaseConfig";
import styles from "./ShowAllCars.module.css";
import Navbar from "./Navbar";
import useRequireSuperAdmin from "./useRequireSuperAdmin";

// --- Funkcje pomocnicze ---
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

function userLabel(user) {
  if (!user) return "—";
  return (
    user.displayName ||
    user.fullName ||
    user.name ||
    user.email ||
    user.id ||
    "—"
  );
}

export default function ShowAllCars() {
  const [cars, setCars] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [loadingCars, setLoadingCars] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Filtrowanie po wybranych ID
  const [selectedIds, setSelectedIds] = useState([]);

  // --- NOWE: Stan sterowania sortowaniem ---
  const [sortBy, setSortBy] = useState(null); // 'inspectionDueAt' | 'insuranceDueAt' | null
  const [sortDir, setSortDir] = useState("asc"); // 'asc' | 'desc'

  const currentUserRole = useMemo(
    () => localStorage.getItem("role") || "ADMIN",
    []
  );
  const isAdmin = currentUserRole === "ADMIN";

  // Pobieranie samochodów
  useEffect(() => {
    const carsRef = ref(database, "cars");
    const unsubCars = onValue(
      carsRef,
      (snap) => {
        const val = snap.val();
        if (!val) {
          setCars([]);
          setLoadingCars(false);
          return;
        }
        setCars(Object.values(val));
        setLoadingCars(false);
      },
      (err) => {
        console.error(err);
        setCars([]);
        setLoadingCars(false);
      }
    );
    return () => unsubCars();
  }, []);

  // Pobieranie użytkowników
  useEffect(() => {
    const usersRef = ref(database, "users");
    const unsubUsers = onValue(
      usersRef,
      (snap) => {
        const val = snap.val();
        if (!val) {
          setUsersMap({});
          setLoadingUsers(false);
          return;
        }
        const map = {};
        Object.entries(val).forEach(([key, value]) => {
          const id = value?.id || key;
          map[id] = { id, ...value };
        });
        setUsersMap(map);
        setLoadingUsers(false);
      },
      (err) => {
        console.error(err);
        setUsersMap({});
        setLoadingUsers(false);
      }
    );
    return () => unsubUsers();
  }, []);

  const toggleCarSelection = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // --- Logika Filtrowania i Sortowania ---
  const processedCars = useMemo(() => {
    let result = [...cars];

    // 1. Filtrowanie po ID
    if (selectedIds.length > 0) {
      result = result.filter((c) => selectedIds.includes(c.id));
    }

    // 2. Sortowanie
    if (sortBy) {
      // Sortowanie dedykowane (Przegląd/Ubezpieczenie)
      result.sort((a, b) => {
        const valA = a.maintenance?.[sortBy] || "";
        const valB = b.maintenance?.[sortBy] || "";

        if (valA === valB) return 0;
        if (valA === "") return 1;
        if (valB === "") return -1;

        if (sortDir === "asc") {
          return valA < valB ? -1 : 1;
        } else {
          return valA > valB ? -1 : 1;
        }
      });
    } else {
      // Domyślne sortowanie (Archiwum na końcu, potem tablice)
      result.sort((a, b) => {
        const aArch = !!a?.isArchived;
        const bArch = !!b?.isArchived;
        if (aArch !== bArch) return aArch ? 1 : -1;
        return (a?.plateNumber || "").localeCompare(b?.plateNumber || "");
      });
    }

    return result;
  }, [cars, selectedIds, sortBy, sortDir]);

  const loading = loadingCars || loadingUsers;
  useRequireSuperAdmin();

  return (
    <div className={styles.wrapper}>
      <Navbar />
      <h2 className={styles.title}>Wszystkie samochody</h2>

      {!loading && cars.length > 0 && (
        <div className={styles.filterBar}>
          {/* SEKCJA WYBORU AUTA */}
          <div className={styles.section}>
            <p className={styles.filterTitle}>Pokaż tylko wybrane:</p>
            <div className={styles.buttonsContainer}>
              {cars.map((car) => (
                <button
                  key={car.id}
                  className={`${styles.filterBtn} ${selectedIds.includes(car.id) ? styles.btnActive : ""}`}
                  onClick={() => toggleCarSelection(car.id)}
                >
                  <span className={styles.btnMainText}>{car.make} {car.model}</span>
                  <span className={styles.btnSubText}>{car.plateNumber}</span>
                </button>
              ))}
            </div>
          </div>

          <hr className={styles.divider} />

          {/* SEKCJA SORTOWANIA */}
          <div className={styles.section}>
            <p className={styles.filterTitle}>Sortuj według daty:</p>
            <div className={styles.sortControls}>
              <div className={styles.group}>
                <button 
                  className={`${styles.sortBtn} ${sortBy === 'inspectionDueAt' ? styles.btnActive : ""}`}
                  onClick={() => setSortBy('inspectionDueAt')}
                >
                  Przegląd
                </button>
                <button 
                  className={`${styles.sortBtn} ${sortBy === 'insuranceDueAt' ? styles.btnActive : ""}`}
                  onClick={() => setSortBy('insuranceDueAt')}
                >
                  Ubezpieczenie
                </button>
                <button 
                  className={`${styles.sortBtn} ${!sortBy ? styles.btnActive : ""}`}
                  onClick={() => setSortBy(null)}
                >
                  Brak (Domyślne)
                </button>
              </div>

              {sortBy && (
                <div className={styles.group}>
                  <span className={styles.label}>Kierunek:</span>
                  <button 
                    className={`${styles.dirBtn} ${sortDir === 'asc' ? styles.dirActive : ""}`}
                    onClick={() => setSortDir('asc')}
                  >
                    Rosnąco (najbliższe daty)
                  </button>
                  <button 
                    className={`${styles.dirBtn} ${sortDir === 'desc' ? styles.dirActive : ""}`}
                    onClick={() => setSortDir('desc')}
                  >
                    Malejąco (najdalsze daty)
                  </button>
                </div>
              )}
              
              {(selectedIds.length > 0 || sortBy) && (
                <button 
                  className={styles.clearBtn} 
                  onClick={() => {
                    setSelectedIds([]);
                    setSortBy(null);
                    setSortDir("asc");
                  }}
                >
                  Wyczyść wszystko
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
                <th className={styles.th}>Marka</th>
                <th className={styles.th}>Model</th>
                <th className={styles.th}>VIN</th>
                <th className={styles.th}>Nr wewn.</th>
                <th className={styles.th}>Rok prod.</th>
                <th className={styles.th}>Poj. silnika</th>
                <th className={styles.th}>Moc (KM)</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Baza</th>
                <th className={styles.th}>ASO</th>
                <th className={styles.th}>Na wykup</th>
                <th className={styles.th}>Przypisany użytkownik</th>
                <th className={styles.th}>Status dowodu rej.</th>
                {/* Podświetlamy nagłówek jeśli sortowanie jest aktywne */}
                <th className={`${styles.th} ${sortBy === 'inspectionDueAt' ? styles.highlightedTh : ""}`}>
                  Przegląd {sortBy === 'inspectionDueAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className={`${styles.th} ${sortBy === 'insuranceDueAt' ? styles.highlightedTh : ""}`}>
                  Ubezpieczenie {sortBy === 'insuranceDueAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className={styles.th}>Olej (data)</th>
                <th className={styles.th}>Olej (km)</th>
                <th className={styles.th}>Akt. km</th>
                <th className={styles.th}>Rok akumulatora</th>
                <th className={styles.th}>Trójkąt</th>
                <th className={styles.th}>Gaśnica</th>
                <th className={styles.th}>Apteczka</th>
                <th className={styles.th}>GPS</th>
                <th className={styles.th}>Kamera</th>
                <th className={styles.th}>Dodatkowy klucz</th>
                <th className={styles.th}>Karta wirtualna</th>
                <th className={styles.th}>Koło zapasowe</th>
                <th className={styles.th}>Stan czystości</th>
                <th className={styles.th}>Opony / komplet 1</th>
                <th className={styles.th}>Opony / komplet 2</th>
                <th className={styles.th}>Naprawy / notatki</th>
                <th className={styles.th}>Usterki</th>
                <th className={styles.th}>Archiw.</th>
                <th className={styles.th}>Fleet Card PIN</th>
              </tr>
            </thead>

            <tbody>
              {processedCars.map((c) => {
                const m = c?.maintenance || {};
                const e = c?.equipment || {};
                const faults = Array.isArray(c?.faults) ? c.faults : [];
                const openFaults = faults.filter(
                  (f) => (f?.status || "").toUpperCase() === "OPEN"
                );
                const fleetPin = c?.fleetCard?.shellCardPinEncrypted || null;
                const assignedUserObj = c?.assignedUser
                  ? usersMap[c.assignedUser]
                  : null;

                return (
                  <tr
                    key={c.id}
                    className={c.isArchived ? styles.archivedRow : styles.activeRow}
                  >
                    <td className={styles.tdStrong}>{safe(c.plateNumber)}</td>
                    <td className={styles.td}>{safe(c.make)}</td>
                    <td className={styles.td}>{safe(c.model)}</td>
                    <td className={styles.td}>{safe(c.vin)}</td>
                    <td className={styles.td}>{safe(c.internalNumber)}</td>
                    <td className={styles.td}>{safe(c.productionYear)}</td>
                    <td className={styles.td}>{safe(c.engineCapacity)}</td>
                    <td className={styles.td}>{safe(c.enginePowerKm)}</td>
                    <td className={styles.td}>{safe(c.status)}</td>
                    <td className={styles.td}>{safe(c.baseLocation)}</td>
                    <td className={styles.td}>{safe(c.aso)}</td>
                    <td className={styles.td}>{yesNo(c.kup)}</td>
                    <td className={styles.td}>
                      {c?.assignedUser ? (
                        <>
                          {userLabel(assignedUserObj)}
                          <div className={styles.metaText}>
                            userId: {safe(c.assignedUser)}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={styles.td}>{safe(c.registrationDocumentStatus)}</td>
                    <td className={styles.td}>{fmtDate(m.inspectionDueAt)}</td>
                    <td className={styles.td}>{fmtDate(m.insuranceDueAt)}</td>
                    <td className={styles.td}>{fmtDate(m.lastOilServiceAt)}</td>
                    <td className={styles.td}>{safe(m.lastOilServiceMileage)}</td>
                    <td className={styles.td}>{safe(m.currentMileage)}</td>
                    <td className={styles.td}>{safe(c.batteryYear)}</td>
                    <td className={styles.td}>{yesNo(e.hasTriangle)}</td>
                    <td className={styles.td}>{yesNo(e.hasExtinguisher)}</td>
                    <td className={styles.td}>{yesNo(e.hasFirstAidKit)}</td>
                    <td className={styles.td}>{yesNo(c.hasGps)}</td>
                    <td className={styles.td}>{yesNo(c.hasCamera)}</td>
                    <td className={styles.td}>{yesNo(c.hasSpareKey)}</td>
                    <td className={styles.td}>{yesNo(c.hasVirtualCard)}</td>
                    <td className={styles.td}>{yesNo(c.hasSpare)}</td>
                    <td className={styles.td}>{safe(c.cleanliness)}</td>
                    <td className={styles.td}>{safe(e.tiresDescription)}</td>
                    <td className={styles.td}>{safe(e.tiresDescription2)}</td>
                    <td className={styles.td}>{safe(c.repairNotes)}</td>
                    <td className={styles.td}>
                      Wszystkie: {faults.length}
                      <br />
                      Otwarte: {openFaults.length}
                    </td>
                    <td className={styles.td}>{c.isArchived ? "TAK" : "NIE"}</td>
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