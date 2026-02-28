function alertTone(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('CRITICAL')) return 'critical';
  if (text.includes('HIGH')) return 'high';
  if (text.includes('MEDIUM')) return 'medium';
  return 'low';
}

function alertLabel(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('CRITICAL')) return 'CRITICAL';
  if (text.includes('HIGH')) return 'HIGH';
  if (text.includes('MEDIUM')) return 'MEDIUM';
  return 'INFO';
}

export default function AlertsPanel({ alerts = [] }) {
  return (
    <section className="panel alertsPanel" aria-label="Alerts panel">
      <header className="panelHeader">
        <h2>Alerts</h2>
      </header>

      {!alerts.length ? (
        <p className="metaLabel">No active alerts.</p>
      ) : (
        <ul className="alertList">
          {alerts.map((alert) => (
            <li key={alert} className="alertItem">
              <span className={`alertChip alert-${alertTone(alert)}`}>{alertLabel(alert)}</span>
              <p>{alert}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
