import { memo, useEffect, useMemo, useState } from 'react';
import SignalCard from './SignalCard.jsx';
import { SkeletonCard } from './SkeletonCard.jsx';
import { getSignalsFeed } from '../services/intelligenceApi.js';

const ALL_CITIES = 'ALL_CITIES';
const ALL_SIGNALS = 'ALL_SIGNALS';

function formatSignalLabel(value) {
  return String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function SignalsFeed({ token = '', focusCity = '' }) {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cityFilter, setCityFilter] = useState(String(focusCity || '').trim() || ALL_CITIES);
  const [signalFilter, setSignalFilter] = useState(ALL_SIGNALS);

  useEffect(() => {
    if (focusCity) {
      setCityFilter(String(focusCity).trim());
    }
  }, [focusCity]);

  useEffect(() => {
    let active = true;

    async function loadSignals() {
      setLoading(true);
      setError('');

      try {
        const nextSignals = await getSignalsFeed(token);
        if (!active) return;
        setSignals(nextSignals);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || 'Unable to load signals feed.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSignals();
    return () => {
      active = false;
    };
  }, [token]);

  const cities = useMemo(
    () => [...new Set(signals.map((entry) => entry.city).filter(Boolean))].sort(),
    [signals],
  );

  const signalTypes = useMemo(
    () => [...new Set(signals.map((entry) => entry.signalType).filter(Boolean))].sort(),
    [signals],
  );

  const filteredSignals = useMemo(
    () =>
      signals.filter((entry) => {
        if (cityFilter !== ALL_CITIES && entry.city !== cityFilter) return false;
        if (signalFilter !== ALL_SIGNALS && entry.signalType !== signalFilter) return false;
        return true;
      }),
    [cityFilter, signalFilter, signals],
  );

  return (
    <section className="signalsFeedShell" aria-label="Signals feed">
      <header className="signalsFeedHeader">
        <div className="gridMetaBlock">
          <h2>Signals Feed</h2>
          <p className="metaLabel">Fresh intelligence signals from the live market engine.</p>
        </div>
        <div className="controls signalsFeedControls">
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
          <label>
            <span className="controlLabel">Signal</span>
            <select value={signalFilter} onChange={(event) => setSignalFilter(event.target.value)}>
              <option value={ALL_SIGNALS}>All signals</option>
              {signalTypes.map((signalType) => (
                <option key={signalType} value={signalType}>
                  {formatSignalLabel(signalType)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {loading ? (
        <div className="signalsFeedList">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      ) : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}
      {!loading && !error && !filteredSignals.length ? (
        <p className="metaLabel">No signals match the current filters.</p>
      ) : null}

      {!loading && !error && filteredSignals.length ? (
        <div className="signalsFeedScroll">
          <div className="signalsFeedList">
            {filteredSignals.map((signal, index) => (
              <SignalCard
                key={`${signal.hotelId || signal.id}-${signal.signalType}-${signal.createdAt || index}`}
                signal={signal}
                index={index}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default memo(SignalsFeed);
