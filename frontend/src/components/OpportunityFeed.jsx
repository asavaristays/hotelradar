import { memo, useEffect, useMemo, useState } from 'react';
import OpportunityCard from './OpportunityCard.jsx';
import { SkeletonCard } from './SkeletonCard.jsx';
import { getOpportunityFeed } from '../services/intelligenceApi.js';

const ALL_CITIES = 'ALL_CITIES';
const ALL_SIGNALS = 'ALL_SIGNALS';

function formatSignalLabel(value) {
  return String(value || '')
    .trim()
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function OpportunityFeed({ token = '' }) {
  const [opportunities, setOpportunities] = useState([]);
  const [cityFilter, setCityFilter] = useState(ALL_CITIES);
  const [signalFilter, setSignalFilter] = useState(ALL_SIGNALS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadFeed() {
      setLoading(true);
      setError('');

      try {
        const nextOpportunities = await getOpportunityFeed(token);
        if (!active) return;
        setOpportunities(nextOpportunities);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || 'Unable to load opportunity feed.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadFeed();

    return () => {
      active = false;
    };
  }, [token]);

  const cities = useMemo(
    () => [...new Set(opportunities.map((entry) => entry.city).filter(Boolean))].sort(),
    [opportunities],
  );

  const signalTypes = useMemo(
    () => [...new Set(opportunities.map((entry) => entry.signalType).filter(Boolean))].sort(),
    [opportunities],
  );

  const filteredOpportunities = useMemo(
    () =>
      opportunities.filter((entry) => {
        if (cityFilter !== ALL_CITIES && entry.city !== cityFilter) return false;
        if (signalFilter !== ALL_SIGNALS && entry.signalType !== signalFilter) return false;
        return true;
      }),
    [cityFilter, opportunities, signalFilter],
  );

  return (
    <section className="opportunityFeedShell" aria-label="Opportunity feed">
      <header className="opportunityFeedHeader">
        <div className="gridMetaBlock">
          <h2>Opportunity Feed</h2>
          <p className="metaLabel">Revenue improvements surfaced from live market intelligence.</p>
        </div>
        <div className="controls opportunityFeedControls">
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
        <div className="opportunityFeedStack">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      ) : null}
      {!loading && error ? <p className="errorText">{error}</p> : null}
      {!loading && !error && !filteredOpportunities.length ? (
        <p className="metaLabel">No revenue opportunities match the current filters.</p>
      ) : null}

      {!loading && !error && filteredOpportunities.length ? (
        <div className="opportunityFeedStack">
          {filteredOpportunities.map((entry, index) => (
            <OpportunityCard
              key={`${entry.hotelId || entry.id}-${entry.signalType}-${entry.createdAt || index}`}
              opportunity={entry}
              index={index}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default memo(OpportunityFeed);
