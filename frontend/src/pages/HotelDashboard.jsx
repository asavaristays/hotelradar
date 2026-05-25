import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import DemandForecast from '../components/DemandForecast.jsx';
import NotificationsPanel from '../components/NotificationsPanel.jsx';
import RadarMap from '../components/RadarMap.jsx';
import RadarScoreCard from '../components/RadarScoreCard.jsx';
import SectionIndicator from '../components/SectionIndicator.jsx';
import SignalsFeed from '../components/SignalsFeed.jsx';
import { parseServerError, readResponseBody } from '../http.js';

const SECTION_ITEMS = [
  { id: 'hotel-dashboard-radar', label: 'Radar' },
  { id: 'hotel-dashboard-notifications', label: 'Notifications' },
  { id: 'hotel-dashboard-map', label: 'Map' },
  { id: 'hotel-dashboard-forecast', label: 'Forecast' },
  { id: 'hotel-dashboard-signals', label: 'Signals' },
];

function Section({ id, eyebrow, title, children, index = 0 }) {
  return (
    <motion.section
      id={id}
      className="hotelDashboardSection"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.42, delay: Math.min(index * 0.06, 0.2), ease: 'easeOut' }}
    >
      <header className="hotelDashboardSectionHeader">
        <span className="hotelDashboardSectionEyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </header>
      {children}
    </motion.section>
  );
}

export default function HotelDashboard({ session, onLogout, onNavigate }) {
  const [hotels, setHotels] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState('');
  const [activeHotelId, setActiveHotelId] = useState('');
  const [loadingHotels, setLoadingHotels] = useState(true);
  const [hotelsError, setHotelsError] = useState('');
  const [activeSection, setActiveSection] = useState(SECTION_ITEMS[0].id);

  useEffect(() => {
    let active = true;

    async function loadHotels() {
      setLoadingHotels(true);
      setHotelsError('');

      try {
        const response = await fetch('/hotels', {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        });

        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load hotels');
          throw new Error(parsed.message);
        }

        const body = await readResponseBody(response);
        const rows = Array.isArray(body.json) ? body.json : [];
        if (!active) return;

        setHotels(rows);
        if (!selectedHotelId && rows.length) {
          const firstHotelId = String(rows[0]?.id || '').trim();
          setSelectedHotelId(firstHotelId);
          setActiveHotelId(firstHotelId);
        }
      } catch (loadError) {
        if (!active) return;
        setHotelsError(loadError.message || 'Unable to load hotels.');
      } finally {
        if (active) setLoadingHotels(false);
      }
    }

    loadHotels();
    return () => {
      active = false;
    };
  }, [selectedHotelId, session.token]);

  const selectedHotel = useMemo(
    () => hotels.find((hotel) => String(hotel?.id || '').trim() === String(activeHotelId || '').trim()) || null,
    [activeHotelId, hotels],
  );

  const sectionSummary = useMemo(
    () =>
      selectedHotel
        ? `${selectedHotel.hotel_name || 'Selected hotel'} · ${selectedHotel.city || 'Unknown city'}`
        : 'Choose a hotel to load live intelligence',
    [selectedHotel],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const targets = SECTION_ITEMS.map((item) => document.getElementById(item.id)).filter(Boolean);
    if (!targets.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        if (visibleEntries[0]?.target?.id) {
          setActiveSection(visibleEntries[0].target.id);
        }
      },
      {
        threshold: [0.25, 0.45, 0.65],
        rootMargin: '-10% 0px -45% 0px',
      },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="hotelDashboardPage">
      <div className="hotelDashboardContainer">
        <header className="hotelDashboardHero">
          <div className="hotelDashboardHeroCopy">
            <span className="hotelDashboardHeroEyebrow">HotelRADAR Dashboard</span>
            <h1>Live revenue intelligence for your hotel</h1>
            <p>{sectionSummary}</p>
          </div>

          <div className="hotelDashboardToolbar">
            <label className="hotelDashboardSelector">
              <span>Hotel</span>
              <select
                value={selectedHotelId}
                onChange={(event) => setSelectedHotelId(String(event.target.value || '').trim())}
                disabled={loadingHotels || Boolean(hotelsError)}
              >
                <option value="">{loadingHotels ? 'Loading hotels…' : 'Select hotel'}</option>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.hotel_name} ({hotel.city})
                  </option>
                ))}
              </select>
            </label>

            <div className="hotelDashboardToolbarActions">
              <button
                type="button"
                onClick={() => setActiveHotelId(String(selectedHotelId || '').trim())}
                disabled={!selectedHotelId || loadingHotels}
              >
                {loadingHotels ? 'Loading…' : 'Load Dashboard'}
              </button>
              <button type="button" className="ghostButton" onClick={() => onNavigate('/')}>
                Legacy View
              </button>
              <button type="button" className="ghostButton" onClick={onLogout}>
                Logout
              </button>
            </div>
          </div>
        </header>

        {hotelsError ? <p className="errorText">{hotelsError}</p> : null}

        <div className="hotelDashboardFrame">
          <aside className="hotelDashboardRail" aria-label="Section navigation">
            <SectionIndicator items={SECTION_ITEMS} activeSection={activeSection} />
          </aside>

          <div className="hotelDashboardSections">
            <Section id="hotel-dashboard-radar" eyebrow="Overview" title="Radar Score" index={0}>
              <RadarScoreCard token={session.token} hotelId={activeHotelId} />
            </Section>

            <Section
              id="hotel-dashboard-notifications"
              eyebrow="Market Alerts"
              title="Notifications"
              index={1}
            >
              <NotificationsPanel token={session.token} />
            </Section>

            <Section id="hotel-dashboard-map" eyebrow="Market View" title="Radar Map" index={2}>
              <RadarMap token={session.token} focusCity={selectedHotel?.city || ''} />
            </Section>

            <Section id="hotel-dashboard-forecast" eyebrow="Forward Look" title="Demand Forecast" index={3}>
              <DemandForecast token={session.token} hotelId={activeHotelId} />
            </Section>

            <Section id="hotel-dashboard-signals" eyebrow="Market Signals" title="Signals Feed" index={4}>
              <SignalsFeed token={session.token} focusCity={selectedHotel?.city || ''} />
            </Section>

          </div>
        </div>
      </div>
    </main>
  );
}
