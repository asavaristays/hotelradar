import { useEffect, useState } from 'react';
import { parseServerError, readResponseBody } from '../http.js';

export default function HotelSelector({
  token,
  selectedHotelId,
  onSelect,
  onLoadDashboard,
  loading,
  reloadKey = 0,
  className = '',
}) {
  const [hotels, setHotels] = useState([]);
  const [fetchingHotels, setFetchingHotels] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchHotels() {
      setFetchingHotels(true);
      setError('');
      try {
        const response = await fetch('/hotels', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          const parsed = await parseServerError(response, 'Unable to load hotels');
          throw new Error(parsed.message || `Unable to load hotels (HTTP ${response.status}).`);
        }

        const body = await readResponseBody(response);
        const data = body.json;
        if (!cancelled) {
          setHotels(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Unable to load hotels.');
        }
      } finally {
        if (!cancelled) {
          setFetchingHotels(false);
        }
      }
    }

    fetchHotels();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const scopedHotels = hotels.filter((hotel) =>
    ['goa', 'mumbai'].includes(String(hotel?.city || '').trim().toLowerCase()),
  );

  return (
    <div className={`controls ${className}`.trim()} role="group" aria-label="Dashboard controls">
      <label className="controlLabel" htmlFor="hotelSelector">
        Hotel
      </label>
      <select
        id="hotelSelector"
        value={selectedHotelId}
        onChange={(event) => onSelect(String(event.target.value || '').trim())}
        disabled={fetchingHotels || Boolean(error)}
        aria-label="Hotel selector"
      >
        <option value="">{fetchingHotels ? 'Loading hotels...' : 'Select Hotel'}</option>
        {scopedHotels.map((hotel) => (
          <option key={hotel.id} value={hotel.id}>
            {hotel.hotel_name} ({hotel.city})
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={!selectedHotelId || loading || fetchingHotels}
        onClick={() => onLoadDashboard()}
        aria-label="Load dashboard"
      >
        {loading ? 'Loading...' : 'Load Dashboard'}
      </button>

      {error && <p className="error compactError">{error}</p>}
    </div>
  );
}
