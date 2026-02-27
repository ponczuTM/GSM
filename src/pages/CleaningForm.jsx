import React, { useEffect, useMemo, useState } from "react";
import styles from "./CleaningForm.module.css";
import { useNavigate } from "react-router-dom";

import { database, ref, set, onValue, get, push, remove } from "../FirebaseConfig";

// Do atomowego "zajęcia dnia" używamy transakcji:
import { runTransaction } from "firebase/database";

import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";

import { format, parse, startOfWeek, getDay, addDays, startOfDay, endOfDay } from "date-fns";
import pl from "date-fns/locale/pl";

const locales = { pl };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: pl }),
  getDay,
  locales,
});

const HOURS = ["16:30", "17:00", "17:30", "18:00"];

const PRICES = {
  singleStandard: 30,
  doubleStandard: 60,
  singleBig: 45,
  doubleBig: 90,
  balconyDoor: 60,
  largeGlassPerM2: 8,
};

function toInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function toNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function dateKeyFromDate(d) {
  // yyyy-MM-dd w lokalnej strefie użytkownika
  return format(d, "yyyy-MM-dd");
}

function isPastDay(d) {
  const todayStart = startOfDay(new Date());
  return startOfDay(d).getTime() < todayStart.getTime();
}

function isWeekend(d) {
  const day = d.getDay(); // 0 = niedziela, 6 = sobota
  return day === 0 || day === 6;
}

export default function CleaningForm() {
  const navigate = useNavigate();

  // Dane klienta
  const [clientName, setClientName] = useState("");
  const [clientSurname, setClientSurname] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientMail, setClientMail] = useState("");

  // Ilości
  const [singleStandardWindowQuantity, setSingleStandardWindowQuantity] = useState(0);
  const [doubleStandardWindowQuantity, setDoubleStandardWindowQuantity] = useState(0);
  const [singleBigWindowQuantity, setSingleBigWindowQuantity] = useState(0);
  const [doubleBigWindowQuantity, setDoubleBigWindowQuantity] = useState(0);
  const [balconyDoorsQuantity, setBalconyDoorsQuantity] = useState(0);
  const [largeGlassMetersQuantity, setLargeGlassMetersQuantity] = useState(0); // m2 (może być ułamkowe)

  // Terminy
  const [selectedDate, setSelectedDate] = useState(null); // Date
  const [selectedHour, setSelectedHour] = useState("");

  // Domyślnie tylko dni robocze
  const [showWeekends, setShowWeekends] = useState(false);

  // Zajęte dni (indeks)
  const [reservedDates, setReservedDates] = useState(new Set());

  // UI
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pobieramy rezerwacje dni (CleaningDates/{yyyy-MM-dd})
  useEffect(() => {
    const datesRef = ref(database, "CleaningDates");
    const unsub = onValue(datesRef, (snap) => {
      const val = snap.val() || {};
      const keys = Object.keys(val);
      setReservedDates(new Set(keys));
    });

    // onValue w RTDB zwraca funkcję odpięcia w SDK v9
    return () => unsub();
  }, []);

  const overallPrice = useMemo(() => {
    const sStd = toInt(singleStandardWindowQuantity) * PRICES.singleStandard;
    const dStd = toInt(doubleStandardWindowQuantity) * PRICES.doubleStandard;
    const sBig = toInt(singleBigWindowQuantity) * PRICES.singleBig;
    const dBig = toInt(doubleBigWindowQuantity) * PRICES.doubleBig;
    const balc = toInt(balconyDoorsQuantity) * PRICES.balconyDoor;
    const glass = toNumber(largeGlassMetersQuantity) * PRICES.largeGlassPerM2;

    // Zaokrąglamy do 2 miejsc (jakby m2 były ułamkowe)
    return Math.round((sStd + dStd + sBig + dBig + balc + glass) * 100) / 100;
  }, [
    singleStandardWindowQuantity,
    doubleStandardWindowQuantity,
    singleBigWindowQuantity,
    doubleBigWindowQuantity,
    balconyDoorsQuantity,
    largeGlassMetersQuantity,
  ]);

  const summaryItems = useMemo(() => {
    const items = [
      {
        label: "Okna standardowe pojedyncze",
        qty: toInt(singleStandardWindowQuantity),
        price: PRICES.singleStandard,
      },
      {
        label: "Okna standardowe podwójne",
        qty: toInt(doubleStandardWindowQuantity),
        price: PRICES.doubleStandard,
      },
      { label: "Okna duże pojedyncze", qty: toInt(singleBigWindowQuantity), price: PRICES.singleBig },
      { label: "Okna duże podwójne", qty: toInt(doubleBigWindowQuantity), price: PRICES.doubleBig },
      { label: "Drzwi balkonowe", qty: toInt(balconyDoorsQuantity), price: PRICES.balconyDoor },
      {
        label: "Duże witryny (m²)",
        qty: toNumber(largeGlassMetersQuantity),
        price: PRICES.largeGlassPerM2,
        unit: "m²",
      },
    ];
    return items.filter((x) => x.qty > 0);
  }, [
    singleStandardWindowQuantity,
    doubleStandardWindowQuantity,
    singleBigWindowQuantity,
    doubleBigWindowQuantity,
    balconyDoorsQuantity,
    largeGlassMetersQuantity,
  ]);

  const calendarEvents = useMemo(() => {
    // Robimy event “Zajęte” na cały dzień (ładny sygnał w kalendarzu)
    return Array.from(reservedDates).map((dk) => {
      const d = parse(dk, "yyyy-MM-dd", new Date());
      return {
        title: "Zajęte",
        start: startOfDay(d),
        end: endOfDay(d),
        allDay: true,
      };
    });
  }, [reservedDates]);

  function isDateSelectable(d) {
    if (!d) return false;

    // Blokujemy przeszłość
    if (isPastDay(d)) return false;

    // Weekendy blokowane domyślnie
    if (!showWeekends && isWeekend(d)) return false;

    // Jeśli zarezerwowane, to nie do wyboru
    const dk = dateKeyFromDate(d);
    if (reservedDates.has(dk)) return false;

    return true;
  }

  function handleSelectSlot(slotInfo) {
    setError("");
    setInfo("");

    const picked = slotInfo?.start ? startOfDay(slotInfo.start) : null;
    if (!picked) return;

    if (!isDateSelectable(picked)) {
      if (isPastDay(picked)) setError("Nie możesz wybrać terminu w przeszłości.");
      else if (!showWeekends && isWeekend(picked)) setError("Weekend jest zablokowany (domyślnie wybieramy dni robocze).");
      else setError("Ten dzień jest już zajęty.");
      return;
    }

    setSelectedDate(picked);
  }

  function dayPropGetter(date) {
    const d = startOfDay(date);
    const dk = dateKeyFromDate(d);

    const disabled =
      isPastDay(d) ||
      (!showWeekends && isWeekend(d)) ||
      reservedDates.has(dk);

    if (disabled) {
      return {
        className: styles.disabledDay,
      };
    }
    return {
      className: styles.enabledDay,
    };
  }

  function eventPropGetter() {
    return {
      className: styles.reservedEvent,
    };
  }

  function validate() {
    const nameOk = clientName.trim().length >= 2;
    const surnameOk = clientSurname.trim().length >= 2;
    const phoneOk = clientPhone.trim().length >= 6;

    if (!nameOk) return "Podaj imię (min. 2 znaki).";
    if (!surnameOk) return "Podaj nazwisko (min. 2 znaki).";
    if (!phoneOk) return "Podaj poprawny numer telefonu.";

    if (overallPrice <= 0) return "Wybierz co najmniej jedną usługę (ilość > 0), inaczej cena wyniesie 0.";

    if (!selectedDate) return "Wybierz dzień w kalendarzu.";
    if (!selectedHour) return "Wybierz godzinę.";

    if (!isDateSelectable(selectedDate)) return "Ten termin nie jest już dostępny.";

    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setIsSubmitting(true);

    const dk = dateKeyFromDate(selectedDate);

    // 1) Przygotuj ID wpisu w Cleanings
    const newCleaningRef = push(ref(database, "Cleanings"));
    const cleaningId = newCleaningRef.key;

    if (!cleaningId) {
      setIsSubmitting(false);
      setError("Nie udało się wygenerować ID rezerwacji. Spróbuj ponownie.");
      return;
    }

    // 2) Atomowo zajmij dzień: CleaningDates/{yyyy-MM-dd} = { cleaningId, reservedAt }
    const lockRef = ref(database, `CleaningDates/${dk}`);

    try {
      const txResult = await runTransaction(lockRef, (currentData) => {
        // jeśli już istnieje, ktoś zajął
        if (currentData) return currentData;

        return {
          cleaningId,
          reservedAt: Date.now(),
        };
      });

      if (!txResult.committed) {
        setIsSubmitting(false);
        setError("Ktoś zarezerwował ten termin w międzyczasie. Wybierz inny dzień.");
        return;
      }

      // Jeżeli transakcja zwróciła istniejące dane (czyli nie my), też traktuj jako zajęte
      const after = txResult.snapshot.val();
      if (!after || after.cleaningId !== cleaningId) {
        setIsSubmitting(false);
        setError("Ktoś zarezerwował ten termin w międzyczasie. Wybierz inny dzień.");
        return;
      }

      // 3) Zapisz właściwe dane w Cleanings/{id}
      const payload = {
        clientName: clientName.trim(),
        clientSurname: clientSurname.trim(),
        clientPhone: clientPhone.trim(),
        clientmail: clientMail.trim() || "",
        date: dk,
        Hour: selectedHour,

        singleStandardWindowQuantity: toInt(singleStandardWindowQuantity),
        doubleStandardWindowQuantity: toInt(doubleStandardWindowQuantity),
        singleBigWindowQuantity: toInt(singleBigWindowQuantity),
        doubleBigWindowQuantity: toInt(doubleBigWindowQuantity),
        balconyDoorsQuantity: toInt(balconyDoorsQuantity),
        largeGlassMetersQuantity: toNumber(largeGlassMetersQuantity),

        OverallPrice: overallPrice,
        createdAt: Date.now(),
      };

      await set(ref(database, `Cleanings/${cleaningId}`), payload);

      // 4) localStorage + redirect
      localStorage.setItem("reserved", "true");
      navigate("/");
    } catch (err) {
      // Jeśli coś wywaliło się po locku, spróbuj odblokować dzień
      try {
        await remove(ref(database, `CleaningDates/${dk}`));
      } catch {
        // Nie spamuj usera – i tak pokażemy główny błąd
      }
      setError("Wystąpił błąd podczas rezerwacji. Spróbuj ponownie.");
      // Dla Ciebie (dev):
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return "";
    return format(selectedDate, "EEEE, d MMMM yyyy", { locale: pl });
  }, [selectedDate]);

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>Zamów mycie okien</h2>

      <form className={styles.form} onSubmit={handleSubmit}>
        <section className={styles.card}>
          <h3 className={styles.sectionTitle}>Dane klienta</h3>

          <div className={styles.grid2}>
            <label className={styles.label}>
              Imię
              <input
                className={styles.input}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Jan"
                autoComplete="given-name"
              />
            </label>

            <label className={styles.label}>
              Nazwisko
              <input
                className={styles.input}
                value={clientSurname}
                onChange={(e) => setClientSurname(e.target.value)}
                placeholder="Kowalski"
                autoComplete="family-name"
              />
            </label>
          </div>

          <div className={styles.grid2}>
            <label className={styles.label}>
              Numer telefonu
              <input
                className={styles.input}
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="np. 500 600 700"
                inputMode="tel"
                autoComplete="tel"
              />
            </label>

            <label className={styles.label}>
              Email (opcjonalnie)
              <input
                className={styles.input}
                value={clientMail}
                onChange={(e) => setClientMail(e.target.value)}
                placeholder="np. jan@domena.pl"
                inputMode="email"
                autoComplete="email"
              />
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <h3 className={styles.sectionTitle}>Wybierz ilości</h3>

          <div className={styles.itemsGrid}>
            <div className={styles.item}>
              <div className={styles.itemHeader}>
                <div className={styles.itemName}>Okna standardowe pojedyncze</div>
                <div className={styles.itemPrice}>30 zł / szt.</div>
              </div>
              <input
                className={styles.qty}
                type="number"
                min="0"
                step="1"
                value={singleStandardWindowQuantity}
                onChange={(e) => setSingleStandardWindowQuantity(e.target.value)}
              />
            </div>

            <div className={styles.item}>
              <div className={styles.itemHeader}>
                <div className={styles.itemName}>Okna standardowe podwójne</div>
                <div className={styles.itemPrice}>60 zł / szt.</div>
              </div>
              <input
                className={styles.qty}
                type="number"
                min="0"
                step="1"
                value={doubleStandardWindowQuantity}
                onChange={(e) => setDoubleStandardWindowQuantity(e.target.value)}
              />
            </div>

            <div className={styles.item}>
              <div className={styles.itemHeader}>
                <div className={styles.itemName}>Okna duże pojedyncze</div>
                <div className={styles.itemPrice}>45 zł / szt.</div>
              </div>
              <input
                className={styles.qty}
                type="number"
                min="0"
                step="1"
                value={singleBigWindowQuantity}
                onChange={(e) => setSingleBigWindowQuantity(e.target.value)}
              />
            </div>

            <div className={styles.item}>
              <div className={styles.itemHeader}>
                <div className={styles.itemName}>Okna duże podwójne</div>
                <div className={styles.itemPrice}>90 zł / szt.</div>
              </div>
              <input
                className={styles.qty}
                type="number"
                min="0"
                step="1"
                value={doubleBigWindowQuantity}
                onChange={(e) => setDoubleBigWindowQuantity(e.target.value)}
              />
            </div>

            <div className={styles.item}>
              <div className={styles.itemHeader}>
                <div className={styles.itemName}>Drzwi balkonowe</div>
                <div className={styles.itemPrice}>60 zł / szt.</div>
              </div>
              <input
                className={styles.qty}
                type="number"
                min="0"
                step="1"
                value={balconyDoorsQuantity}
                onChange={(e) => setBalconyDoorsQuantity(e.target.value)}
              />
            </div>

            <div className={styles.item}>
              <div className={styles.itemHeader}>
                <div className={styles.itemName}>Duże witryny</div>
                <div className={styles.itemPrice}>8 zł / m²</div>
              </div>
              <input
                className={styles.qty}
                type="number"
                min="0"
                step="0.5"
                value={largeGlassMetersQuantity}
                onChange={(e) => setLargeGlassMetersQuantity(e.target.value)}
                placeholder="np. 12.5"
              />
            </div>
          </div>

          <div className={styles.summary}>
            <div className={styles.summaryLeft}>
              <div className={styles.summaryTitle}>Podsumowanie</div>
              {summaryItems.length === 0 ? (
                <div className={styles.muted}>Brak pozycji. Wpisz ilości, żeby zobaczyć cenę.</div>
              ) : (
                <ul className={styles.summaryList}>
                  {summaryItems.map((it) => {
                    const line = Math.round(it.qty * it.price * 100) / 100;
                    return (
                      <li key={it.label} className={styles.summaryRow}>
                        <span>
                          {it.label} — {it.qty} {it.unit || "szt."} × {it.price} zł
                        </span>
                        <strong>{line} zł</strong>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className={styles.summaryRight}>
              <div className={styles.totalLabel}>Razem</div>
              <div className={styles.totalValue}>{overallPrice.toFixed(2)} zł</div>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.calendarHeader}>
            <h3 className={styles.sectionTitle}>Wybierz dzień</h3>

            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={showWeekends}
                onChange={(e) => setShowWeekends(e.target.checked)}
              />
              Pokaż weekendy
            </label>
          </div>

          <div className={styles.calendarWrap}>
            <Calendar
              localizer={localizer}
              culture="pl"
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              views={["month", "week", "day"]}
              defaultView="month"
              selectable
              onSelectSlot={handleSelectSlot}
              popup
              dayPropGetter={dayPropGetter}
              eventPropGetter={eventPropGetter}
              messages={{
                next: "Następny",
                previous: "Poprzedni",
                today: "Dziś",
                month: "Miesiąc",
                week: "Tydzień",
                day: "Dzień",
                agenda: "Agenda",
                date: "Data",
                time: "Godzina",
                event: "Wydarzenie",
                noEventsInRange: "Brak",
              }}
            />
          </div>

          <div className={styles.pickedBar}>
            <div>
              <div className={styles.pickedLabel}>Wybrany dzień</div>
              <div className={styles.pickedValue}>{selectedDate ? selectedDateLabel : "—"}</div>
            </div>

            <div>
              <div className={styles.pickedLabel}>Godzina</div>
              <div className={styles.hours}>
                {HOURS.map((h) => (
                  <button
                    type="button"
                    key={h}
                    className={`${styles.hourBtn} ${selectedHour === h ? styles.hourBtnActive : ""}`}
                    onClick={() => setSelectedHour(h)}
                    disabled={!selectedDate || isSubmitting}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.notice}>
            <span className={styles.dotFree} /> wolne
            <span className={styles.dotBusy} /> zajęte
            <span className={styles.dotDisabled} /> zablokowane
          </div>
        </section>

        {(error || info) && (
          <div className={`${styles.alert} ${error ? styles.alertError : styles.alertInfo}`}>
            {error || info}
          </div>
        )}

        <button className={styles.submit} type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Rezerwuję..." : "Zamów usługę"}
        </button>

        <div className={styles.smallPrint}>
          Jedna usługa na dzień. Jeśli ktoś zarezerwuje termin w trakcie, zobaczysz komunikat i wybierzesz inny dzień.
        </div>
      </form>
    </div>
  );
}