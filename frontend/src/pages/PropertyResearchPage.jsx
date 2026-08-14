import { useEffect, useMemo, useRef, useState } from 'react';
import hotelradarLogo from '../assets/hotelradar-logo.png';
import {
  createPropertyResearch,
  listPropertyResearch,
} from '../services/propertyResearchApi.js';
import { getLeadRadarHotels } from '../services/leadRadarApi.js';

const EMPTY_SOURCE = { sourceType: 'website', url: '' };
const CITIES = ['Goa', 'Jaipur', 'Mumbai'];

function formatDate(value) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function confidenceTone(label) {
  if (label === 'high') return 'researchConfidence-high';
  if (label === 'medium') return 'researchConfidence-medium';
  return 'researchConfidence-low';
}

export default function PropertyResearchPage({ session, onLogout, onNavigate }) {
  const [hotelName, setHotelName] = useState('');
  const [city, setCity] = useState('Goa');
  const [area, setArea] = useState('');
  const [sources, setSources] = useState([{ ...EMPTY_SOURCE }]);
  const [result, setResult] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);
  const [indexedHotels, setIndexedHotels] = useState([]);
  const [indexTotal, setIndexTotal] = useState(0);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexQuery, setIndexQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const resultRef = useRef(null);

  const validSourceCount = useMemo(
    () => sources.filter((source) => source.url.trim()).length,
    [sources],
  );
  const visibleIndex = useMemo(() => {
    const query = indexQuery.trim().toLowerCase();
    const combined = [
      ...indexedHotels.map((hotel) => ({
        id: hotel.hotelId,
        hotelName: hotel.hotelName,
        city: hotel.city,
        area: null,
        status: 'Indexed',
        confidenceLabel: 'discovered',
      })),
      ...recentJobs.map((job) => ({
        ...job,
        status: job.confidenceLabel === 'high' ? 'Verified' : 'Evidence review',
      })),
    ];
    const deduped = Array.from(
      new Map(combined.map((item) => [`${item.hotelName.toLowerCase()}|${item.city}`, item])).values(),
    );
    return deduped
      .filter((item) => !query || `${item.hotelName} ${item.area || ''}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [indexQuery, indexedHotels, recentJobs]);

  const verifiedCount = useMemo(
    () => recentJobs.filter((job) => job.confidenceLabel === 'high').length,
    [recentJobs],
  );

  async function loadHistory(nextCity = city) {
    setHistoryLoading(true);
    try {
      setRecentJobs(await listPropertyResearch(session.token, { city: nextCity, limit: 12 }));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load property research history.');
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    loadHistory(city);
    // The selected city is intentionally the refresh boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, session.token]);

  useEffect(() => {
    let active = true;
    async function loadIndex() {
      setIndexLoading(true);
      try {
        const payload = await getLeadRadarHotels('Goa', { limit: 100 });
        if (!active) return;
        setIndexedHotels(Array.isArray(payload?.hotels) ? payload.hotels : []);
        setIndexTotal(Number(payload?.total || 0));
      } catch {
        if (!active) return;
        setIndexedHotels([]);
        setIndexTotal(0);
      } finally {
        if (active) setIndexLoading(false);
      }
    }
    loadIndex();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!result || !resultRef.current) return;
    resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  async function runResearch(payload) {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const nextResult = await createPropertyResearch(session.token, payload);
      setResult(nextResult);
      await loadHistory(payload.city);
    } catch (submitError) {
      setError(submitError.message || 'Unable to research property.');
    } finally {
      setLoading(false);
    }
  }

  async function selectTenResort() {
    const tenPayload = {
      hotelName: 'The Ten Resort',
      city: 'Goa',
      area: 'Siolim, North Goa',
      sources: [{ sourceType: 'website', url: 'https://thetengoa.com/' }],
    };
    setHotelName('The Ten Resort');
    setCity('Goa');
    setArea('Siolim, North Goa');
    setSources(tenPayload.sources);
    await runResearch(tenPayload);
  }

  function selectIndexedProperty(property) {
    setHotelName(property.hotelName);
    setCity(property.city || 'Goa');
    setArea(property.area || '');
    setResult(null);
    setError('');
  }

  function updateSource(index, field, value) {
    setSources((current) =>
      current.map((source, sourceIndex) =>
        sourceIndex === index ? { ...source, [field]: value } : source,
      ),
    );
  }

  function removeSource(index) {
    setSources((current) => {
      const next = current.filter((_, sourceIndex) => sourceIndex !== index);
      return next.length ? next : [{ ...EMPTY_SOURCE }];
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await runResearch({
      hotelName: hotelName.trim(),
      city,
      area: area.trim() || null,
      sources: sources
        .map((source) => ({
          sourceType: source.sourceType,
          url: source.url.trim(),
        }))
        .filter((source) => source.url),
    });
  }

  return (
    <main className="researchShell">
      <aside className="researchSidebar">
        <img
          className="premiumBrandLogo"
          src={hotelradarLogo}
          alt="HotelRADAR"
          width="740"
          height="158"
        />
        <p>Market-aware property intelligence</p>
        <nav className="premiumNav">
          <button type="button" className="premiumNavItem" onClick={() => onNavigate('/')}>
            Revenue Cockpit
          </button>
          <button type="button" className="premiumNavItem active">
            Property Research
          </button>
          <button type="button" className="premiumNavItem" onClick={() => onNavigate('/leadradar')}>
            LeadRADAR
          </button>
          <button type="button" className="premiumNavItem" onClick={onLogout}>
            Logout
          </button>
        </nav>
      </aside>

      <section className="researchMain">
        <header className="researchHero">
          <div>
            <span className="workspaceEyebrow">GOA PROPERTY INTELLIGENCE</span>
            <h1>One verified view of every property you research</h1>
            <p>
              Independent discovery, evidence verification and comparable-market intelligence.
              No tourism registry or imported government property list.
            </p>
          </div>
          <div className="researchAnchorCard">
            <span className="metaLabel">ANCHOR PROPERTY</span>
            <strong>The Ten Resort</strong>
            <p>Siolim · North Goa · Independent source verification</p>
            <button type="button" className="secondaryButton" disabled={loading} onClick={selectTenResort}>
              {loading ? 'Researching The Ten…' : 'Research The Ten now'}
            </button>
          </div>
        </header>

        {error ? <div className="errorBanner">{error}</div> : null}

        <section className="researchMetricStrip" aria-label="Goa intelligence coverage">
          <article>
            <span>Independent index</span>
            <strong>{indexLoading ? '—' : indexTotal}</strong>
            <small>Properties currently indexed</small>
          </article>
          <article>
            <span>Research briefs</span>
            <strong>{recentJobs.length}</strong>
            <small>Evidence-led property checks</small>
          </article>
          <article>
            <span>High confidence</span>
            <strong>{verifiedCount}</strong>
            <small>Two-source verification target</small>
          </article>
          <article>
            <span>Pricing boundary</span>
            <strong>Protected</strong>
            <small>Unverified rates stay excluded</small>
          </article>
        </section>

        <div className="researchGrid">
          <form className="researchPanel researchForm" onSubmit={handleSubmit}>
            <div className="researchPanelHeader">
              <div>
                <span className="metaLabel">NEW INTELLIGENCE BRIEF</span>
                <h2>Identify and verify a property</h2>
              </div>
              <span>{validSourceCount} source{validSourceCount === 1 ? '' : 's'}</span>
            </div>

            <label>
              Property name
              <input
                value={hotelName}
                onChange={(event) => setHotelName(event.target.value)}
                placeholder="Search or enter a Goa property"
                minLength={2}
                maxLength={180}
                required
              />
            </label>

            <div className="researchFormRow">
              <label>
                Market
                <select value={city} onChange={(event) => setCity(event.target.value)}>
                  {CITIES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                Area
                <input
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  placeholder="Anjuna, Morjim, C-Scheme…"
                  maxLength={120}
                />
              </label>
            </div>

            <div className="researchSources">
              <div className="researchSectionTitle">
                <div>
                  <strong>Evidence URLs</strong>
                  <span>Official website, Google profile or OTA listing</span>
                </div>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={sources.length >= 8}
                  onClick={() => setSources((current) => [...current, { ...EMPTY_SOURCE }])}
                >
                  Add source
                </button>
              </div>

              {sources.map((source, index) => (
                <div className="researchSourceRow" key={`source-${index}`}>
                  <select
                    aria-label={`Source type ${index + 1}`}
                    value={source.sourceType}
                    onChange={(event) => updateSource(index, 'sourceType', event.target.value)}
                  >
                  <option value="website">Official website</option>
                    <option value="google">Google</option>
                    <option value="ota">OTA</option>
                    <option value="competitor">Competitor</option>
                    <option value="operator">Operator</option>
                  </select>
                  <input
                    aria-label={`Source URL ${index + 1}`}
                    type="url"
                    value={source.url}
                    onChange={(event) => updateSource(index, 'url', event.target.value)}
                    placeholder="https://…"
                  />
                  <button type="button" className="researchRemove" onClick={() => removeSource(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button type="submit" className="primaryButton" disabled={loading}>
              {loading ? 'Researching sources…' : 'Run property research'}
            </button>
            <div className="researchRunStatus" role="status" aria-live="polite">
              {loading
                ? 'Checking the supplied sources and matching the property…'
                : result
                  ? 'Research complete. The verified result is shown below.'
                  : 'Results open automatically when verification completes.'}
            </div>
          </form>

          <section className="researchPanel researchHistory researchIndexPanel">
            <div className="researchPanelHeader">
              <div>
                <span className="metaLabel">PROPERTY UNIVERSE</span>
                <h2>Goa intelligence index</h2>
              </div>
              <span>{indexTotal} indexed</span>
            </div>
            <input
              className="researchIndexSearch"
              type="search"
              value={indexQuery}
              onChange={(event) => setIndexQuery(event.target.value)}
              placeholder="Find a property"
              aria-label="Find a Goa property"
            />
            {historyLoading || indexLoading ? <p className="emptyState">Loading intelligence index…</p> : null}
            {!historyLoading && !indexLoading && visibleIndex.length === 0 ? (
              <p className="emptyState">No independently indexed property matches this search.</p>
            ) : null}
            <div className="researchHistoryList">
              {visibleIndex.map((job) => (
                <button
                  type="button"
                  className="researchIndexRow"
                  key={`${job.id}-${job.hotelName}`}
                  onClick={() => selectIndexedProperty(job)}
                >
                  <div>
                    <strong>{job.hotelName}</strong>
                    <span>{job.area || job.city} · {job.createdAt ? formatDate(job.createdAt) : 'Independent index'}</span>
                  </div>
                  <span className="researchIndexStatus">
                    {job.status}
                  </span>
                </button>
              ))}
            </div>
            <div className="researchIndexFootnote">
              Discovery coverage expands only from independently collected public or licensed sources.
            </div>
          </section>
        </div>

        {result ? (
          <section className="researchResults" ref={resultRef}>
            <div className="researchResultHeader">
              <div>
                <span className="workspaceEyebrow">RESEARCH RESULT</span>
                <h2>{result.hotelName}</h2>
                <p>{result.summary}</p>
              </div>
              <span className={`researchConfidence ${confidenceTone(result.confidenceLabel)}`}>
                {result.confidenceLabel} confidence · {Math.round(result.confidenceScore)}%
              </span>
            </div>

            <div className="researchResultGrid">
              <section className="researchPanel">
                <h3>Verified source evidence</h3>
                {(result.evidence || []).length === 0 ? (
                  <p className="emptyState">No URLs were supplied. Add source URLs for verification.</p>
                ) : (
                  <div className="researchEvidenceList">
                    {result.evidence.map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>{item.sourceType.toUpperCase()} · {item.pageTitle || 'Untitled source'}</strong>
                          <a href={item.finalUrl || item.sourceUrl} target="_blank" rel="noreferrer">
                            Open evidence
                          </a>
                        </div>
                        <div className="researchEvidenceMetrics">
                          <span>{item.reachable ? 'Reachable' : 'Unavailable'}</span>
                          <span>{item.matchedHotelName ? 'Property matched' : 'Match unverified'}</span>
                          <span>{item.bookingEngineUrl ? 'Booking path found' : 'No booking path found'}</span>
                          {item.ratingValue != null ? <span>{item.ratingValue} rating</span> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="researchPanel">
                <h3>Competitor candidates</h3>
                {(result.competitors || []).length === 0 ? (
                  <p className="emptyState">No market-index candidates are available yet.</p>
                ) : (
                  <div className="researchCompetitorList">
                    {result.competitors.map((competitor) => (
                      <article key={competitor.id}>
                        <div>
                          <strong>{competitor.hotelName}</strong>
                          <span>{competitor.city} · {competitor.source}</span>
                        </div>
                        <div>
                          <strong>{competitor.googleRating ?? '—'}</strong>
                          <span>{competitor.reviewCount ?? 0} reviews</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                <div className="researchBoundary compact">
                  <strong>Not yet a pricing comp set</strong>
                  <span>{result.pricingBoundary?.reason}</span>
                </div>
              </section>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
