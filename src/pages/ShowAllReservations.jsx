import React, { useEffect, useMemo, useState } from "react";
import { database, ref, onValue } from "../FirebaseConfig";
import styles from "./ShowAllReservations.module.css";
import Navbar from "./Navbar";

function safe(v, fallback = "—") {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function fmtPL(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL");
  } catch {
    return "—";
  }
}

function isNullish(v) {
  return v === null || v === undefined;
}

function getReservationBucket(r) {
  const now = Date.now();
  const start = new Date(r?.startAt || "").getTime();
  const end = new Date(r?.endAt || "").getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) return "UNKNOWN";
  if (now < start) return "FUTURE";
  if (now >= start && now < end) return "CURRENT";
  return "PAST";
}

export default function ShowAllReservations() {
  const [users, setUsers] = useState([]);
  const [cars, setCars] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubUsers = onValue(
      ref(database, "users"),
      (snap) => {
        const val = snap.val();
        const arr = val ? Object.values(val) : [];
        setUsers(arr);
      },
      (err) => console.error(err)
    );

    const unsubCars = onValue(
      ref(database, "cars"),
      (snap) => {
        const val = snap.val();
        const arr = val ? Object.values(val) : [];
        setCars(arr);
      },
      (err) => console.error(err)
    );

    const unsubRentals = onValue(
      ref(database, "rentals"),
      (snap) => {
        const val = snap.val();
        const arr = val ? Object.values(val) : [];
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

  const onlyNowRentals = useMemo(() => {
    return rentals.filter((r) => (r?.type || "").toUpperCase() === "NOW");
  }, [rentals]);

  const onlyReservations = useMemo(() => {
    return rentals.filter((r) => (r?.type || "").toUpperCase() === "RESERVATION");
  }, [rentals]);

  const activeNow = useMemo(() => {
    const list = onlyNowRentals.filter((r) => {
      const status = (r?.status || "").toUpperCase();
      const active = status === "ACTIVE";
      const noEnd = isNullish(r?.endAt);
      return active && noEnd;
    });

    list.sort((a, b) => String(b?.startAt || "").localeCompare(String(a?.startAt || "")));
    return list;
  }, [onlyNowRentals]);

  const pastNow = useMemo(() => {
    const list = onlyNowRentals.filter((r) => {
      const status = (r?.status || "").toUpperCase();
      const ended = !isNullish(r?.endAt);
      return status !== "ACTIVE" || ended;
    });

    list.sort((a, b) => {
      const ae = String(a?.endAt || "");
      const be = String(b?.endAt || "");
      if (ae && be) return be.localeCompare(ae);
      if (be) return 1;
      if (ae) return -1;
      return String(b?.startAt || "").localeCompare(String(a?.startAt || ""));
    });

    return list;
  }, [onlyNowRentals]);

  const currentReservations = useMemo(() => {
    const list = onlyReservations.filter((r) => getReservationBucket(r) === "CURRENT");
    list.sort((a, b) => String(a?.startAt || "").localeCompare(String(b?.startAt || "")));
    return list;
  }, [onlyReservations]);

  const futureReservations = useMemo(() => {
    const list = onlyReservations.filter((r) => getReservationBucket(r) === "FUTURE");
    list.sort((a, b) => String(a?.startAt || "").localeCompare(String(b?.startAt || "")));
    return list;
  }, [onlyReservations]);

  const pastReservations = useMemo(() => {
    const list = onlyReservations.filter((r) => getReservationBucket(r) === "PAST");
    list.sort((a, b) => String(b?.endAt || "").localeCompare(String(a?.endAt || "")));
    return list;
  }, [onlyReservations]);

  function renderNowRow(r) {
    const car = carsById.get(r.carId);
    const borrowedBy = usersById.get(r.borrowedByUserId);
    const returnedBy = usersById.get(r.returnedByUserId);

    return (
      <tr key={r.id}>
        <td className={styles.tdStrong}>
          {safe(car?.plateNumber, r.carId)}
          <div className={styles.subText}>
            {safe(car?.make)} {safe(car?.model)}
          </div>
        </td>

        <td className={styles.td}>
          {safe(borrowedBy?.name, r.borrowedByUserId)}
          <div className={styles.subText}>
            userId: <code>{safe(r.borrowedByUserId)}</code>
          </div>
        </td>

        <td className={styles.td}>
          {fmtPL(r.startAt)}
          <div className={styles.subText}>
            rentalId: <code>{safe(r.id)}</code>
          </div>
        </td>

        <td className={styles.td}>
          {isNullish(r.endAt) ? (
            <span className={styles.inProgress}>— (w trakcie)</span>
          ) : (
            fmtPL(r.endAt)
          )}
        </td>

        <td className={styles.td}>
          {isNullish(r.returnedByUserId) ? (
            "—"
          ) : (
            <>
              {safe(returnedBy?.name, r.returnedByUserId)}
              <div className={styles.subText}>
                <code>{safe(r.returnedByUserId)}</code>
              </div>
            </>
          )}
        </td>

        <td className={styles.td}>
          <div className={styles.commentBox}>
            {safe(r.description, "—")}
          </div>
        </td>

        <td className={styles.td}>
          <div className={styles.auditText}>
            type: <strong>{safe(r.type)}</strong>
            <br />
            status: <strong>{safe(r.status)}</strong>
            <br />
            createdAt: {safe(r?.audit?.createdAt)}
            <br />
            createdBy: {safe(r?.audit?.createdBy)}
            <br />
            updatedAt: {safe(r?.audit?.updatedAt)}
            <br />
            updatedBy: {safe(r?.audit?.updatedBy)}
          </div>
        </td>
      </tr>
    );
  }

  function renderReservationRow(r) {
    const car = carsById.get(r.carId);
    const borrowedBy = usersById.get(r.borrowedByUserId);
    const bucket = getReservationBucket(r);

    let bucketLabel = "—";
    if (bucket === "CURRENT") bucketLabel = "OBECNA";
    else if (bucket === "FUTURE") bucketLabel = "PRZYSZŁA";
    else if (bucket === "PAST") bucketLabel = "PRZESZŁA";
    else bucketLabel = "NIEZNANA";

    return (
      <tr key={r.id}>
        <td className={styles.tdStrong}>
          {safe(car?.plateNumber, r.carId)}
          <div className={styles.subText}>
            {safe(car?.make)} {safe(car?.model)}
          </div>
        </td>

        <td className={styles.td}>
          {safe(borrowedBy?.name, r.borrowedByUserId)}
          <div className={styles.subText}>
            userId: <code>{safe(r.borrowedByUserId)}</code>
          </div>
        </td>

        <td className={styles.td}>
          {fmtPL(r.startAt)}
          <div className={styles.subText}>
            reservationId: <code>{safe(r.id)}</code>
          </div>
        </td>

        <td className={styles.td}>{fmtPL(r.endAt)}</td>

        <td className={styles.td}>
          <strong>{bucketLabel}</strong>
        </td>

        <td className={styles.td}>
          <div className={styles.commentBox}>
            {safe(r.description, "—")}
          </div>
        </td>

        <td className={styles.td}>
          <div className={styles.auditText}>
            type: <strong>{safe(r.type)}</strong>
            <br />
            status: <strong>{safe(r.status)}</strong>
            <br />
            createdAt: {safe(r?.audit?.createdAt)}
            <br />
            createdBy: {safe(r?.audit?.createdBy)}
            <br />
            updatedAt: {safe(r?.audit?.updatedAt)}
            <br />
            updatedBy: {safe(r?.audit?.updatedBy)}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className={styles.wrapper}>
      <Navbar />
      <h2 className={styles.title}>Wypożyczenia i rezerwacje – aktualne i historia</h2>
      <p className={styles.source}>
        Źródło: <code>/rentals</code> (rekordy <code>NOW</code> i <code>RESERVATION</code>).
      </p>

      {loading ? (
        <div className={styles.box}>Ładuję dane...</div>
      ) : (
        <>
          <div className={styles.box}>
            <h3 className={styles.sectionTitle}>Aktualnie wypożyczone (NOW): {activeNow.length}</h3>
            {activeNow.length === 0 ? (
              <div className={styles.emptyText}>Brak aktywnych wypożyczeń.</div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.tableHeadRow}>
                      <th className={styles.th}>Auto</th>
                      <th className={styles.th}>Kto wypożyczył</th>
                      <th className={styles.th}>Start</th>
                      <th className={styles.th}>Koniec</th>
                      <th className={styles.th}>Kto oddał</th>
                      <th className={styles.th}>Opis / komentarz</th>
                      <th className={styles.th}>Audit / status</th>
                    </tr>
                  </thead>
                  <tbody>{activeNow.map(renderNowRow)}</tbody>
                </table>
              </div>
            )}
          </div>

          <div className={styles.box}>
            <h3 className={styles.sectionTitle}>Ubiegłe wypożyczenia (NOW): {pastNow.length}</h3>
            {pastNow.length === 0 ? (
              <div className={styles.emptyText}>Brak historii wypożyczeń.</div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.tableHeadRow}>
                      <th className={styles.th}>Auto</th>
                      <th className={styles.th}>Kto wypożyczył</th>
                      <th className={styles.th}>Start</th>
                      <th className={styles.th}>Koniec</th>
                      <th className={styles.th}>Kto oddał</th>
                      <th className={styles.th}>Opis / komentarz</th>
                      <th className={styles.th}>Audit / status</th>
                    </tr>
                  </thead>
                  <tbody>{pastNow.map(renderNowRow)}</tbody>
                </table>
              </div>
            )}
          </div>

          <div className={styles.box}>
            <h3 className={styles.sectionTitle}>Obecne rezerwacje (RESERVATION): {currentReservations.length}</h3>
            {currentReservations.length === 0 ? (
              <div className={styles.emptyText}>Brak obecnych rezerwacji.</div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.tableHeadRow}>
                      <th className={styles.th}>Auto</th>
                      <th className={styles.th}>Kto zarezerwował</th>
                      <th className={styles.th}>Start</th>
                      <th className={styles.th}>Koniec</th>
                      <th className={styles.th}>Typ czasu</th>
                      <th className={styles.th}>Opis / komentarz</th>
                      <th className={styles.th}>Audit / status</th>
                    </tr>
                  </thead>
                  <tbody>{currentReservations.map(renderReservationRow)}</tbody>
                </table>
              </div>
            )}
          </div>

          <div className={styles.box}>
            <h3 className={styles.sectionTitle}>Przyszłe rezerwacje (RESERVATION): {futureReservations.length}</h3>
            {futureReservations.length === 0 ? (
              <div className={styles.emptyText}>Brak przyszłych rezerwacji.</div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.tableHeadRow}>
                      <th className={styles.th}>Auto</th>
                      <th className={styles.th}>Kto zarezerwował</th>
                      <th className={styles.th}>Start</th>
                      <th className={styles.th}>Koniec</th>
                      <th className={styles.th}>Typ czasu</th>
                      <th className={styles.th}>Opis / komentarz</th>
                      <th className={styles.th}>Audit / status</th>
                    </tr>
                  </thead>
                  <tbody>{futureReservations.map(renderReservationRow)}</tbody>
                </table>
              </div>
            )}
          </div>

          <div className={styles.box}>
            <h3 className={styles.sectionTitle}>Przeszłe rezerwacje (RESERVATION): {pastReservations.length}</h3>
            {pastReservations.length === 0 ? (
              <div className={styles.emptyText}>Brak przeszłych rezerwacji.</div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.tableHeadRow}>
                      <th className={styles.th}>Auto</th>
                      <th className={styles.th}>Kto zarezerwował</th>
                      <th className={styles.th}>Start</th>
                      <th className={styles.th}>Koniec</th>
                      <th className={styles.th}>Typ czasu</th>
                      <th className={styles.th}>Opis / komentarz</th>
                      <th className={styles.th}>Audit / status</th>
                    </tr>
                  </thead>
                  <tbody>{pastReservations.map(renderReservationRow)}</tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className={styles.footerStats}>
        users={users.length}, cars={cars.length}, rentals={rentals.length}
      </div>
    </div>
  );
}