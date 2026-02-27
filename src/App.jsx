import React from "react";
import { Routes, Route } from "react-router-dom";
import CleaningForm from "./pages/CleaningForm";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CleaningForm />} />
      <Route path="/adminadmin" element={<Admin />} />
    </Routes>
  );
}