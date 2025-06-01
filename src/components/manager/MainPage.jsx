import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function MainPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('login_status') !== 'manager_logged_in') {
      navigate('/');
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('login_status');
    navigate('/');
  };

  return (
    <div className="main-container">
      <div className="logout-container">
        <button onClick={handleLogout} className="logout-button">
          Wyloguj się
        </button>
      </div>
      <div className="welcome-text">
        Hej Kierowniku! Czas pokierować zespołem!
      </div>
    </div>
  );
}

export default MainPage;
