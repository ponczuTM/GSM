import { NavLink, useNavigate } from 'react-router-dom';
import styles from './Navbar.module.css';

function Navbar() {
  const navigate = useNavigate();

  const navItems = [
    { label: 'Strona główna', path: '/admin' },
    { label: 'Statystyki', path: '/admin/statystyki' },
    { label: 'Premie', path: '/admin/premie' },
    { label: 'Magazyn', path: '/admin/magazyn' },
    { label: 'Punkty', path: '/admin/punkty' },
    { label: 'Pracownicy', path: '/admin/pracownicy' },
    { label: 'Allegro', path: '/admin/allegro' },
    { label: 'Kalendarz', path: '/admin/kalendarz' },
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
