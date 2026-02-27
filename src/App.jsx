import React from "react";
import { Routes, Route } from "react-router-dom";
import CleaningForm from "./pages/CleaningForm";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CleaningForm />} />
    </Routes>
  );
}