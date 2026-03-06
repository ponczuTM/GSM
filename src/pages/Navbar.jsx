import { NavLink } from "react-router-dom";
import styles from "./Navbar.module.css";

function NavBtn({ to, text }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        isActive
          ? `${styles.navBtn} ${styles.navBtnActive}`
          : styles.navBtn
      }
    >
      {text}
    </NavLink>
  );
}

export default function Navbar() {
  return (
    <div className={styles.box}>
      <h3 className={styles.boxTitle}>ZARZĄDZANIE FLOTĄ EXON</h3>

      <div className={styles.navRow}>
        <NavBtn to="/admincars" text="PANEL ADMINA" />
        <NavBtn to="/addnewcar" text="Dodaj Samochód" />
        <NavBtn to="/addnewusers" text="Dodaj Użytkownika" />
        <NavBtn to="/showallcars" text="Pokaż Samochody" />
        <NavBtn to="/showallreservations" text="Pokaż Rezerwacje/Wypożyczenia" />
        <NavBtn to="/carreservation" text="Rezerwacja/Wypożyczenie Samochodu" />
      </div>
    </div>
  );
}