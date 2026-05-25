import { getOpportunityScoreTone, normalizeOpportunityScore } from '../utils/leadRadarScore.js';

function renderOpportunity(opportunities = []) {
  if (!Array.isArray(opportunities) || !opportunities.length) {
    return <span className="metaLabel">No clear opportunity</span>;
  }

  return opportunities[0]?.opportunity || <span className="metaLabel">No clear opportunity</span>;
}

function renderAction(opportunities = []) {
  if (!Array.isArray(opportunities) || !opportunities.length) {
    return <span className="metaLabel">No action suggested</span>;
  }

  return opportunities[0]?.action || <span className="metaLabel">No action suggested</span>;
}

export default function LeadTable({
  hotels = [],
  total = 0,
  loading = false,
  onSelectHotel = () => {},
  selectedHotelId = null,
  onExportCsv = () => {},
  exportDisabled = true,
  savedLeadIds = [],
  savedLeadCount = 0,
  onToggleSavedLead = () => {},
}) {
  const savedLeadIdSet = new Set(savedLeadIds);

  return (
    <section className="panel leadTablePanel">
      <div className="panelHeader">
        <div className="gridMetaBlock">
          <h3>Affected Properties</h3>
          <p className="metaLabel">
            {loading ? 'Loading results...' : `${Number(total || 0)} hotel(s) matched`}
          </p>
          <p className="metaLabel">Saved Properties: {Number(savedLeadCount || 0)}</p>
        </div>
        <button
          type="button"
          className="secondaryButton"
          onClick={onExportCsv}
          disabled={exportDisabled}
        >
          Export CSV
        </button>
      </div>

      <div className="leadTableWrap">
        <table className="leadTable">
          <thead>
            <tr>
              <th aria-label="Save lead" />
              <th>Hotel</th>
              <th>City</th>
              <th>Opportunity Score</th>
              <th>Opportunity</th>
              <th>Recommended Action</th>
            </tr>
          </thead>
          <tbody>
            {!hotels.length && (
              <tr>
                <td colSpan="6" className="leadTableEmpty">No affected properties are available yet.</td>
              </tr>
            )}
            {hotels.map((hotel) => (
              <tr
                key={hotel.hotelId}
                className={selectedHotelId === hotel.hotelId ? 'leadTableRowSelected' : ''}
                onClick={() => onSelectHotel(hotel)}
              >
                <td>
                  <button
                    type="button"
                    className={`leadBookmarkButton ${savedLeadIdSet.has(hotel.hotelId) ? 'leadBookmarkButton-active' : ''}`}
                    aria-label={savedLeadIdSet.has(hotel.hotelId) ? 'Remove saved property' : 'Save property'}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleSavedLead(hotel);
                    }}
                  >
                    {savedLeadIdSet.has(hotel.hotelId) ? '★' : '☆'}
                  </button>
                </td>
                <td>{hotel.hotelName || hotel.hotelId}</td>
                <td>{hotel.city || 'Unknown'}</td>
                <td>
                  <div className="leadScoreCell">
                    <span className={`leadScoreBadge ${getOpportunityScoreTone(hotel.opportunityScore ?? hotel.leadScore)}`}>
                      {normalizeOpportunityScore(hotel.opportunityScore ?? hotel.leadScore)}
                    </span>
                  </div>
                </td>
                <td>{renderOpportunity(hotel.opportunities)}</td>
                <td>{renderAction(hotel.opportunities)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
