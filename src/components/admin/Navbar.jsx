import { NavLink } from 'react-router-dom';
import styles from './Navbar.module.css';

function Navbar() {
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

  return (
    <nav className={styles.navbar}>
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
    </nav>
  );
}

export default Navbar;