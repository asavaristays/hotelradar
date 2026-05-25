import { useEffect, useMemo, useState } from 'react';
import { buildAuthHeaders, parseServerError } from '../http.js';

const ALL_CITIES = 'ALL_CITIES';
const NON_PHYSICAL_EVENT_PATTERNS = [
  /\bonline\b/i,
  /\bvirtual\b/i,
  /\bwebinar\b/i,
  /\bzoom\b/i,
  /\bgoogle meet\b/i,
  /\bteams\b/i,
  /\bhybrid\b/i,
  /\blivestream\b/i,
];

function formatDate(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatEventType(value) {
  return String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getIncreaseTone(value) {
  const safe = Number(value || 0);
  if (safe >= 30) return 'high';
  if (safe >= 20) return 'medium';
  return 'low';
}

function isPhysicalEvent(entry) {
  const haystack = [
    entry?.event_name,
    entry?.event_type,
    entry?.signal_source,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');

  return !NON_PHYSICAL_EVENT_PATTERNS.some((pattern) => pattern.test(haystack));
}

export default function DemandCalendar({ token = '' }) {
  const [events, setEvents] = useState([]);
  const [cityFilter, setCityFilter] = useState(ALL_CITIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadCalendar() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch('/api/intelligence/demand-calendar', {
          headers: buildAuthHeaders(token),
        });

        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load demand calendar');
          throw new Error(parsed.message);
        }

        const payload = await response.json();
        if (!active) {
          return;
        }

        const rows = Array.isArray(payload?.events) ? payload.events : [];
        setEvents(rows.filter((entry) => isPhysicalEvent(entry)));
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError.message || 'Unable to load demand calendar.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadCalendar();
    return () => {
      active = false;
    };
  }, [token]);

  const cities = useMemo(
    () => [...new Set(events.map((entry) => entry.city).filter(Boolean))].sort(),
    [events],
  );

  const filteredEvents = useMemo(
    () =>
      events.filter((entry) => {
        if (cityFilter !== ALL_CITIES && entry.city !== cityFilter) {
          return false;
        }
        return true;
      }),
    [cityFilter, events],
  );

  return (
    <section className="panel demandCalendarPanel" aria-label="Demand calendar">
      <header className="panelHeader demandCalendarHeader">
        <div className="gridMetaBlock">
          <h2>Demand Calendar</h2>
          <p className="metaLabel">Upcoming demand events detected from the intelligence layer.</p>
        </div>
        <div className="controls demandCalendarControls">
          <label>
            <span className="controlLabel">City</span>
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
              <option value={ALL_CITIES}>All cities</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {loading ? <p className="metaLabel">Loading demand calendar…</p> : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}
      {!loading && !error && !filteredEvents.length ? (
        <p className="metaLabel">No upcoming demand events are currently available.</p>
      ) : null}

      {!loading && !error && filteredEvents.length ? (
        <div className="demandCalendarList">
          {filteredEvents.map((entry) => (
            <article
              key={`${entry.city}-${entry.event_name}-${entry.start_date}-${entry.signal_source}`}
              className="demandCalendarCard"
            >
              <div className="demandCalendarTop">
                <span className="demandCalendarType">{formatEventType(entry.event_type)}</span>
                <span className={`demandIncreaseBadge demandIncreaseBadge-${getIncreaseTone(entry.expected_demand_increase)}`}>
                  +{Number(entry.expected_demand_increase || 0)}%
                </span>
              </div>

              <h3>{entry.event_name}</h3>

              <div className="demandCalendarMeta">
                <span>{entry.city}</span>
                <span>
                  {formatDate(entry.start_date)} - {formatDate(entry.end_date)}
                </span>
              </div>

              <p className="metaLabel">
                Signal source: <strong>{formatEventType(entry.signal_source)}</strong>
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
