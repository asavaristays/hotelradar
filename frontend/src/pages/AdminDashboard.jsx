import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import MetricCard from '../components/MetricCard.jsx';
import SystemStatusBanner from '../components/SystemStatusBanner.jsx';
import { getSystemStatus } from '../services/intelligenceApi.js';

const SIGNAL_CATEGORY_DATA = [
  { category: 'Weekend Compression', value: 586 },
  { category: 'Airport Demand', value: 337 },
  { category: 'Tourism Spike', value: 337 },
  { category: 'Price Pressure', value: 10 },
];

const CITY_OVERVIEW_ROWS = [
  { city: 'Goa', hotels: 2103, signals: 1642, opportunities: 100 },
  { city: 'Jaipur', hotels: 1250, signals: 360, opportunities: 100 },
  { city: 'Mumbai', hotels: 922, signals: 153, opportunities: 100 },
];

function formatNumber(value) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatSystemTime(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AdminChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="adminChartTooltip">
      <span>{label}</span>
      <strong>{formatNumber(payload[0]?.value)}</strong>
    </div>
  );
}

export default function AdminDashboard({ session, onLogout, onNavigate }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const adminRole = String(session?.user?.role || '').trim().toLowerCase();
  const isAdmin = adminRole === 'admin' || adminRole === 'super_admin';

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    let active = true;

    async function loadStatus() {
      setLoading(true);
      setError('');

      try {
        const nextStatus = await getSystemStatus(session.token);
        if (!active) return;
        setStatus(nextStatus);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || 'Unable to load admin dashboard.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadStatus();
    return () => {
      active = false;
    };
  }, [isAdmin, session.token]);

  const metricCards = useMemo(
    () => [
      { label: 'Hotels Indexed', value: formatNumber(status?.hotelsIndexed) },
      { label: 'Signals Generated', value: formatNumber(status?.signalsGenerated) },
      { label: 'Ranked Opportunities', value: formatNumber(status?.rankedOpportunities) },
      { label: 'Notifications Generated', value: formatNumber(status?.notificationsGenerated) },
    ],
    [status],
  );

  if (!isAdmin) {
    return (
      <main className="adminDashboardPage">
        <div className="adminDashboardContainer">
          <section className="adminDashboardHero">
            <span className="hotelDashboardHeroEyebrow">Admin Dashboard</span>
            <h1>Admin access required</h1>
            <p>This workspace is available only to admin and super admin users.</p>
            <div className="hotelDashboardToolbarActions">
              <button type="button" onClick={() => onNavigate('/dashboard')}>Open Hotel Dashboard</button>
              <button type="button" className="ghostButton" onClick={onLogout}>Logout</button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="adminDashboardPage">
      <div className="adminDashboardContainer">
        <header className="adminDashboardHero">
          <div>
            <span className="hotelDashboardHeroEyebrow">Admin Dashboard</span>
            <h1>System health and market intelligence activity</h1>
            <p>Monitor ingestion scale, signal output, and activity across the active HotelRADAR markets.</p>
          </div>

          <div className="hotelDashboardToolbarActions">
            <button type="button" className="ghostButton" onClick={() => onNavigate('/dashboard')}>
              Hotel Dashboard
            </button>
            <button type="button" className="ghostButton" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>

        {loading ? <p className="metaLabel">Loading admin dashboard…</p> : null}
        {!loading && error ? <p className="errorText">{error}</p> : null}

        {!loading && !error && status ? (
          <div className="adminDashboardSections">
            <SystemStatusBanner status={status} />

            <motion.section
              className="adminMetricsGrid"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, ease: 'easeOut' }}
            >
              {metricCards.map((card, index) => (
                <MetricCard key={card.label} label={card.label} value={card.value} index={index} />
              ))}
            </motion.section>

            <motion.section
              className="adminStatusPanel"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05, ease: 'easeOut' }}
            >
              <header className="adminPanelHeader">
                <div>
                  <span className="hotelDashboardSectionEyebrow">Engine Status</span>
                  <h2>Healthy</h2>
                </div>
                <span className="adminHealthBadge">Healthy</span>
              </header>
              <div className="adminStatusMeta">
                <div>
                  <span>Last System Time</span>
                  <strong>{formatSystemTime(status.systemTime)}</strong>
                </div>
                <div>
                  <span>Environment</span>
                  <strong>Production</strong>
                </div>
              </div>
            </motion.section>

            <motion.section
              className="adminChartPanel"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, delay: 0.08, ease: 'easeOut' }}
            >
              <header className="adminPanelHeader">
                <div>
                  <span className="hotelDashboardSectionEyebrow">Market Overview</span>
                  <h2>Signals by Category</h2>
                </div>
              </header>

              <div className="adminChartWrap">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={SIGNAL_CATEGORY_DATA} margin={{ top: 12, right: 12, left: -16, bottom: 12 }}>
                    <defs>
                      <linearGradient id="adminBarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#00E5FF" />
                        <stop offset="100%" stopColor="#00FFA3" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                    <XAxis
                      dataKey="category"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'rgba(207, 220, 235, 0.76)', fontSize: 12 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'rgba(207, 220, 235, 0.76)', fontSize: 12 }}
                    />
                    <Tooltip content={<AdminChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="url(#adminBarGradient)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.section>

            <motion.section
              className="adminTablePanel"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.44, delay: 0.12, ease: 'easeOut' }}
            >
              <header className="adminPanelHeader">
                <div>
                  <span className="hotelDashboardSectionEyebrow">City Overview</span>
                  <h2>Market Summary</h2>
                </div>
              </header>

              <div className="adminTableWrap">
                <table className="adminOverviewTable">
                  <thead>
                    <tr>
                      <th>City</th>
                      <th>Hotels</th>
                      <th>Signals</th>
                      <th>Opportunities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CITY_OVERVIEW_ROWS.map((row) => (
                      <tr key={row.city}>
                        <td>{row.city}</td>
                        <td>{formatNumber(row.hotels)}</td>
                        <td>{formatNumber(row.signals)}</td>
                        <td>{formatNumber(row.opportunities)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
