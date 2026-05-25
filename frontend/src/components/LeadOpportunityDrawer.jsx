import { getOpportunityScoreTone, normalizeOpportunityScore } from '../utils/leadRadarScore.js';

function getPrimaryOpportunity(hotel) {
  if (!Array.isArray(hotel?.opportunities) || !hotel.opportunities.length) {
    return {
      opportunity: 'No clear opportunity',
      action: 'No action suggested',
    };
  }

  return {
    opportunity: hotel.opportunities[0]?.opportunity || 'No clear opportunity',
    action: hotel.opportunities[0]?.action || 'No action suggested',
  };
}

function getSuggestedServices(action) {
  switch (action) {
    case 'Improve reviews':
      return ['Reputation improvement'];
    case 'Install AI concierge':
      return ['AI concierge installation'];
    case 'Optimize direct conversion':
      return ['Direct booking optimization'];
    default:
      return [];
  }
}

function buildSuggestedServices(signals = [], primaryAction) {
  const services = new Set(getSuggestedServices(primaryAction));

  if (signals.includes('LOW_RATING')) services.add('Reputation improvement');
  if (signals.includes('NO_CHATBOT')) services.add('AI concierge installation');
  if (signals.includes('HIGH_REVIEW_VOLUME')) services.add('Review optimization');
  if (signals.includes('OTA_PRESENT')) services.add('Direct booking optimization');

  return [...services];
}

function formatPercentile(value, suffix) {
  if (value === null || value === undefined || value === '') return null;
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) return null;
  return `Top ${safeValue}% ${suffix}`;
}

function formatAdoptionRate(value) {
  if (value === null || value === undefined || value === '') return null;
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) return null;
  return `${safeValue}% of hotels in this city use chatbots`;
}

function getSegmentBadgeTone(segment) {
  switch (String(segment || '').toUpperCase()) {
    case 'CORPORATE':
      return 'leadSegmentBadge-corporate';
    case 'WEDDING':
      return 'leadSegmentBadge-wedding';
    case 'GROUP':
      return 'leadSegmentBadge-group';
    case 'LEISURE':
      return 'leadSegmentBadge-leisure';
    default:
      return '';
  }
}

export default function LeadOpportunityDrawer({ hotel, open = false, onClose = () => {} }) {
  if (!open || !hotel) {
    return null;
  }

  const primaryOpportunity = getPrimaryOpportunity(hotel);
  const signals = Array.isArray(hotel?.signals) ? hotel.signals : [];
  const suggestedServices = buildSuggestedServices(signals, primaryOpportunity.action);
  const segmentOpportunities = Array.isArray(hotel?.segmentOpportunities)
    ? hotel.segmentOpportunities
    : [];
  const marketContext = [
    {
      label: 'Rating Position',
      value: formatPercentile(hotel?.context?.ratingPercentile, 'in city'),
    },
    {
      label: 'Review Volume Position',
      value: formatPercentile(hotel?.context?.reviewVolumePercentile, 'by review volume'),
    },
    {
      label: 'Chatbot Adoption',
      value: formatAdoptionRate(hotel?.context?.chatbotAdoptionRate),
    },
  ].filter((entry) => entry.value);

  return (
    <div className="leadOpportunityDrawerOverlay" onClick={onClose} role="presentation">
      <aside
        className="panel leadOpportunityDrawer"
        onClick={(event) => event.stopPropagation()}
        aria-label="Opportunity insights"
      >
        <div className="leadOpportunityDrawerHeader">
          <div>
            <h3>{hotel.hotelName || hotel.hotelId}</h3>
            <p className="metaLabel">{hotel.city || 'Unknown city'}</p>
          </div>
          <button
            type="button"
            className="leadDrawerCloseButton"
            onClick={onClose}
            aria-label="Close opportunity insights"
          >
            ×
          </button>
        </div>

        <section className="leadOpportunityBlock">
          <span className="metaLabel">Opportunity Score</span>
          <div className="leadScoreCell">
            <span className={`leadScoreBadge ${getOpportunityScoreTone(hotel.opportunityScore ?? hotel.leadScore)}`}>
              {normalizeOpportunityScore(hotel.opportunityScore ?? hotel.leadScore)}
            </span>
          </div>
        </section>

        <section className="leadOpportunityBlock">
          <span className="metaLabel">Opportunity</span>
          <p>{primaryOpportunity.opportunity}</p>
        </section>

        <section className="leadOpportunityBlock">
          <span className="metaLabel">Recommended Action</span>
          <p>{primaryOpportunity.action}</p>
        </section>

        <section className="leadOpportunityBlock">
          <span className="metaLabel">Signals</span>
          {signals.length ? (
            <ul className="leadOpportunityServices">
              {signals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          ) : (
            <p className="metaLabel">No signals available.</p>
          )}
        </section>

        {marketContext.length > 0 && (
          <section className="leadOpportunityBlock">
            <span className="metaLabel">Market Context</span>
            <div className="leadOpportunityContextList">
              {marketContext.map((entry) => (
                <p key={entry.label}>
                  <strong>{entry.label}:</strong> {entry.value}
                </p>
              ))}
            </div>
          </section>
        )}

        {segmentOpportunities.length > 0 && (
          <section className="leadOpportunityBlock">
            <span className="metaLabel">Segment Opportunities</span>
            <div className="leadSegmentOpportunityList">
              {segmentOpportunities.map((entry) => (
                <div key={`${entry.segment}-${entry.opportunity}`} className="leadSegmentOpportunityCard">
                  <span className={`leadSegmentBadge ${getSegmentBadgeTone(entry.segment)}`}>
                    {entry.segment}
                  </span>
                  <p><strong>Opportunity:</strong> {entry.opportunity}</p>
                  <p><strong>Recommended Action:</strong> {entry.action}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="leadOpportunityBlock">
          <span className="metaLabel">Suggested Services</span>
          {suggestedServices.length ? (
            <ul className="leadOpportunityServices">
              {suggestedServices.map((service) => (
                <li key={service}>{service}</li>
              ))}
            </ul>
          ) : (
            <p className="metaLabel">No suggested services available.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
