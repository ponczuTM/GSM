// Admin.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import styles from "./Admin.module.css";

// Firebase (two imports: your wrapper + SDK helpers)
import { database, ref, onValue, remove, get } from "../FirebaseConfig";

/**
 * Minimal MD5 implementation (no deps).
 * Source pattern: classic JS MD5 implementations (RFC 1321) adapted for modern JS.
 * Returns lowercase hex.
 */
function md5(input) {
  function rotateLeft(lValue, iShiftBits) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }
  function addUnsigned(lX, lY) {
    const lX8 = lX & 0x80000000;
    const lY8 = lY & 0x80000000;
    const lX4 = lX & 0x40000000;
    const lY4 = lY & 0x40000000;
    const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
    if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    if (lX4 | lY4) {
      if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
      return lResult ^ 0x40000000 ^ lX8 ^ lY8;
    }
    return lResult ^ lX8 ^ lY8;
  }
  function F(x, y, z) {
    return (x & y) | (~x & z);
  }
  function G(x, y, z) {
    return (x & z) | (y & ~z);
  }
  function H(x, y, z) {
    return x ^ y ^ z;
  }
  function I(x, y, z) {
    return y ^ (x | ~z);
  }
  function FF(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function GG(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function HH(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function II(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  function convertToWordArray(str) {
    const msg = unescape(encodeURIComponent(str));
    const lMessageLength = msg.length;

    const lNumberOfWordsTemp1 = lMessageLength + 8;
    const lNumberOfWordsTemp2 = (lNumberOfWordsTemp1 - (lNumberOfWordsTemp1 % 64)) / 64;
    const lNumberOfWords = (lNumberOfWordsTemp2 + 1) * 16;

    const lWordArray = new Array(lNumberOfWords).fill(0);

    let lByteCount = 0;
    while (lByteCount < lMessageLength) {
      const lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      const lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (msg.charCodeAt(lByteCount) << lBytePosition);
      lByteCount++;
    }

    const lWordCount = (lByteCount - (lByteCount % 4)) / 4;
    const lBytePosition = (lByteCount % 4) * 8;
    lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
    return lWordArray;
  }
  function wordToHex(lValue) {
    let wordToHexValue = "";
    for (let lCount = 0; lCount <= 3; lCount++) {
      const lByte = (lValue >>> (lCount * 8)) & 255;
      const hex = "0" + lByte.toString(16);
      wordToHexValue += hex.substring(hex.length - 2, hex.length);
    }
    return wordToHexValue;
  }

  const x = convertToWordArray(String(input));

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const S11 = 7,
    S12 = 12,
    S13 = 17,
    S14 = 22;
  const S21 = 5,
    S22 = 9,
    S23 = 14,
    S24 = 20;
  const S31 = 4,
    S32 = 11,
    S33 = 16,
    S34 = 23;
  const S41 = 6,
    S42 = 10,
    S43 = 15,
    S44 = 21;

  for (let k = 0; k < x.length; k += 16) {
    const AA = a,
      BB = b,
      CC = c,
      DD = d;

    a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478);
    d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
    c = FF(c, d, a, b, x[k + 2], S13, 0x242070db);
    b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
    a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf);
    d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);
    c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613);
    b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
    a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8);
    d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
    c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1);
    b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
    a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122);
    d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);
    c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e);
    b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);

    a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562);
    d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);
    c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51);
    b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
    a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d);
    d = GG(d, a, b, c, x[k + 10], S22, 0x02441453);
    c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681);
    b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
    a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6);
    d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);
    c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87);
    b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
    a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905);
    d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
    c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9);
    b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);

    a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942);
    d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);
    c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122);
    b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
    a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44);
    d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
    c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);
    b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
    a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6);
    d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa);
    c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085);
    b = HH(b, c, d, a, x[k + 6], S34, 0x04881d05);
    a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039);
    d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
    c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);
    b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);

    a = II(a, b, c, d, x[k + 0], S41, 0xf4292244);
    d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);
    c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7);
    b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
    a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3);
    d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
    c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d);
    b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
    a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);
    d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
    c = II(c, d, a, b, x[k + 6], S43, 0xa3014314);
    b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
    a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82);
    d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);
    c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);
    b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);

    a = addUnsigned(a, AA);
    b = addUnsigned(b, BB);
    c = addUnsigned(c, CC);
    d = addUnsigned(d, DD);
  }

  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}

const PASSWORD_HASH = "670d365703e7c3f315416f72ac9e0072";

function parseDateTimeMs(dateKey, hour) {
  // dateKey: YYYY-MM-DD, hour: HH:mm
  // Treated as local time by most browsers (ISO without timezone).
  const h = (hour || "00:00").trim();
  const d = new Date(`${dateKey}T${h}:00`);
  return d.getTime();
}

function hoursDiffFromNow(dateKey, hour) {
  const ms = parseDateTimeMs(dateKey, hour);
  return (ms - Date.now()) / (1000 * 60 * 60);
}

function formatServices(cleaning) {
  const rows = [];

  const ssw = Number(cleaning.singleStandardWindowQuantity || 0);
  const dsw = Number(cleaning.doubleStandardWindowQuantity || 0);
  const bd = Number(cleaning.balconyDoorsQuantity || 0);
  const lg = Number(cleaning.largeGlassMetersQuantity || 0);

  // Jeśli masz w bazie stare pola – pokaż je też (żeby admin zawsze widział prawdę).
  const sBig = Number(cleaning.singleBigWindowQuantity || 0);
  const dBig = Number(cleaning.doubleBigWindowQuantity || 0);

  if (ssw > 0) rows.push(`Okna standardowe pojedyncze: ${ssw} szt.`);
  if (dsw > 0) rows.push(`Okna standardowe podwójne: ${dsw} szt.`);
  if (bd > 0) rows.push(`Drzwi balkonowe: ${bd} szt.`);
  if (lg > 0) rows.push(`Duże witryny: ${lg} m²`);

  if (sBig > 0) rows.push(`Okna DUŻE pojedyncze: ${sBig} szt.`);
  if (dBig > 0) rows.push(`Okna DUŻE podwójne: ${dBig} szt.`);

  return rows.length ? rows : ["(Brak pozycji usług — sprawdź dane w bazie)"];
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]); // [{ id, ...payload }]

  const [actionError, setActionError] = useState("");
  const [actionInfo, setActionInfo] = useState("");

  // Restore auth from sessionStorage
  useEffect(() => {
    try {
      const flag = sessionStorage.getItem("adminAuthed");
      if (flag === "true") setAuthed(true);
    } catch {
      // ignore
    }
  }, []);

  // Load cleanings (only when authed)
  useEffect(() => {
    if (!authed) return;

    setLoading(true);
    setActionError("");
    setActionInfo("");

    const cleaningsRef = ref(database, "Cleanings");
    const unsubscribe = onValue(
      cleaningsRef,
      (snap) => {
        const val = snap.val() || {};
        const arr = Object.entries(val).map(([id, payload]) => ({
          id,
          ...payload,
        }));
        setItems(arr);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setActionError("Nie udało się wczytać danych z Firebase.");
        setLoading(false);
      }
    );

    return () => {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    };
  }, [authed]);

  const sortedItems = useMemo(() => {
    const arr = [...items];

    const now = Date.now();

    arr.sort((a, b) => {
      const aMs = parseDateTimeMs(a.date, a.Hour);
      const bMs = parseDateTimeMs(b.date, b.Hour);

      const aIsFuture = aMs >= now;
      const bIsFuture = bMs >= now;

      // Future first (closest upcoming at top)
      if (aIsFuture && bIsFuture) return aMs - bMs;

      // Past last (most recent past first)
      if (!aIsFuture && !bIsFuture) return bMs - aMs;

      // Future before past
      return aIsFuture ? -1 : 1;
    });

    return arr;
  }, [items]);

  const handleLogin = useCallback(
    (e) => {
      e.preventDefault();
      setLoginError("");

      const hash = md5(password);
      if (hash === PASSWORD_HASH) {
        setAuthed(true);
        setPassword("");
        try {
          sessionStorage.setItem("adminAuthed", "true");
        } catch {
          // ignore
        }
      } else {
        setLoginError("Złe hasło.");
      }
    },
    [password]
  );

  const handleLogout = () => {
    setAuthed(false);
    setItems([]);
    setActionError("");
    setActionInfo("");
    try {
      sessionStorage.removeItem("adminAuthed");
    } catch {
      // ignore
    }
  };

  const cardToneClass = (dateKey, hour) => {
    const h = hoursDiffFromNow(dateKey, hour);

    // jeśli już po terminie – traktuję jak "pilne" (czerwone), bo zwykle trzeba to ogarnąć
    if (h <= 72) return styles.cardRed;
    if (h <= 144) return styles.cardYellow;
    return styles.cardGreen;
  };

  const handleDelete = async (cleaning) => {
    setActionError("");
    setActionInfo("");

    const ok = window.confirm(`Usunąć usługę z dnia ${cleaning.date} (${cleaning.Hour || "—"})?`);
    if (!ok) return;

    try {
      // 1) usuń rekord w Cleanings/{id}
      await remove(ref(database, `Cleanings/${cleaning.id}`));

      // 2) usuń index CleaningByDate/{date} tylko jeśli wskazuje na to ID
      // (żeby nie skasować komuś innej rezerwacji w razie ręcznych zmian)
      const idxRef = ref(database, `CleaningByDate/${cleaning.date}`);
      const snap = await get(idxRef);
      if (snap.exists() && snap.val() === cleaning.id) {
        await remove(idxRef);
      }

      setActionInfo("Usunięto usługę.");
    } catch (err) {
      console.error(err);
      setActionError("Nie udało się usunąć. Sprawdź uprawnienia / reguły bazy.");
    }
  };

  if (!authed) {
    return (
      <div className={styles.page}>
        <div className={styles.loginWrap}>
          <div className={styles.loginCard}>
            <div className={styles.loginTitle}>Panel admina</div>
            <div className={styles.loginSubtitle}>Podaj hasło, żeby wejść.</div>

            <form className={styles.loginForm} onSubmit={handleLogin}>
              <input
                className={styles.loginInput}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Hasło"
                autoFocus
              />
              <button className={styles.loginButton} type="submit">
                Wejdź
              </button>
            </form>

            {loginError && <div className={styles.loginError}>{loginError}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Admin — rezerwacje</h1>
          <div className={styles.subtitle}>
            Sortowanie: najbliższe przyszłe terminy na górze, przeszłe na dole.
          </div>
        </div>

        <button className={styles.logoutButton} type="button" onClick={handleLogout}>
          Wyloguj
        </button>
      </header>

      {(actionError || actionInfo) && (
        <div className={styles.messages}>
          {actionError && <div className={`${styles.message} ${styles.messageError}`}>{actionError}</div>}
          {actionInfo && <div className={`${styles.message} ${styles.messageInfo}`}>{actionInfo}</div>}
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>Ładowanie…</div>
      ) : sortedItems.length === 0 ? (
        <div className={styles.empty}>Brak rezerwacji.</div>
      ) : (
        <div className={styles.grid}>
          {sortedItems.map((c) => {
            const clientFull = `${(c.clientName || "").trim()} ${(c.clientSurname || "").trim()}`.trim() || "—";
            const phone = (c.clientPhone || "").trim() || "—";
            const mail = (c.clientmail || "").trim() || "—";
            const date = c.date || "—";
            const hour = c.Hour || "—";
            const price = Number(c.OverallPrice || 0);

            const serviceLines = formatServices(c);
            const hLeft = hoursDiffFromNow(c.date, c.Hour);
            const hBadge =
              Number.isFinite(hLeft) && c.date
                ? hLeft >= 0
                  ? `za ~${Math.round(hLeft)}h`
                  : `-${Math.round(Math.abs(hLeft))}h po terminie`
                : "";

            return (
              <div key={c.id} className={`${styles.card} ${cardToneClass(c.date, c.Hour)}`}>
                <div className={styles.cardTop}>
                  <div className={styles.cardTitle}>
                    <span className={styles.cardDate}>
                      {date} • {hour}
                    </span>
                    {hBadge && <span className={styles.badge}>{hBadge}</span>}
                  </div>
                  <div className={styles.cardId}>ID: {c.id}</div>
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Dane klienta</div>
                  <div className={styles.row}>
                    <span className={styles.label}>Klient:</span>
                    <span className={styles.value}>{clientFull}</span>
                  </div>
                  <div className={styles.row}>
                    <span className={styles.label}>Telefon:</span>
                    <span className={styles.value}>{phone}</span>
                  </div>
                  <div className={styles.row}>
                    <span className={styles.label}>Email:</span>
                    <span className={styles.value}>{mail}</span>
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionTitle}>Zakres usługi</div>
                  <ul className={styles.services}>
                    {serviceLines.map((line) => (
                      <li key={line} className={styles.serviceItem}>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={styles.footer}>
                  <div className={styles.earnings}>
                    <span className={styles.earningsLabel}>Zarobek całkowity:</span>
                    <span className={styles.earningsValue}>{price} zł</span>
                  </div>

                  <button className={styles.deleteButton} type="button" onClick={() => handleDelete(c)}>
                    Usuń usługę
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}