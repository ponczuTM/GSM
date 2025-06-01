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

  return (
    <>
      <Navbar />
      <div className="main-container">
        <div className="welcome-text">
          Witaj Użytkowniku! Miło Cię widzieć!
        </div>
      </div>
    </>
  );
}

export default MainPage;
