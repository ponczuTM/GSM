import { useEffect, useState } from 'react';
import { database, ref, get } from '../../FirebaseConfig';
import { format, isSameDay, isSameMonth, isSameWeek, isSameYear, parse } from 'date-fns';
import { pl } from 'date-fns/locale';
import Navbar from './Navbar';
import styles from './Premie.module.css';

const FILTERS = {
  all: () => true,
  today: (date) => isSameDay(date, new Date()),
  week: (date) => isSameWeek(date, new Date(), { locale: pl }),
  month: (date) => isSameMonth(date, new Date()),
  year: (date) => isSameYear(date, new Date()),
};

function Premie() {
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [filter, setFilter] = useState('month');

  useEffect(() => {
    const fetchData = async () => {
      const usersSnapshot = await get(ref(database, 'users'));
      const magazynSnapshot = await get(ref(database, 'magazyn'));
      if (!usersSnapshot.exists() || !magazynSnapshot.exists()) return;

      const usersData = usersSnapshot.val();
      const magazynData = magazynSnapshot.val();

      const productMap = {};
      for (const location of Object.values(magazynData)) {
        for (const [id, product] of Object.entries(location)) {
          productMap[id] = product;
        }
      }

      setProducts(productMap);

      const parsedUsers = Object.entries(usersData)
        .filter(([_, u]) => u.type === 'user')
        .map(([id, u]) => {
          const sellings = u.sellings || {};
          const filteredSellings = Object.values(sellings).filter((s) => {
            const saleDate = parse(s.timestamp, 'yyyy-MM-dd HH:mm:ss', new Date());
            return FILTERS[filter](saleDate);
          });

          const totalBonus = filteredSellings.reduce((sum, s) => {
            const bonus = productMap[s.product]?.bonus || 0;
            return sum + bonus * s.quantity;
          }, 0);

          return {
            id,
            email: u.email,
            totalBonus,
            filteredSellings,
          };
        });

      setUsers(parsedUsers);
    };

    fetchData();
  }, [filter]);

  return (
    <>

<Navbar />
    <div className={styles.container}>
      <h2 className={styles.heading}>Premie pracowników</h2>

      <div className={styles.filters}>
        {Object.keys(FILTERS).map((key) => (
          <button
            key={key}
            className={`${styles.filterButton} ${filter === key ? styles.active : ''}`}
            onClick={() => setFilter(key)}
          >
            {key === 'today' && 'Dzisiaj'}
            {key === 'week' && 'Ten tydzień'}
            {key === 'month' && 'Ten miesiąc'}
            {key === 'year' && 'Ten rok'}
            {key === 'all' && 'Od zawsze'}
          </button>
        ))}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Użytkownik</th>
            <th>Premia</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} onClick={() => setSelectedUserId(user.id)}>
              <td>{user.email}</td>
              <td>{user.totalBonus} zł</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedUserId && (
        <div className={styles.details}>
          <h3>Szczegóły sprzedaży: {users.find(u => u.id === selectedUserId)?.email}</h3>
          <ul>
            {users.find(u => u.id === selectedUserId)?.filteredSellings.map((s, index) => {
              const product = products[s.product];
              return (
                <li key={index}>
                  {s.timestamp} – {product?.brand} {product?.model} {product?.color} – Ilość: {s.quantity} – Bonus: {product?.bonus || 0} zł
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
    </>
  );
}

export default Premie;
