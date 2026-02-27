// CleaningForm.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./CleaningForm.module.css";

// Firebase (two imports: your wrapper + runTransaction from SDK)
import { database, ref, onValue, get, set, push, remove } from "../FirebaseConfig";
import { runTransaction } from "firebase/database";

// FullCalendar
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import plLocale from "@fullcalendar/core/locales/pl";

// ICONS
import singleWindow from "../assets/images/singleWindow.png";
import doubleWindow from "../assets/images/doubleWindow.png";
import balconyDoor from "../assets/images/balconyDoor.png";
import largeGlass from "../assets/images/largeGlass.png";

// Helpers
const pad2 = (n) => String(n).padStart(2, "0");
const toDateKey = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = pad2(dateObj.getMonth() + 1);
  const d = pad2(dateObj.getDate());
  return `${y}-${m}-${d}`;
};
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const HOURS = ["16:30", "17:00", "17:30", "18:00"];

const PRICE = {
  singleStandard: 30,
  doubleStandard: 60,
  balconyDoor: 70,
  largeGlassPerM2: 8,
};

const clampInt = (value, min = 0, max = 999) => {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
};

export default function CleaningForm() {
  const navigate = useNavigate();

  // ✅ NEW: global success overlay after refresh
  const [showReservedToast, setShowReservedToast] = useState(false);

  // Client fields
  const [clientName, setClientName] = useState("");
  const [clientSurname, setClientSurname] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientMail, setClientMail] = useState("");

  // Quantities (bez DUŻYCH okien)
  const [singleStandardWindowQuantity, setSingleStandardWindowQuantity] = useState(0);
  const [doubleStandardWindowQuantity, setDoubleStandardWindowQuantity] = useState(0);
  const [balconyDoorsQuantity, setBalconyDoorsQuantity] = useState(0);
  const [largeGlassMetersQuantity, setLargeGlassMetersQuantity] = useState(0); // m2

  // Calendar selection
  const [selectedDateKey, setSelectedDateKey] = useState(""); // YYYY-MM-DD
  const [selectedHour, setSelectedHour] = useState("");

  // Reserved dates index
  const [reservedByDate, setReservedByDate] = useState({}); // { "YYYY-MM-DD": "<cleaningId>" }
  const reservedDateKeys = useMemo(() => new Set(Object.keys(reservedByDate || {})), [reservedByDate]);

  // UI states
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formInfo, setFormInfo] = useState("");

  // ✅ NEW: check localStorage reserved:true and show overlay for 10s, then remove immediately
  useEffect(() => {
    try {
      const flag = localStorage.getItem("reserved");
      if (flag === "true") {
        setShowReservedToast(true);

        // remove immediately after showing
        localStorage.removeItem("reserved");

        const t = setTimeout(() => setShowReservedToast(false), 10_000);
        return () => clearTimeout(t);
      }
    } catch {
      // ignore
    }
  }, []);

  // Total price
  const overallPrice = useMemo(() => {
    const total =
      singleStandardWindowQuantity * PRICE.singleStandard +
      doubleStandardWindowQuantity * PRICE.doubleStandard +
      balconyDoorsQuantity * PRICE.balconyDoor +
      largeGlassMetersQuantity * PRICE.largeGlassPerM2;

    return Math.max(0, Math.round(total));
  }, [singleStandardWindowQuantity, doubleStandardWindowQuantity, balconyDoorsQuantity, largeGlassMetersQuantity]);

  const hasAnyService = useMemo(() => {
    return (
      singleStandardWindowQuantity +
        doubleStandardWindowQuantity +
        balconyDoorsQuantity +
        largeGlassMetersQuantity >
      0
    );
  }, [singleStandardWindowQuantity, doubleStandardWindowQuantity, balconyDoorsQuantity, largeGlassMetersQuantity]);

  // Load reserved index: CleaningByDate/{YYYY-MM-DD} = cleaningId
  useEffect(() => {
    const idxRef = ref(database, "CleaningByDate");
    const unsubscribe = onValue(
      idxRef,
      (snap) => {
        setReservedByDate(snap.val() || {});
        setLoadingCalendar(false);
      },
      (err) => {
        console.error(err);
        setLoadingCalendar(false);
      }
    );

    return () => {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    };
  }, []);

  const isDateSelectable = useCallback(
    (dateObj) => {
      const day = dateObj.getDay(); // 0 Sun, 6 Sat
      if (day === 0 || day === 6) return false;

      const today = startOfToday();
      const d = new Date(dateObj);
      d.setHours(0, 0, 0, 0);
      if (d < today) return false;

      const key = toDateKey(dateObj);
      if (reservedDateKeys.has(key)) return false;

      return true;
    },
    [reservedDateKeys]
  );

  const buildLineItems = useMemo(() => {
    const items = [];

    if (singleStandardWindowQuantity > 0) {
      items.push({
        label: "Okna standardowe pojedyncze",
        qty: singleStandardWindowQuantity,
        unit: "szt.",
        unitPrice: PRICE.singleStandard,
        sum: singleStandardWindowQuantity * PRICE.singleStandard,
      });
    }
    if (doubleStandardWindowQuantity > 0) {
      items.push({
        label: "Okna standardowe podwójne",
        qty: doubleStandardWindowQuantity,
        unit: "szt.",
        unitPrice: PRICE.doubleStandard,
        sum: doubleStandardWindowQuantity * PRICE.doubleStandard,
      });
    }
    if (balconyDoorsQuantity > 0) {
      items.push({
        label: "Drzwi balkonowe",
        qty: balconyDoorsQuantity,
        unit: "szt.",
        unitPrice: PRICE.balconyDoor,
        sum: balconyDoorsQuantity * PRICE.balconyDoor,
      });
    }
    if (largeGlassMetersQuantity > 0) {
      items.push({
        label: "Duże witryny",
        qty: largeGlassMetersQuantity,
        unit: "m²",
        unitPrice: PRICE.largeGlassPerM2,
        sum: largeGlassMetersQuantity * PRICE.largeGlassPerM2,
      });
    }

    return items;
  }, [singleStandardWindowQuantity, doubleStandardWindowQuantity, balconyDoorsQuantity, largeGlassMetersQuantity]);

  const resetMessages = () => {
    setFormError("");
    setFormInfo("");
  };

  const handleDateClick = useCallback(
    (arg) => {
      resetMessages();

      const dateObj = arg.date;
      if (!isDateSelectable(dateObj)) {
        const key = toDateKey(dateObj);
        if (reservedDateKeys.has(key)) {
          setFormError("Ten termin jest już zajęty. Wybierz inny dzień.");
        } else {
          setFormError("Nie możesz wybrać tego dnia.");
        }
        return;
      }

      const key = toDateKey(dateObj);
      setSelectedDateKey(key);
      setSelectedHour("");
      setFormInfo(`Wybrano dzień: ${key}`);
    },
    [isDateSelectable, reservedDateKeys]
  );

  const handleHourPick = (hour) => {
    resetMessages();
    setSelectedHour(hour);
  };

  const validate = () => {
    if (!clientName.trim()) return "Podaj imię.";
    if (!clientSurname.trim()) return "Podaj nazwisko.";
    if (!clientPhone.trim()) return "Podaj numer telefonu.";
    if (!hasAnyService) return "Wybierz przynajmniej jedną pozycję usługi.";
    if (!selectedDateKey) return "Wybierz dzień w kalendarzu.";
    if (!selectedHour) return "Wybierz godzinę.";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    resetMessages();

    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }

    if (reservedDateKeys.has(selectedDateKey)) {
      setFormError("Ktoś już zarezerwował ten termin. Wybierz inny dzień.");
      return;
    }

    setSubmitting(true);

    const dateKey = selectedDateKey;
    const indexRef = ref(database, `CleaningByDate/${dateKey}`);

    let reservedNow = false;

    try {
      const txResult = await runTransaction(indexRef, (current) => {
        if (current) return;
        return "RESERVED";
      });

      if (!txResult.committed) {
        setFormError("Ktoś już zarezerwował ten termin w międzyczasie. Wybierz inny dzień.");
        setSubmitting(false);
        return;
      }

      reservedNow = true;

      const cleaningsRef = ref(database, "Cleanings");
      const newCleaningRef = push(cleaningsRef);
      const id = newCleaningRef.key;

      if (!id) throw new Error("Nie udało się wygenerować ID rezerwacji.");

      const payload = {
        clientName: clientName.trim(),
        clientSurname: clientSurname.trim(),
        clientPhone: clientPhone.trim(),
        clientmail: clientMail.trim() || "",
        date: dateKey,
        Hour: selectedHour,

        singleStandardWindowQuantity,
        doubleStandardWindowQuantity,
        balconyDoorsQuantity,
        largeGlassMetersQuantity,

        OverallPrice: overallPrice,
        createdAt: Date.now(),
      };

      await set(ref(database, `Cleanings/${id}`), payload);
      await set(ref(database, `CleaningByDate/${dateKey}`), id);

      // ✅ NEW: set flag then force refresh (hard reload on home)
      try {
        localStorage.setItem("reserved", "true");
      } catch {
        // ignore
      }

      // Navigate not needed if we hard-refresh, but leaving it would be pointless.
      // We do a full refresh to ensure everything reloads.
      window.location.href = "/";
    } catch (error) {
      console.error(error);

      if (reservedNow) {
        try {
          const current = await get(ref(database, `CleaningByDate/${selectedDateKey}`));
          if (current.exists()) {
            await remove(ref(database, `CleaningByDate/${selectedDateKey}`));
          }
        } catch (rollbackErr) {
          console.error("Rollback error:", rollbackErr);
        }
      }

      setFormError("Coś poszło nie tak podczas rezerwacji. Spróbuj ponownie.");
    } finally {
      setSubmitting(false);
    }
  };

  const quantityOptions = useMemo(() => Array.from({ length: 31 }, (_, i) => i), []);

  return (
    <div className={styles.cleaningFormPage}>
      {/* ✅ NEW: success overlay */}
      {showReservedToast && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(0,0,0,0.35)",
          }}
          aria-live="polite"
          role="status"
        >
          <div
            style={{
              maxWidth: 820,
              width: "100%",
              borderRadius: 14,
              padding: "18px 20px",
              background: "#1f9d55",
              color: "white",
              fontWeight: 600,
              lineHeight: 1.35,
              boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
              textAlign: "center",
            }}
          >
            Przyjęto rezerwację - niedługo skontaktuje się z Tobą nasz pracownik w celu potwierdzenia wizyty.
          </div>
        </div>
      )}

      <div className={styles.cleaningFormContainer}>
        <header className={styles.cleaningFormHeader}>
          <h1 className={styles.cleaningFormTitle}>Zamów mycie okien</h1>
          <p className={styles.cleaningFormSubtitle}>
            Wypełnij dane, wybierz zakres usługi, termin i godzinę. Jedna rezerwacja = jeden dzień.
          </p>
        </header>

        <form className={styles.cleaningForm} onSubmit={handleSubmit}>
          {/* Client data */}
          <section className={`${styles.cleaningFormSection} ${styles.cleaningFormSectionClient}`}>
            <h2 className={styles.sectionTitle}>Dane klienta</h2>

            <div className={`${styles.fieldGrid} ${styles.fieldGridTwoCols}`}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="clientName">
                  Imię <span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  id="clientName"
                  className={styles.fieldInput}
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  autoComplete="given-name"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="clientSurname">
                  Nazwisko <span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  id="clientSurname"
                  className={styles.fieldInput}
                  type="text"
                  value={clientSurname}
                  onChange={(e) => setClientSurname(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className={`${styles.fieldGrid} ${styles.fieldGridTwoCols}`}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="clientPhone">
                  Numer telefonu <span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  id="clientPhone"
                  className={styles.fieldInput}
                  type="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="clientMail">
                  Adres email <span className={styles.fieldOptional}>(opcjonalne)</span>
                </label>
                <input
                  id="clientMail"
                  className={styles.fieldInput}
                  type="email"
                  value={clientMail}
                  onChange={(e) => setClientMail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>
          </section>

          {/* Service selection */}
          <section className={`${styles.cleaningFormSection} ${styles.cleaningFormSectionService}`}>
            <h2 className={styles.sectionTitle}>Zakres usługi</h2>

            <div className={styles.serviceGrid}>
              {/* 1 */}
              <div className={styles.serviceRow}>
                <div className={styles.serviceLeft}>
                  <div className={styles.serviceIconWrap}>
                    <img
                      className={styles.serviceIcon}
                      src={singleWindow}
                      alt="Okna standardowe pojedyncze"
                      loading="lazy"
                    />
                  </div>

                  <div className={styles.serviceMeta}>
                    <div className={styles.serviceName}>Okna standardowe pojedyncze</div>
                    <div className={styles.servicePrice}>{PRICE.singleStandard} zł / szt.</div>
                  </div>
                </div>

                <div className={styles.serviceControl}>
                  <select
                    className={styles.selectInput}
                    value={singleStandardWindowQuantity}
                    onChange={(e) => setSingleStandardWindowQuantity(clampInt(e.target.value, 0, 999))}
                  >
                    {quantityOptions.map((n) => (
                      <option key={`ssw-${n}`} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2 */}
              <div className={styles.serviceRow}>
                <div className={styles.serviceLeft}>
                  <div className={styles.serviceIconWrap}>
                    <img
                      className={styles.serviceIcon}
                      src={doubleWindow}
                      alt="Okna standardowe podwójne"
                      loading="lazy"
                    />
                  </div>

                  <div className={styles.serviceMeta}>
                    <div className={styles.serviceName}>Okna standardowe podwójne</div>
                    <div className={styles.servicePrice}>{PRICE.doubleStandard} zł / szt.</div>
                  </div>
                </div>

                <div className={styles.serviceControl}>
                  <select
                    className={styles.selectInput}
                    value={doubleStandardWindowQuantity}
                    onChange={(e) => setDoubleStandardWindowQuantity(clampInt(e.target.value, 0, 999))}
                  >
                    {quantityOptions.map((n) => (
                      <option key={`dsw-${n}`} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 3 */}
              <div className={styles.serviceRow}>
                <div className={styles.serviceLeft}>
                  <div className={styles.serviceIconWrap}>
                    <img className={styles.serviceIcon} src={balconyDoor} alt="Drzwi balkonowe" loading="lazy" />
                  </div>

                  <div className={styles.serviceMeta}>
                    <div className={styles.serviceName}>Drzwi balkonowe</div>
                    <div className={styles.servicePrice}>{PRICE.balconyDoor} zł / szt.</div>
                  </div>
                </div>

                <div className={styles.serviceControl}>
                  <select
                    className={styles.selectInput}
                    value={balconyDoorsQuantity}
                    onChange={(e) => setBalconyDoorsQuantity(clampInt(e.target.value, 0, 999))}
                  >
                    {quantityOptions.map((n) => (
                      <option key={`bd-${n}`} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4 */}
              <div className={styles.serviceRow}>
                <div className={styles.serviceLeft}>
                  <div className={styles.serviceIconWrap}>
                    <img className={styles.serviceIcon} src={largeGlass} alt="Duże witryny" loading="lazy" />
                  </div>

                  <div className={styles.serviceMeta}>
                    <div className={styles.serviceName}>Duże witryny</div>
                    <div className={styles.servicePrice}>{PRICE.largeGlassPerM2} zł / m²</div>
                  </div>
                </div>

                <div className={styles.serviceControl}>
                  <input
                    className={styles.numberInput}
                    type="number"
                    min={0}
                    step={1}
                    value={largeGlassMetersQuantity}
                    onChange={(e) => setLargeGlassMetersQuantity(clampInt(e.target.value, 0, 99999))}
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className={styles.summaryBox}>
              <div className={styles.summaryHeader}>
                <h3 className={styles.summaryTitle}>Podsumowanie</h3>
                <div className={styles.summaryTotal}>
                  <span className={styles.summaryTotalLabel}>Razem:</span>
                  <span className={styles.summaryTotalValue}>{overallPrice} zł</span>
                </div>
              </div>

              {buildLineItems.length === 0 ? (
                <div className={styles.summaryEmpty}>Wybierz elementy usługi, żeby zobaczyć koszt.</div>
              ) : (
                <ul className={styles.summaryList}>
                  {buildLineItems.map((it) => (
                    <li key={it.label} className={styles.summaryItem}>
                      <div className={styles.summaryItemLeft}>
                        <span className={styles.summaryItemLabel}>{it.label}</span>
                        <span className={styles.summaryItemMeta}>
                          {it.qty} {it.unit} × {it.unitPrice} zł
                        </span>
                      </div>
                      <div className={styles.summaryItemRight}>{it.sum} zł</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Calendar */}
          <section className={`${styles.cleaningFormSection} ${styles.cleaningFormSectionCalendar}`}>
            <h2 className={styles.sectionTitle}>Wybierz termin</h2>

            <div className={styles.calendarBox}>
              <div className={styles.calendarHintRow}>
                <div className={styles.calendarHint}>
                  {loadingCalendar ? (
                    <span className={styles.hintText}>Ładowanie dostępnych terminów…</span>
                  ) : (
                    <span className={styles.hintText}>
                      Kliknij dzień. Weekendy są domyślnie ukryte. Zajęte dni są zablokowane.
                    </span>
                  )}
                </div>

                {selectedDateKey ? (
                  <div className={styles.selectedDateBadge}>
                    <span className={styles.selectedDateLabel}>Wybrany dzień:</span>
                    <span className={styles.selectedDateValue}>{selectedDateKey}</span>
                  </div>
                ) : (
                  <div className={`${styles.selectedDateBadge} ${styles.selectedDateBadgeEmpty}`}>
                    <span className={styles.selectedDateLabel}>Wybrany dzień:</span>
                    <span className={styles.selectedDateValue}>—</span>
                  </div>
                )}
              </div>

              <div className={styles.calendarWrapper}>
                <FullCalendar
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  locale={plLocale}
                  initialView="dayGridMonth"
                  buttonText={{
                    today: "Dziś",
                    month: "Miesiąc",
                    week: "Tydzień",
                    day: "Dzień",
                    list: "Lista",
                  }}
                  allDayText="Cały dzień"
                  moreLinkText={(n) => `+${n} więcej`}
                  noEventsText="Brak wydarzeń"
                  headerToolbar={{
                    left: "prev,next today",
                    center: "title",
                    right: "dayGridMonth,timeGridWeek,timeGridDay",
                  }}
                  weekends={false}
                  selectable={false}
                  dateClick={handleDateClick}
                  height="auto"
                  fixedWeekCount={false}
                  showNonCurrentDates={true}
                  dayCellClassNames={(arg) => {
                    const classes = [styles.calendarDayCell];
                    const key = toDateKey(arg.date);

                    const d = new Date(arg.date);
                    d.setHours(0, 0, 0, 0);

                    if (d < startOfToday()) classes.push(styles.calendarDayCellPast);
                    if (reservedDateKeys.has(key)) classes.push(styles.calendarDayCellReserved);
                    if (selectedDateKey && key === selectedDateKey) classes.push(styles.calendarDayCellSelected);
                    if (!isDateSelectable(arg.date)) classes.push(styles.calendarDayCellDisabled);

                    return classes;
                  }}
                />
              </div>

              {/* Hours */}
              <div className={styles.hoursBox}>
                <h3 className={styles.hoursTitle}>Godzina</h3>

                {!selectedDateKey ? (
                  <div className={styles.hoursEmpty}>Najpierw wybierz dzień.</div>
                ) : (
                  <div className={styles.hoursButtons}>
                    {HOURS.map((h) => {
                      const active = selectedHour === h;
                      return (
                        <button
                          key={h}
                          type="button"
                          className={`${styles.hourButton} ${active ? styles.hourButtonActive : ""}`}
                          onClick={() => handleHourPick(h)}
                        >
                          {h}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Messages */}
          {(formError || formInfo) && (
            <div className={styles.formMessages}>
              {formError && <div className={`${styles.messageBox} ${styles.messageBoxError}`}>{formError}</div>}
              {formInfo && <div className={`${styles.messageBox} ${styles.messageBoxInfo}`}>{formInfo}</div>}
            </div>
          )}

          {/* Submit */}
          <div className={styles.submitRow}>
            <button
              className={styles.submitButton}
              type="submit"
              disabled={submitting || loadingCalendar}
              aria-busy={submitting ? "true" : "false"}
            >
              {submitting ? "Rezerwuję…" : "Zamów usługę"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}