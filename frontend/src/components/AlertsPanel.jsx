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

function normalizeAlertEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const raw = entry.trim();
    if (!raw) return null;
    const match = raw.match(/^(CRITICAL|HIGH|MEDIUM|LOW|INFO)\s*:\s*(.*)$/i);
    const severity = match ? match[1].toUpperCase() : 'INFO';
    const message = match ? match[2].trim() : raw;
    return { severity, message, count: 1 };
  }

  const message = String(entry.message || '').trim();
  if (!message) return null;
  return {
    severity: String(entry.severity || 'INFO').toUpperCase(),
    message,
    count: Number(entry.count || 1),
  };
}

function groupAlerts(alerts = [], alertGroups = []) {
  const source = Array.isArray(alertGroups) && alertGroups.length ? alertGroups : alerts;
  const grouped = new Map();

  for (const entry of source) {
    const normalized = normalizeAlertEntry(entry);
    if (!normalized) continue;

    const severity = alertLabel(normalized.severity);
    const key = `${severity}:${normalized.message.toLowerCase()}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        severity,
        message: normalized.message,
        count: Math.max(1, normalized.count),
      });
    } else {
      grouped.get(key).count += Math.max(1, normalized.count);
    }
  }

  return Array.from(grouped.values());
}

export default function AlertsPanel({ alerts = [], alertGroups = [] }) {
  const groupedAlerts = groupAlerts(alerts, alertGroups);

  return (
    <section className="panel alertsPanel" aria-label="Alerts panel">
      <header className="panelHeader">
        <h2>Alerts</h2>
      </header>

      {!groupedAlerts.length ? (
        <p className="metaLabel">No active alerts.</p>
      ) : (
        <ul className="alertList">
          {groupedAlerts.map((alert) => (
            <li key={`${alert.severity}:${alert.message}`} className="alertItem">
              <div className="alertHead">
                <span className={`alertChip alert-${alertTone(alert.severity)}`}>{alert.severity}</span>
                {alert.count > 1 && <span className="alertCountBadge">x{alert.count}</span>}
              </div>
              <p>{alert.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
