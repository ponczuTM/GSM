import { useState, useEffect } from 'react';
import { database, ref, get, update, push, child } from '../../FirebaseConfig';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import Navbar from './Navbar';
import styles from './DodajUsluge.module.css';

function DodajUsluge() {
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [user, setUser] = useState(null); // Załóżmy, że masz sposób na uzyskanie aktualnego użytkownika

  useEffect(() => {
    // Zakładamy, że masz sposób na pobranie aktualnego użytkownika
    const currentUser = { id: '3304dc2ef52c9303473d44df1ac6096e' }; // Przykładowy użytkownik
    setUser(currentUser);

    const fetchLocations = async () => {
      const locRef = ref(database, 'locations');
      const snapshot = await get(locRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const locList = Object.entries(data).map(([id, value]) => ({ id, address: value.address }));
        setLocations(locList);
      }
    };
    fetchLocations();
  }, []);

  useEffect(() => {
    if (selectedLocation) {
      const fetchProducts = async () => {
        const stockRef = ref(database, `magazyn/${selectedLocation}`);
        const snapshot = await get(stockRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const prodList = Object.entries(data).map(([id, value]) => ({ id, ...value }));
          setProducts(prodList);
        }
      };
      fetchProducts();
    }
  }, [selectedLocation]);

  const handleSave = async () => {
    console.log('Kliknięto przycisk Zapisz');
  
    if (!user || !selectedProduct || quantity <= 0) {
      console.log('Brak użytkownika lub wybranego produktu/ilości');
      return;
    }
  
    const selectedProductData = products.find(p => p.id === selectedProduct);
    if (!selectedProductData) {
      console.log('Produkt nie został znaleziony');
      return;
    }
  
    const newQuantity = selectedProductData.quantity - quantity;
    if (newQuantity < 0) {
      console.log('Niewystarczająca ilość produktu');
      return;
    }
  
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss', { locale: pl });
    const sellingId = push(child(ref(database), `users/${user.id}/sellings`)).key;
  
    const updates = {};
  
    // Zapisz sprzedaż do użytkownika
    updates[`users/${user.id}/sellings/${sellingId}`] = {
      product: selectedProduct,
      quantity,
      timestamp,
    };
  
    // Zaktualizuj magazyn
    updates[`magazyn/${selectedLocation}/${selectedProduct}`] = {
      ...selectedProductData,
      quantity: newQuantity,
    };
  
    try {
      console.log('Aktualizuję dane w Firebase:', updates);
      await update(ref(database), updates);
      alert('Usługa została zapisana!');
      setSelectedProduct('');
      setQuantity(1);
    } catch (error) {
      console.error('Błąd podczas zapisywania usługi:', error);
      alert('Wystąpił błąd. Spróbuj ponownie.');
    }
  };
  

  return (
    <>

<Navbar />
    <div className={styles.container}>
      <h2 className={styles.heading}>Dodaj usługę</h2>

      <div className={styles.formGroup}>
        <label className={styles.label}>Lokalizacja:</label>
        <select
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          className={styles.select}
        >
          <option value="">Wybierz lokalizację</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.address}
            </option>
          ))}
        </select>
      </div>

      {selectedLocation && (
        <>
          <div className={styles.formGroup}>
            <label className={styles.label}>Produkt:</label>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className={styles.select}
            >
              <option value="">Wybierz produkt</option>
              {products.map((prod) => (
                <option key={prod.id} value={prod.id}>
                  {prod.brand} {prod.model} - {prod.color}
                </option>
              ))}
            </select>
          </div>

          {selectedProduct && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Ilość:</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                min="1"
                className={styles.input}
              />
            </div>
          )}
        </>
      )}

      <button onClick={handleSave} className={styles.saveButton}>
        Zapisz
      </button>
    </div>
    </>
  );
}

export default DodajUsluge;
