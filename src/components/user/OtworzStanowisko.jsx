import { useState, useEffect } from 'react';
import { database, ref, get, update } from '../../FirebaseConfig';
import Navbar from './Navbar';
import styles from './OtworzStanowisko.module.css';

function OtworzStanowisko() {
  const [openedToday, setOpenedToday] = useState(false);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const currentUserId = localStorage.getItem('user_id');
    setUserId(currentUserId);

    const fetchUserLocations = async () => {
      if (!currentUserId) return;
      const userSnapshot = await get(ref(database, `users/${currentUserId}`));
      if (!userSnapshot.exists()) return;

      const userData = userSnapshot.val();
      const userLocations = userData.location || [];

      const locSnapshot = await get(ref(database, 'locations'));
      if (!locSnapshot.exists()) return;

      const allLocations = locSnapshot.val();
      const filtered = userLocations.map(locId => ({ id: locId, ...allLocations[locId] }));
      setLocations(filtered);

      if (filtered.length > 0) {
        setSelectedLocation(filtered[0].id);
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
        const openedDate = filtered[0].opened ? new Date(filtered[0].opened).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }) : null;
        setOpenedToday(openedDate === today);
      }
      
    };

    fetchUserLocations();
  }, []);

  const handleOpen = async () => {
    if (!selectedLocation || !userId) return;

    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' }).replace(' ', 'T');
    await update(ref(database, `locations/${selectedLocation}`), { opened: now, openedBy: userId });
    setOpenedToday(true);

    setLocations(prev =>
      prev.map(loc => loc.id === selectedLocation ? { ...loc, opened: now, openedBy: userId } : loc)
    );
  };

  const selectedLocationInfo = locations.find(loc => loc.id === selectedLocation);

  return (
    <>
      <Navbar />
      <div className={styles.mainContainer}>
        <h2 className={styles.sectionTitle}>Otwórz stanowisko</h2>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Wybierz stanowisko:</label>
          <select
            className={styles.selectInput}
            value={selectedLocation}
            onChange={(e) => {
              setSelectedLocation(e.target.value);
              const selected = locations.find(loc => loc.id === e.target.value);
              const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
              const openedDate = selected?.opened ? new Date(selected.opened).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }) : null;
              setOpenedToday(openedDate === today);

            }}
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.address}</option>
            ))}
          </select>
        </div>

        {!openedToday && (
          <button onClick={handleOpen} className={styles.openButton}>
            Otwórz stanowisko
          </button>
        )}

        {openedToday && selectedLocationInfo?.opened && (
          <p className={styles.confirmationText}>
            Stanowisko otwarte dziś o godz: {new Date(selectedLocationInfo.opened).toLocaleTimeString('pl-PL')}
          </p>
        )}
      </div>
    </>
  );
}

export default OtworzStanowisko;
