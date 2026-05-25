import { motion } from 'framer-motion';
import MetricCard from './MetricCard.jsx';
import SystemStatusBanner from './SystemStatusBanner.jsx';

function formatNumber(value) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function SystemUpdatesPanel({ status = null, loading = false, error = '', onRefresh = null }) {
  const cards = [
    { label: 'Hotels Indexed', value: formatNumber(status?.hotelsIndexed), delta: status?.hotelsDelta || null },
    { label: 'Signals Generated', value: formatNumber(status?.signalsGenerated), delta: status?.signalsDelta || null },
    { label: 'Ranked Opportunities', value: formatNumber(status?.rankedOpportunities), delta: status?.rankedOpportunitiesDelta || null },
    { label: 'Notifications Generated', value: formatNumber(status?.notificationsGenerated), delta: status?.notificationsDelta || null },
  ];

  return (
    <section className="adminDashboardSections" aria-label="System updates">
      <motion.section
        className="adminStatusPanel"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: 'easeOut' }}
      >
        <header className="adminPanelHeader">
          <div>
            <span className="hotelDashboardSectionEyebrow">System Updates</span>
            <h2>Scrape status and latest system counts</h2>
          </div>
          {typeof onRefresh === 'function' ? (
            <button type="button" className="ghostButton" onClick={onRefresh} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh Status'}
            </button>
          ) : null}
        </header>

        {loading ? <p className="metaLabel">Loading system updates…</p> : null}
        {!loading && error ? <p className="errorText">{error}</p> : null}
        {!loading && !error ? <SystemStatusBanner status={status} /> : null}
      </motion.section>

      {!loading && !error ? (
        <motion.section
          className="adminStatusPanel systemCitiesPanel"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.04, ease: 'easeOut' }}
        >
          <header className="adminPanelHeader">
            <div>
              <span className="hotelDashboardSectionEyebrow">Active Markets</span>
              <h2>{formatNumber(status?.cityCount)} city markets active</h2>
              <p className="metaLabel">Only currently enabled cities are shown here.</p>
            </div>
          </header>
          <div className="systemCityChips" aria-label="Tracked cities">
            {(Array.isArray(status?.cities) ? status.cities : []).map((city) => (
              <span key={city} className="systemCityChip">
                {city}
              </span>
            ))}
          </div>
        </motion.section>
      ) : null}

      {!loading && !error ? (
        <motion.section
          className="adminMetricsGrid"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: 'easeOut' }}
        >
          {cards.map((card, index) => (
            <MetricCard key={card.label} label={card.label} value={card.value} delta={card.delta} index={index} />
          ))}
        </motion.section>
      ) : null}
    </section>
  );
}
