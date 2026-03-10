import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function useRequireSuperAdmin() {
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const isLogged = localStorage.getItem("superAdminLoggedIn");

      if (isLogged !== "true") {
        navigate("/carreservation", { replace: true });
      }
    } catch (e) {
      navigate("/carreservation", { replace: true });
    }
  }, [navigate]);
}