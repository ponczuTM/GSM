import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from './Navbar';

function MainPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('login_status') !== 'admin_logged_in') {
      navigate('/');
    }
  }, [navigate]);

  return (
    <>
      <Navbar />
      <div className="main-container">
        <div className="welcome-text">Cześć Adminie! Co dzisiaj sprawdzamy?</div>
      </div>
    </>
  );
}

export default MainPage;
