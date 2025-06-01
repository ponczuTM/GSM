import { useState, useEffect } from 'react';
import { database, ref, get } from '../../FirebaseConfig';
import Navbar from './Navbar';
import styles from './Punkty.module.css';

function Punkty() {
  const [locations, setLocations] = useState([]);
  const [users, setUsers] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      const locSnap = await get(ref(database, 'locations'));
      const userSnap = await get(ref(database, 'users'));

      if (locSnap.exists()) {
        const locs = locSnap.val();
        const locationsList = Object.values(locs);
        setLocations(locationsList);
      }

      if (userSnap.exists()) {
        const userData = userSnap.val();
        setUsers(userData);
      }
    };

    fetchData();
  }, []);

  const isToday = (dateString) => {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
    const inputDate = dateString
      ? new Date(dateString).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' })
      : null;
    return today === inputDate;

  };

  const getUserLabel = (userId) => {
    const user = users[userId];
    return user ? user.email : '-';
  };

  return (
    <>
      <Navbar />
      <div className={styles.mainContainer}>
        <h2 className={styles.sectionTitle}>Status punktów</h2>
        <table className={styles.table}>
          <thead>
            <tr className={styles.tableHeader}>
              <th className={styles.tableCell}>Punkt</th>
              <th className={styles.tableCell}>Status</th>
              <th className={styles.tableCell}>Pracownik</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => {
              const isOpened = isToday(loc.opened);
              const status = isOpened
                ? `OTWARTE OD ${new Date(loc.opened).toLocaleTimeString('pl-PL')}`
                : 'ZAMKNIĘTE';
              const openedBy = isOpened ? getUserLabel(loc.openedBy) : '-';

              return (
                <tr key={loc.id} className={styles.tableRow}>
                  <td className={styles.tableCell}>{loc.address}</td>
                  <td
                    className={`${styles.tableCell} ${isOpened ? styles.statusOpen : styles.statusClosed
                      }`}
                  >
                    {status}
                  </td>
                  <td className={styles.tableCell}>{openedBy}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default Punkty;
