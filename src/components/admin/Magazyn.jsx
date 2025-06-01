import { useEffect, useState } from 'react';
import { database, ref, get, push, remove, update } from '../../FirebaseConfig';
import Navbar from './Navbar';
import styles from "./Magazyn.module.css";
function Magazyn() {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('Folia');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');

  useEffect(() => {
    const fetchLocations = async () => {
      const locRef = ref(database, 'locations');
      const snapshot = await get(locRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const locList = Object.entries(data).map(([id, value]) => ({ id, address: value.address }));
        setLocations(locList);
        if (locList.length > 0) setSelectedLocation(locList[0].id);
      }
    };
    fetchLocations();
  }, []);

  const fetchStock = async () => {
    if (!selectedLocation) return;
    const stockRef = ref(database, `magazyn/${selectedLocation}`);
    const snapshot = await get(stockRef);
    if (snapshot.exists()) {
      const data = snapshot.val();
      const parsed = Object.entries(data).map(([key, value]) => ({ id: key, ...value }));
      setItems(parsed);
    } else {
      setItems([]);
    }
  };

  useEffect(() => {
    fetchStock();
  }, [selectedLocation]);

  const handleAdd = async () => {
    const newItem = {
      type,
      color,
      quantity: Number(quantity),
      brand,
      model,
      createdAt: new Date().toISOString(),
    };

    if (editingId) {
      await update(ref(database, `magazyn/${selectedLocation}/${editingId}`), newItem);
      setEditingId(null);
    } else {
      await push(ref(database, `magazyn/${selectedLocation}`), newItem);
    }

    setType('Folia');
    setColor('');
    setQuantity(0);
    setBrand('');
    setModel('');
    setShowForm(false);
    fetchStock();
  };

  const handleDelete = async (id) => {
    await remove(ref(database, `magazyn/${selectedLocation}/${id}`));
    fetchStock();
  };

  const handleEdit = (item) => {
    setType(item.type);
    setColor(item.color);
    setQuantity(item.quantity);
    setBrand(item.brand || '');
    setModel(item.model || '');
    setEditingId(item.id);
    setShowForm(true);
  };

  return (
    <>
      <Navbar />
      <div className={styles.mainContainer}>
        <h2 className={styles.heading}>Stan magazynowy</h2>

        <div className={styles.formGroup}>
          <label className={styles.label}>Lokalizacja:</label>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className={styles.select}
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.address}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
            setType('Folia');
            setColor('');
            setQuantity(0);
            setBrand('');
            setModel('');
          }}
          className={`${styles.button} ${styles.addButton}`}
        >
          {showForm ? 'Anuluj' : 'Dodaj produkt'}
        </button>

        {showForm && (
          <div className={styles.formContainer}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Typ:</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={styles.select}>
                <option value="Folia">Folia</option>
                <option value="Etui">Etui</option>
                <option value="Akcesoria">Akcesoria</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Kolor:</label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Marka:</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Model:</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Ilość:</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={styles.input}
              />
            </div>
            <button onClick={handleAdd} className={`${styles.button} ${styles.saveButton}`}>
              {editingId ? 'Zapisz zmiany' : 'Zapisz'}
            </button>
          </div>
        )}

        <table className={styles.table}>
          <thead>
            <tr className={styles.tableHeader}>
              <th>Typ</th>
              <th>Kolor</th>
              <th>Marka</th>
              <th>Model</th>
              <th>Ilość</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className={styles.tableCell}>{item.type}</td>
                <td className={styles.tableCell}>{item.color}</td>
                <td className={styles.tableCell}>{item.brand || '-'}</td>
                <td className={styles.tableCell}>{item.model || '-'}</td>
                <td className={styles.tableCell}>{item.quantity}</td>
                <td className={styles.tableCell}>
                  <button onClick={() => handleEdit(item)} className={`${styles.button} ${styles.editButton}`}>
                    Edytuj
                  </button>
                  <button onClick={() => handleDelete(item.id)} className={`${styles.button} ${styles.deleteButton}`}>
                    Usuń
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default Magazyn;