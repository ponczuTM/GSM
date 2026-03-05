import React from "react";
import { Routes, Route } from "react-router-dom";
import CleaningForm from "./pages/CleaningForm";
import Admin from "./pages/Admin";
import AddNewCar from "./pages/AddNewCar";
import ShowAllCars from "./pages/ShowAllCars";
import AddNewUsers from "./pages/AddNewUsers";
import CarReservation from "./pages/CarReservation";
import ShowAllReservations from "./pages/ShowAllReservations";
import AdminCars from "./pages/AdminCars";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CleaningForm />} />
      <Route path="/adminadmin" element={<Admin />} />
      <Route path="/addnewcar" element={<AddNewCar />} />
      <Route path="/addnewusers" element={<AddNewUsers />} />
      <Route path="/showallcars" element={<ShowAllCars />} />
      <Route path="/showallreservations" element={<ShowAllReservations />} />
      <Route path="/carreservation" element={<CarReservation />} />
      <Route path="/admincars" element={<AdminCars />} />
      
    </Routes>
  );
}