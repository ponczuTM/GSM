import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from './Navbar';

function MainPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('login_status') !== 'user_logged_in') {
      navigate('/');
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('login_status');
    navigate('/');
  };

  return (
    <>
      <Navbar />
      <div className="main-container">
        <div className="logout-container">
          <button onClick={handleLogout} className="logout-button">
            Wyloguj się
          </button>
        </div>
        <div className="welcome-text">
          Witaj Użytkowniku! Miło Cię widzieć!
        </div>
      </div>
    </>
  );
}

export default MainPage;
