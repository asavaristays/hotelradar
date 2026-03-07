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
    return { severity, message, count: 1, firstSeenAt: null, lastSeenAt: null };
  }

  const message = String(entry.message || '').trim();
  if (!message) return null;
  return {
    severity: String(entry.severity || 'INFO').toUpperCase(),
    message,
    count: Number(entry.count || 1),
    firstSeenAt: entry.firstSeenAt || entry.first_seen_at || null,
    lastSeenAt: entry.lastSeenAt || entry.last_seen_at || null,
  };
}

function formatSince(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('en-IN');
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
          firstSeenAt: normalized.firstSeenAt || null,
          lastSeenAt: normalized.lastSeenAt || null,
        });
      } else {
        const existing = grouped.get(key);
        existing.count += Math.max(1, normalized.count);
        if (normalized.firstSeenAt) {
          if (!existing.firstSeenAt || new Date(normalized.firstSeenAt).getTime() < new Date(existing.firstSeenAt).getTime()) {
            existing.firstSeenAt = normalized.firstSeenAt;
          }
        }
        if (normalized.lastSeenAt) {
          if (!existing.lastSeenAt || new Date(normalized.lastSeenAt).getTime() > new Date(existing.lastSeenAt).getTime()) {
            existing.lastSeenAt = normalized.lastSeenAt;
          }
        }
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
              {formatSince(alert.firstSeenAt || alert.lastSeenAt) ? (
                <p className="metaLabel">Since {formatSince(alert.firstSeenAt || alert.lastSeenAt)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
