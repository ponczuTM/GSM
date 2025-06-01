import { NavLink } from 'react-router-dom';
import styles from './Navbar.module.css';

function Navbar() {
  const navItems = [
    { label: 'Strona główna', path: '/user' },
    { label: 'Otwórz stanowisko', path: '/user/otworz-stanowisko' },
    { label: 'Dodaj produkt/usługę', path: '/user/dodaj-produkt' },
    { label: 'Dodaj do zamówienia', path: '/user/dodaj-zamowienie' },
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
