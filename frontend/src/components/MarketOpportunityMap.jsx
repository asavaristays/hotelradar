import { useMemo } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { normalizeOpportunityScore } from '../utils/leadRadarScore.js';

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeHotels(hotels = []) {
  return hotels
    .map((hotel) => {
      const latitude = toNumber(
        hotel?.latitude ?? hotel?.lat ?? hotel?.venueLat ?? hotel?.context?.latitude,
      );
      const longitude = toNumber(
        hotel?.longitude ?? hotel?.lng ?? hotel?.venueLng ?? hotel?.context?.longitude,
      );

      if (latitude === null || longitude === null) {
        return null;
      }

      return {
        ...hotel,
        latitude,
        longitude,
      };
    })
    .filter(Boolean);
}

function getMarkerColor(score) {
  const safeScore = normalizeOpportunityScore(score);
  if (safeScore >= 80) return '#dc2626';
  if (safeScore >= 50) return '#f97316';
  return '#16a34a';
}

function getMapCenter(hotels) {
  const totals = hotels.reduce(
    (acc, hotel) => ({
      lat: acc.lat + hotel.latitude,
      lng: acc.lng + hotel.longitude,
    }),
    { lat: 0, lng: 0 },
  );

  return [
    totals.lat / hotels.length,
    totals.lng / hotels.length,
  ];
}

export default function MarketOpportunityMap({ hotels = [], onSelectHotel = () => {} }) {
  const mappedHotels = useMemo(() => normalizeHotels(hotels), [hotels]);

  if (!mappedHotels.length) {
    return null;
  }

  const center = getMapCenter(mappedHotels);
  const zoom = mappedHotels.length === 1 ? 13 : 11;

  return (
    <section className="panel leadRadarOpportunityMap">
      <div className="panelHeader">
        <div className="gridMetaBlock">
          <h3>Market Opportunity Map</h3>
          <p className="metaLabel">Geographic view of currently loaded hotel opportunities.</p>
        </div>
      </div>
      <div className="leadRadarOpportunityMapViewport">
        <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} className="leadRadarLeafletMap">
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {mappedHotels.map((hotel) => (
            <CircleMarker
              key={hotel.hotelId}
              center={[hotel.latitude, hotel.longitude]}
              radius={10}
              pathOptions={{
                color: getMarkerColor(hotel.opportunityScore ?? hotel.leadScore),
                fillColor: getMarkerColor(hotel.opportunityScore ?? hotel.leadScore),
                fillOpacity: 0.8,
                weight: 2,
              }}
              eventHandlers={{
                click: () => onSelectHotel(hotel),
              }}
            >
              <Popup>
                <strong>{hotel.hotelName || hotel.hotelId}</strong>
                <br />
                Opportunity Score: {normalizeOpportunityScore(hotel.opportunityScore ?? hotel.leadScore)}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </section>
  );
}
