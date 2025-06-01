import { useState, useEffect } from 'react';
import { database, ref, set, get } from './FirebaseConfig';
import md5 from 'md5';
import { useNavigate, Routes, Route } from 'react-router-dom';
import AdminMainPage from './components/admin/MainPage';
import ManagerMainPage from './components/manager/MainPage';
import UserMainPage from './components/user/MainPage';
import Magazyn from './components/admin/Magazyn';
import OtworzStanowisko from './components/user/OtworzStanowisko';
import Punkty from './components/admin/Punkty';
import DodajUsluge from './components/user/DodajUsluge';
import Premie from './components/admin/Premie';
import "./App.css";

function App() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [accountType, setAccountType] = useState('user');
  const [error, setError] = useState('');
  const [locationList, setLocationList] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState(['']);

  let navigate;
  try {
    navigate = useNavigate();
  } catch (e) {
    return <div className="error-message">Błąd: App musi być użyty wewnątrz komponentu &lt;BrowserRouter&gt;.</div>;
  }

  useEffect(() => {
    const fetchLocations = async () => {
      const locRef = ref(database, 'locations');
      const snapshot = await get(locRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const parsed = Object.entries(data).map(([id, val]) => ({ id, address: val.address }));
        setLocationList(parsed);
      }
    };
    fetchLocations();
  }, []);

  const handleLogin = async () => {
    const hashedPassword = md5(password);
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);

    if (snapshot.exists()) {
      const users = snapshot.val();
      const userEntry = Object.entries(users).find(
        ([, value]) => value.email === email && value.passwordHash === hashedPassword
      );

      if (userEntry) {
        const [userId, userData] = userEntry;
        let route = '/user';
        let status = 'user_logged_in';

        if (userData.type === 'admin') {
          route = '/admin';
          status = 'admin_logged_in';
        } else if (userData.type === 'manager') {
          route = '/manager';
          status = 'manager_logged_in';
        }

        localStorage.setItem('login_status', status);
        localStorage.setItem('user_id', userId);
        navigate(route);
      } else {
        setError('Nieprawidłowy e-mail lub hasło.');
      }
    } else {
      setError('Brak użytkowników w bazie.');
    }
  };

  const handleRegister = async () => {
    if (password !== repeatPassword) {
      setError('Hasła się nie zgadzają.');
      return;
    }
    if ((accountType === 'user' || accountType === 'manager') && selectedLocations.some(loc => !loc)) {
      setError('Wybierz wszystkie stanowiska lub usuń puste.');
      return;
    }

    const hashedPassword = md5(password);
    const newUserRef = ref(database, `users/${md5(email)}`);
    const userData = {
      email,
      passwordHash: hashedPassword,
      type: accountType
    };
    if (accountType !== 'admin') {
      userData.location = selectedLocations.filter(Boolean);
    }
    await set(newUserRef, userData);
    setError('Zarejestrowano pomyślnie! Możesz się teraz zalogować.');
    setIsRegistering(false);
    setEmail('');
    setPassword('');
    setRepeatPassword('');
    setSelectedLocations(['']);
  };

  const handleAddLocation = () => {
    setSelectedLocations(prev => [...prev, '']);
  };

  const handleRemoveLocation = (index) => {
    setSelectedLocations(prev => prev.filter((_, i) => i !== index));
  };

  const handleChangeLocation = (index, value) => {
    const updated = [...selectedLocations];
    updated[index] = value;
    setSelectedLocations(updated);
  };

  return (
    <Routes>
      <Route
        path="/"
        element={
          <div className="app-container">
            <h1 className="form-title">
              {isRegistering ? 'Rejestracja' : 'Logowanie'}
            </h1>

            <div className="form-group">
              <label className="form-label">Email:</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Hasło:</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {isRegistering && (
              <>
                <div className="form-group">
                  <label className="form-label">Powtórz hasło:</label>
                  <input
                    type="password"
                    className="form-input"
                    value={repeatPassword}
                    onChange={(e) => setRepeatPassword(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Typ konta:</label>
                  <select
                    className="form-select"
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                  >
                    <option value="user">Użytkownik</option>
                    <option value="manager">Kierownik</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                {(accountType === 'user' || accountType === 'manager') && (
                  <div className="form-group">
                    <label className="form-label">Stanowiska (lokalizacje):</label>
                    {selectedLocations.map((loc, idx) => (
                      <div key={idx} className="location-item">
                        <select
                          className="form-select"
                          value={loc}
                          onChange={(e) => handleChangeLocation(idx, e.target.value)}
                        >
                          <option value="">-- Wybierz --</option>
                          {locationList.map((l) => (
                            <option key={l.id} value={l.id}>{l.address}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleRemoveLocation(idx)}
                          type="button"
                          className="remove-button"
                        >
                          X
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={handleAddLocation}
                      type="button"
                      className="add-location-button"
                    >
                      + Dodaj stanowisko
                    </button>
                  </div>
                )}
              </>
            )}

            {error && <p className="form-error">{error}</p>}

            <button
              onClick={isRegistering ? handleRegister : handleLogin}
              className="submit-button"
            >
              {isRegistering ? 'Zarejestruj się' : 'Zaloguj się'}
            </button>

            <p className="switch-text">
              {isRegistering ? 'Masz już konto?' : 'Nie masz jeszcze konta?'}{' '}
              <span
                onClick={() => setIsRegistering(!isRegistering)}
                className="switch-link"
              >
                {isRegistering ? 'Zaloguj się' : 'Zarejestruj się'}
              </span>
            </p>
          </div>
        }
      />
      <Route path="/admin" element={<AdminMainPage />} />
      <Route path="/manager" element={<ManagerMainPage />} />
      <Route path="/user" element={<UserMainPage />} />
      <Route path="/admin/magazyn" element={<Magazyn />} />
      <Route path="/admin/punkty" element={<Punkty />} />
      <Route path="/admin/premie" element={<Premie />} />
      <Route path="/user/otworz-stanowisko" element={<OtworzStanowisko />} />
      <Route path="/user/dodaj-usluge" element={<DodajUsluge />} />
    </Routes>
  );
}

export default App;
