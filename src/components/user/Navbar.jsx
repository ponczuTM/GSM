import { NavLink, useNavigate } from 'react-router-dom';
import styles from './Navbar.module.css';

function Navbar() {
  const navigate = useNavigate();

  const navItems = [
    { label: 'Strona główna', path: '/user' },
    { label: 'Otwórz stanowisko', path: '/user/otworz-stanowisko' },
    { label: 'Dodaj usługę', path: '/user/dodaj-usluge' },
    { label: 'Dodaj do zamówienia', path: '/user/dodaj-zamowienie' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('login_status');
    navigate('/');
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.navLinks}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              isActive
                ? `${styles.navLink} ${styles.navLinkActive}`
                : styles.navLink
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
      <button onClick={handleLogout} className={styles.logoutButton}>
        Wyloguj się
      </button>
    </nav>
  );
}

export default Navbar;
