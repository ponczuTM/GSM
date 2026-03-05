import React, { useEffect, useMemo, useState } from "react";
import { database, ref, onValue } from "../FirebaseConfig";

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

  const activeNow = useMemo(() => {
    const list = onlyNowRentals.filter((r) => {
      const status = (r?.status || "").toUpperCase();
      const active = status === "ACTIVE";
      const noEnd = isNullish(r?.endAt);
      return active && noEnd;
    });

    // sort: najnowsze startAt pierwsze
    list.sort((a, b) => String(b?.startAt || "").localeCompare(String(a?.startAt || "")));
    return list;
  }, [onlyNowRentals]);

  const pastNow = useMemo(() => {
    const list = onlyNowRentals.filter((r) => {
      const status = (r?.status || "").toUpperCase();
      const ended = !isNullish(r?.endAt);
      return status !== "ACTIVE" || ended;
    });

    // sort: najnowsze zakończone pierwsze (endAt), fallback startAt
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

  function renderRow(r) {
    const car = carsById.get(r.carId);
    const borrowedBy = usersById.get(r.borrowedByUserId);
    const returnedBy = usersById.get(r.returnedByUserId);

    return (
      <tr key={r.id}>
        <td style={tdStrong}>
          {safe(car?.plateNumber, r.carId)}
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            {safe(car?.make)} {safe(car?.model)}
          </div>
        </td>

        <td style={td}>
          {safe(borrowedBy?.name, r.borrowedByUserId)}
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            userId: <code>{safe(r.borrowedByUserId)}</code>
          </div>
        </td>

        <td style={td}>
          {fmtPL(r.startAt)}
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            rentalId: <code>{safe(r.id)}</code>
          </div>
        </td>

        <td style={td}>
          {isNullish(r.endAt) ? (
            <span style={{ fontWeight: 900 }}>— (w trakcie)</span>
          ) : (
            fmtPL(r.endAt)
          )}
        </td>

        <td style={td}>
          {isNullish(r.returnedByUserId) ? (
            "—"
          ) : (
            <>
              {safe(returnedBy?.name, r.returnedByUserId)}
              <div style={{ opacity: 0.7, fontSize: 12 }}>
                <code>{safe(r.returnedByUserId)}</code>
              </div>
            </>
          )}
        </td>

        <td style={td}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
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

  const wrapper = { maxWidth: 1300, margin: "0 auto", padding: 18 };
  const box = {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: 16,
    background: "#fff",
    marginBottom: 14,
  };

  return (
    <div style={wrapper}>
      <h2 style={{ marginBottom: 10 }}>Wypożyczenia (NOW) – aktualne i historia</h2>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Źródło: <code>/rentals</code> (tylko <code>type="NOW"</code>).
      </p>

      {loading ? (
        <div style={box}>Ładuję dane...</div>
      ) : (
        <>
          {/* ACTIVE */}
          <div style={box}>
            <h3 style={{ marginTop: 0 }}>Aktualnie wypożyczone: {activeNow.length}</h3>
            {activeNow.length === 0 ? (
              <div style={{ opacity: 0.8 }}>Brak aktywnych wypożyczeń.</div>
            ) : (
              <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#fafafa" }}>
                      <th style={th}>Auto</th>
                      <th style={th}>Kto wypożyczył</th>
                      <th style={th}>Start</th>
                      <th style={th}>Koniec</th>
                      <th style={th}>Kto oddał</th>
                      <th style={th}>Audit / status</th>
                    </tr>
                  </thead>
                  <tbody>{activeNow.map(renderRow)}</tbody>
                </table>
              </div>
            )}
          </div>

          {/* PAST */}
          <div style={box}>
            <h3 style={{ marginTop: 0 }}>Ubiegłe wypożyczenia: {pastNow.length}</h3>
            {pastNow.length === 0 ? (
              <div style={{ opacity: 0.8 }}>Brak historii wypożyczeń.</div>
            ) : (
              <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#fafafa" }}>
                      <th style={th}>Auto</th>
                      <th style={th}>Kto wypożyczył</th>
                      <th style={th}>Start</th>
                      <th style={th}>Koniec</th>
                      <th style={th}>Kto oddał</th>
                      <th style={th}>Audit / status</th>
                    </tr>
                  </thead>
                  <tbody>{pastNow.map(renderRow)}</tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ opacity: 0.65, fontSize: 12 }}>
        users={users.length}, cars={cars.length}, rentals={rentals.length}
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
  fontWeight: 900,
  whiteSpace: "nowrap",
};