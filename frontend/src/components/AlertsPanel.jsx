import { useEffect, useMemo, useState } from 'react';
import { buildApiPath, buildAuthHeaders, parseServerError } from '../http.js';

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
  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

function formatSignalSource(value) {
  return String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAlertDate(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function IntelligenceAlertList({ items = [] }) {
  return (
    <ul className="alertList">
      {items.map((alert) => (
        <li
          key={`${alert.alert_type}:${alert.signal_source}:${alert.created_at}`}
          className={`alertItem intelligenceAlertItem intelligenceAlertItem-${alertTone(alert.severity)}`}
        >
          <div className="alertHead">
            <span className={`alertChip alert-${alertTone(alert.severity)}`}>{alertLabel(alert.severity)}</span>
            <span className="alertCountBadge">{alert.city}</span>
          </div>
          <p>{alert.message}</p>
          <p className="metaLabel">
            Signal source: <strong>{formatSignalSource(alert.signal_source)}</strong>
          </p>
          <p className="intelligenceAlertAction">{alert.recommended_action}</p>
          {formatAlertDate(alert.created_at) ? (
            <p className="metaLabel">Updated {formatAlertDate(alert.created_at)}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function AlertsPanel({ alerts = [], alertGroups = [], mode = 'default', token = '', hotelId = '' }) {
  const [intelligenceAlerts, setIntelligenceAlerts] = useState([]);
  const [loading, setLoading] = useState(mode === 'intelligence');
  const [error, setError] = useState('');
  const groupedAlerts = groupAlerts(alerts, alertGroups);
  const isIntelligenceMode = mode === 'intelligence';

  useEffect(() => {
    if (!isIntelligenceMode) {
      return undefined;
    }

    let active = true;

    async function loadIntelligenceAlerts() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(buildApiPath('/api/intelligence/alerts', { hotel_id: hotelId }), {
          headers: buildAuthHeaders(token),
        });

        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load intelligence alerts');
          throw new Error(parsed.message);
        }

        const payload = await response.json();
        if (!active) {
          return;
        }

        setIntelligenceAlerts(Array.isArray(payload?.alerts) ? payload.alerts : []);
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError(loadError.message || 'Unable to load intelligence alerts.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadIntelligenceAlerts();

    return () => {
      active = false;
    };
  }, [hotelId, isIntelligenceMode, token]);

  const intelligenceTitle = useMemo(
    () => (isIntelligenceMode ? 'Intelligence Alerts' : 'Alerts'),
    [isIntelligenceMode],
  );

  return (
    <section className="panel alertsPanel" aria-label="Alerts panel">
      <header className="panelHeader">
        <div className="gridMetaBlock">
          <h2>{intelligenceTitle}</h2>
          {isIntelligenceMode ? (
            <p className="metaLabel">Latest market alerts detected from active intelligence signals.</p>
          ) : null}
        </div>
      </header>

      {isIntelligenceMode && loading ? <p className="metaLabel">Loading intelligence alerts…</p> : null}
      {isIntelligenceMode && !loading && error ? <p className="errorText">{error}</p> : null}

      {isIntelligenceMode ? (
        !loading && !error && !intelligenceAlerts.length ? (
          <p className="metaLabel">No intelligence alerts are active right now.</p>
        ) : null
      ) : !groupedAlerts.length ? (
        <p className="metaLabel">No active alerts.</p>
      ) : null}

      {isIntelligenceMode && !loading && !error && intelligenceAlerts.length ? (
        <IntelligenceAlertList items={intelligenceAlerts} />
      ) : null}

      {!isIntelligenceMode && groupedAlerts.length ? (
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
      ) : null}
    </section>
  );
}
