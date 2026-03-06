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
      <h3 className={styles.boxTitle}>Skróty</h3>

      <div className={styles.navRow}>
        <NavBtn to="/admincars" text="ADMIN" />
        <NavBtn to="/addnewcar" text="AddNewCar" />
        <NavBtn to="/addnewusers" text="AddNewUsers" />
        <NavBtn to="/showallcars" text="ShowAllCars" />
        <NavBtn to="/showallreservations" text="ShowAllReservations" />
        <NavBtn to="/carreservation" text="CarReservation" />
      </div>
    </div>
  );
}