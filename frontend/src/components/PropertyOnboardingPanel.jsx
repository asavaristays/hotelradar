import { useEffect, useMemo, useState } from 'react';
import { parseServerError, readResponseBody } from '../http.js';

const emptyProfile = {
  hotelName: '',
  brandName: '',
  propertyType: '',
  category: '',
  country: 'India',
  state: 'Goa',
  market: 'North Goa',
  microMarket: '',
  city: '',
  pinCode: '',
  address: '',
  latitude: '',
  longitude: '',
  totalRooms: '',
  roomCategories: '',
  checkIn: '14:00',
  checkOut: '11:00',
  primaryContact: '',
  revenueContact: '',
  website: '',
  bookingEngine: '',
  positioning: '',
  sourceMarkets: '',
  weekdayGuest: '',
  weekendGuest: '',
  avgStay: '',
};

const defaultSources = [
  { sourceType: 'Official website', sourceName: 'Website', sourceUrl: '', frequency: 'Daily', active: 'Yes' },
  { sourceType: 'Booking engine', sourceName: 'Direct booking', sourceUrl: '', frequency: 'Daily', active: 'Yes' },
  { sourceType: 'Google Business Profile', sourceName: 'Google Business', sourceUrl: '', frequency: 'Weekly', active: 'Yes' },
  { sourceType: 'Google Maps', sourceName: 'Maps listing', sourceUrl: '', frequency: 'Weekly', active: 'Yes' },
  { sourceType: 'Instagram', sourceName: 'Instagram', sourceUrl: '', frequency: 'Weekly', active: 'No' },
  { sourceType: 'TripAdvisor', sourceName: 'TripAdvisor', sourceUrl: '', frequency: 'Weekly', active: 'No' },
];

const defaultOtas = ['Google Hotels', 'Agoda', 'Booking.com', 'MakeMyTrip', 'Goibibo', 'Expedia', 'Hotels.com'].map((name) => ({
  otaName: name,
  listingUrl: '',
  propertyId: '',
  status: 'Needs validation',
  capture: name === 'Google Hotels' ? 'Yes' : 'No',
}));

const defaultRooms = [
  {
    roomName: '',
    code: '',
    inventory: '',
    occupancy: '2 adults',
    bedType: '',
    mealPlan: 'Breakfast + flexible cancellation',
    minRate: '',
    maxRate: '',
  },
];

const defaultCompetitors = Array.from({ length: 5 }, () => ({
  hotelName: '',
  websiteUrl: '',
  mapsUrl: '',
  category: '',
  priceSegment: '',
  direct: 'Review',
}));

const captureFlow = [
  'Property profile',
  'Source registry',
  'Scheduled capture',
  'Raw observations',
  'Validation',
  'Normalization',
  'Revenue Intelligence',
];

const PILOT_PROPERTY_ID = '10101010-1010-4010-8010-101010101010';

async function requestJson(path, token, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const parsed = await parseServerError(response, 'Request failed');
    throw new Error(parsed.message || `Request failed (${response.status})`);
  }

  const body = await readResponseBody(response);
  return body.json ?? null;
}

function updateArrayRow(rows, index, key, value) {
  return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row));
}

function completionScore({ profile, sources, otas, rooms, competitors }) {
  const requiredProfile = [
    'hotelName',
    'propertyType',
    'category',
    'address',
    'city',
    'microMarket',
    'totalRooms',
    'website',
    'bookingEngine',
  ];
  const profileDone = requiredProfile.filter((key) => String(profile[key] || '').trim()).length;
  const sourceDone = sources.filter((source) => String(source.sourceUrl || '').trim()).length;
  const otaDone = otas.filter((ota) => String(ota.listingUrl || '').trim()).length;
  const roomDone = rooms.filter((room) => String(room.roomName || '').trim() && String(room.inventory || '').trim()).length;
  const compDone = competitors.filter((comp) => String(comp.hotelName || '').trim()).length;
  const total = requiredProfile.length + sources.length + otas.length + rooms.length + competitors.length;
  const done = profileDone + sourceDone + otaDone + roomDone + compDone;
  return Math.round((done / Math.max(1, total)) * 100);
}

function Field({ label, value, onChange, type = 'text', placeholder = '', required = false }) {
  return (
    <label className="poField">
      <span>{label}{required ? ' *' : ''}</span>
      <input type={type} value={value} placeholder={placeholder} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options, required = false }) {
  return (
    <label className="poField">
      <span>{label}{required ? ' *' : ''}</span>
      <select value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

export default function PropertyOnboardingPanel({ token, onPropertyReady }) {
  const [profile, setProfile] = useState(emptyProfile);
  const [sources, setSources] = useState(defaultSources);
  const [otas, setOtas] = useState(defaultOtas);
  const [rooms, setRooms] = useState(defaultRooms);
  const [competitors, setCompetitors] = useState(defaultCompetitors);
  const [saved, setSaved] = useState('');
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const score = useMemo(
    () => completionScore({ profile, sources, otas, rooms, competitors }),
    [profile, sources, otas, rooms, competitors],
  );
  const stateOptions = useMemo(() => states.map((state) => state.name).filter(Boolean), [states]);
  const cityOptions = useMemo(() => {
    const state = states.find((row) => row.name === profile.state);
    const filtered = state ? cities.filter((city) => city.state_id === state.id) : cities;
    return filtered.map((city) => city.name).filter(Boolean);
  }, [cities, states, profile.state]);
  const selectedState = states.find((state) => state.name === profile.state);
  const selectedCity = cities.find((city) =>
    city.name === profile.city && (!selectedState || city.state_id === selectedState.id));
  const existingPilotProperties = useMemo(
    () => properties.filter((property) => String(property.id) === PILOT_PROPERTY_ID),
    [properties],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadFoundationMeta() {
      if (!token) return;
      setLoadingMeta(true);
      setError('');
      try {
        const [stateRows, cityRows, propertyRows] = await Promise.all([
          requestJson('/admin/states', token),
          requestJson('/admin/cities', token),
          requestJson('/admin/hotels', token),
        ]);
        if (cancelled) return;
        setStates(Array.isArray(stateRows) ? stateRows : []);
        setCities(Array.isArray(cityRows) ? cityRows : []);
        setProperties(Array.isArray(propertyRows) ? propertyRows : []);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to load onboarding foundation.');
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    }

    loadFoundationMeta();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function setProfileField(key, value) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function handleSaveDraft() {
    const payload = { profile, sources, otas, rooms, competitors, savedAt: new Date().toISOString() };
    const key = selectedPropertyId
      ? `hotelradar_property_intelligence_profile_${selectedPropertyId}`
      : 'hotelradar_property_intelligence_profile_draft';
    window.localStorage.setItem(key, JSON.stringify(payload));
    setSaved(selectedPropertyId ? 'Property Intelligence Profile draft saved for selected property.' : 'Property Intelligence Profile draft prepared locally.');
  }

  async function refreshProperties() {
    const propertyRows = await requestJson('/admin/hotels', token);
    setProperties(Array.isArray(propertyRows) ? propertyRows : []);
  }

  function applyExistingProperty(propertyId) {
    const property = existingPilotProperties.find((row) => row.id === propertyId);
    setSelectedPropertyId(propertyId);
    if (!property) return;
    const city = cities.find((row) => row.id === property.city_id);
    const state = states.find((row) => row.id === city?.state_id);
    setProfile((current) => ({
      ...current,
      hotelName: property.hotel_name || property.name || current.hotelName,
      city: city?.name || property.city || current.city,
      state: state?.name || current.state,
      totalRooms: property.room_count || current.totalRooms,
      category: current.category || 'Upscale',
    }));
  }

  async function handleCreateProperty() {
    setError('');
    setSaved('');
    if (!token) {
      setError('Session token is missing.');
      return;
    }
    if (!profile.hotelName.trim()) {
      setError('Hotel name is required.');
      return;
    }
    if (!selectedCity?.id) {
      setError('Select a valid city from the city list before creating the property.');
      return;
    }

    const room = rooms[0] || {};
    const minRate = Number(room.minRate || 2500);
    const maxRate = Number(room.maxRate || Math.max(minRate, 15000));
    const payload = {
      hotel_name: profile.hotelName.trim(),
      city_id: selectedCity.id,
      room_count: Number(profile.totalRooms || room.inventory || 40),
      base_price_min: Number.isFinite(minRate) && minRate > 0 ? minRate : 2500,
      base_price_max: Number.isFinite(maxRate) && maxRate > 0 ? Math.max(maxRate, minRate || 2500) : 15000,
      alert_sensitivity: 'balanced',
      comp_set_json: competitors
        .filter((competitor) => competitor.hotelName.trim())
        .map((competitor) => ({
          name: competitor.hotelName.trim(),
          website_url: competitor.websiteUrl.trim(),
          google_maps_url: competitor.mapsUrl.trim(),
          category: competitor.category.trim(),
          price_segment: competitor.priceSegment.trim(),
          status: competitor.direct,
        })),
    };

    setSaving(true);
    try {
      const created = await requestJson('/admin/hotels', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const hotel = created?.hotel;
      if (!hotel?.id) throw new Error('Property creation failed.');
      setSelectedPropertyId(hotel.id);
      window.localStorage.setItem(
        `hotelradar_property_intelligence_profile_${hotel.id}`,
        JSON.stringify({ profile, sources, otas, rooms, competitors, savedAt: new Date().toISOString() }),
      );
      await refreshProperties();
      setSaved(`${hotel.hotel_name} created and connected to Revenue Intelligence.`);
      if (onPropertyReady) {
        onPropertyReady({
          hotelId: hotel.id,
          hotelName: hotel.hotel_name,
          message: `${hotel.hotel_name} connected to Revenue Intelligence.`,
        });
      }
    } catch (saveError) {
      setError(saveError.message || 'Unable to create property.');
    } finally {
      setSaving(false);
    }
  }

  function handleOpenSelectedProperty() {
    const property = existingPilotProperties.find((row) => row.id === selectedPropertyId);
    if (!property?.id) {
      setError('Select an existing property first.');
      return;
    }
    handleSaveDraft();
    if (onPropertyReady) {
      onPropertyReady({
        hotelId: property.id,
        hotelName: property.hotel_name,
        message: `${property.hotel_name} opened in Revenue Intelligence.`,
      });
    }
  }

  function handleClear() {
    window.localStorage.removeItem('hotelradar_property_intelligence_profile_draft');
    setProfile(emptyProfile);
    setSources(defaultSources);
    setOtas(defaultOtas);
    setRooms(defaultRooms);
    setCompetitors(defaultCompetitors);
    setSaved('Fresh Property Intelligence Profile cleared.');
  }

  return (
    <section className="poBoard" aria-label="Property Intelligence Profile onboarding">
      <header className="poHeader">
        <div>
          <span>Property Intelligence Profile</span>
          <h1>Add Property</h1>
          <p>
            Start with verified identity, source registry, room configuration, OTA links,
            competitor setup, and capture rules before any Revenue Intelligence output is produced.
          </p>
        </div>
        <div className="poReadiness">
          <span>Profile readiness</span>
          <em>{score}%</em>
          <small>Foundation completeness</small>
        </div>
      </header>

      <div className="poActionBar">
        <button type="button" onClick={handleCreateProperty} disabled={saving || loadingMeta}>{saving ? 'Creating…' : 'Create and open'}</button>
        <button type="button" className="secondaryButton" onClick={handleOpenSelectedProperty} disabled={!selectedPropertyId}>Open selected</button>
        <button type="button" className="secondaryButton" onClick={handleSaveDraft}>Save profile draft</button>
        <button type="button" className="secondaryButton" onClick={handleClear}>Clear foundation</button>
        {error ? <p className="poError">{error}</p> : null}
        {saved ? <p>{saved}</p> : null}
      </div>

      <section className="poPanel">
        <div className="poPanelHeader">
          <span>Existing pilot property</span>
          <p>Only The Ten is used as the current existing reference. Other legacy database records are ignored in this flow.</p>
        </div>
        <div className="poExistingGrid">
          <label className="poField">
            <span>Property</span>
            <select value={selectedPropertyId} onChange={(event) => applyExistingProperty(event.target.value)}>
              <option value="">{loadingMeta ? 'Loading The Ten…' : 'Select The Ten'}</option>
              {existingPilotProperties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.hotel_name} ({property.city || 'City not set'})
                </option>
              ))}
            </select>
          </label>
          <article>
            <span>Connection</span>
            <em>{selectedPropertyId ? 'Ready to open' : 'Waiting for selection'}</em>
            <small>New properties can still be created and opened directly after onboarding.</small>
          </article>
        </div>
      </section>

      <section className="poPanel">
        <div className="poPanelHeader">
          <span>Identity</span>
          <p>Micro-market and official identity are required before source matching.</p>
        </div>
        <div className="poFormGrid">
          <Field label="Hotel name" value={profile.hotelName} required onChange={(value) => setProfileField('hotelName', value)} />
          <Field label="Brand name" value={profile.brandName} onChange={(value) => setProfileField('brandName', value)} />
          <SelectField label="Property type" value={profile.propertyType} required onChange={(value) => setProfileField('propertyType', value)} options={['Boutique hotel', 'Resort', 'Villa', 'Business hotel', 'Wellness retreat', 'Extended stay']} />
          <SelectField label="Category" value={profile.category} onChange={(value) => setProfileField('category', value)} options={['Budget', 'Midscale', 'Upper-midscale', 'Upscale', 'Luxury', 'Boutique luxury']} />
          <Field label="Country" value={profile.country} onChange={(value) => setProfileField('country', value)} />
          {stateOptions.length ? (
            <SelectField label="State" value={profile.state} onChange={(value) => setProfileField('state', value)} options={stateOptions} />
          ) : (
            <Field label="State" value={profile.state} onChange={(value) => setProfileField('state', value)} />
          )}
          <Field label="Market" value={profile.market} onChange={(value) => setProfileField('market', value)} placeholder="North Goa" />
          <Field label="Micro-market" value={profile.microMarket} onChange={(value) => setProfileField('microMarket', value)} placeholder="Siolim–Assagao" />
          {cityOptions.length ? (
            <SelectField label="City" value={profile.city} required onChange={(value) => setProfileField('city', value)} options={cityOptions} />
          ) : (
            <Field label="City" value={profile.city} required onChange={(value) => setProfileField('city', value)} />
          )}
          <Field label="PIN code" value={profile.pinCode} onChange={(value) => setProfileField('pinCode', value)} />
          <Field label="Latitude" value={profile.latitude} onChange={(value) => setProfileField('latitude', value)} />
          <Field label="Longitude" value={profile.longitude} onChange={(value) => setProfileField('longitude', value)} />
          <Field label="Total rooms" type="number" value={profile.totalRooms} onChange={(value) => setProfileField('totalRooms', value)} />
          <Field label="Room categories" type="number" value={profile.roomCategories} onChange={(value) => setProfileField('roomCategories', value)} />
          <Field label="Check-in" value={profile.checkIn} onChange={(value) => setProfileField('checkIn', value)} />
          <Field label="Check-out" value={profile.checkOut} onChange={(value) => setProfileField('checkOut', value)} />
          <Field label="Primary contact" value={profile.primaryContact} onChange={(value) => setProfileField('primaryContact', value)} />
          <Field label="Revenue contact" value={profile.revenueContact} onChange={(value) => setProfileField('revenueContact', value)} />
          <Field label="Website" value={profile.website} onChange={(value) => setProfileField('website', value)} />
          <Field label="Booking-engine link" value={profile.bookingEngine} onChange={(value) => setProfileField('bookingEngine', value)} />
        </div>
        <label className="poField poWideField">
          <span>Full address</span>
          <textarea value={profile.address} onChange={(event) => setProfileField('address', event.target.value)} />
        </label>
      </section>

      <section className="poPanel">
        <div className="poPanelHeader">
          <span>Source registry</span>
          <p>Every source gets a URL, method, frequency, reliability, and health state.</p>
        </div>
        <div className="poTable poSourceTable">
          <span>Source type</span>
          <span>Name</span>
          <span>URL</span>
          <span>Frequency</span>
          <span>Active</span>
          {sources.map((source, index) => (
            <div className="poTableRow" key={source.sourceType}>
              <input value={source.sourceType} onChange={(event) => setSources((rows) => updateArrayRow(rows, index, 'sourceType', event.target.value))} />
              <input value={source.sourceName} onChange={(event) => setSources((rows) => updateArrayRow(rows, index, 'sourceName', event.target.value))} />
              <input value={source.sourceUrl} placeholder="https://" onChange={(event) => setSources((rows) => updateArrayRow(rows, index, 'sourceUrl', event.target.value))} />
              <select value={source.frequency} onChange={(event) => setSources((rows) => updateArrayRow(rows, index, 'frequency', event.target.value))}>
                <option>Hourly</option>
                <option>Daily</option>
                <option>Weekly</option>
              </select>
              <select value={source.active} onChange={(event) => setSources((rows) => updateArrayRow(rows, index, 'active', event.target.value))}>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="poPanel">
        <div className="poPanelHeader">
          <span>OTA links</span>
          <p>Exact listing URLs prevent wrong-property matching.</p>
        </div>
        <div className="poTable poOtaTable">
          <span>OTA</span>
          <span>Listing URL</span>
          <span>Property ID</span>
          <span>Status</span>
          <span>Capture</span>
          {otas.map((ota, index) => (
            <div className="poTableRow" key={ota.otaName}>
              <input value={ota.otaName} onChange={(event) => setOtas((rows) => updateArrayRow(rows, index, 'otaName', event.target.value))} />
              <input value={ota.listingUrl} placeholder="https://" onChange={(event) => setOtas((rows) => updateArrayRow(rows, index, 'listingUrl', event.target.value))} />
              <input value={ota.propertyId} onChange={(event) => setOtas((rows) => updateArrayRow(rows, index, 'propertyId', event.target.value))} />
              <select value={ota.status} onChange={(event) => setOtas((rows) => updateArrayRow(rows, index, 'status', event.target.value))}>
                <option>Needs validation</option>
                <option>Validated</option>
                <option>Rejected</option>
              </select>
              <select value={ota.capture} onChange={(event) => setOtas((rows) => updateArrayRow(rows, index, 'capture', event.target.value))}>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <div className="poTwoColumn">
        <section className="poPanel">
          <div className="poPanelHeader">
            <span>Room and rate products</span>
            <p>Comparable rates require comparable room products.</p>
          </div>
          {rooms.map((room, index) => (
            <div className="poRoomCard" key={`room-${index + 1}`}>
              <Field label="Room name" value={room.roomName} onChange={(value) => setRooms((rows) => updateArrayRow(rows, index, 'roomName', value))} />
              <Field label="Internal code" value={room.code} onChange={(value) => setRooms((rows) => updateArrayRow(rows, index, 'code', value))} />
              <Field label="Inventory" type="number" value={room.inventory} onChange={(value) => setRooms((rows) => updateArrayRow(rows, index, 'inventory', value))} />
              <Field label="Occupancy" value={room.occupancy} onChange={(value) => setRooms((rows) => updateArrayRow(rows, index, 'occupancy', value))} />
              <Field label="Bed type" value={room.bedType} onChange={(value) => setRooms((rows) => updateArrayRow(rows, index, 'bedType', value))} />
              <Field label="Reference rate plan" value={room.mealPlan} onChange={(value) => setRooms((rows) => updateArrayRow(rows, index, 'mealPlan', value))} />
              <Field label="Minimum rate" type="number" value={room.minRate} onChange={(value) => setRooms((rows) => updateArrayRow(rows, index, 'minRate', value))} />
              <Field label="Maximum rate" type="number" value={room.maxRate} onChange={(value) => setRooms((rows) => updateArrayRow(rows, index, 'maxRate', value))} />
            </div>
          ))}
        </section>

        <section className="poPanel">
          <div className="poPanelHeader">
            <span>Reference shopping rule</span>
            <p>This becomes the standard comparison context.</p>
          </div>
          <div className="poRuleList">
            <article><span>Occupancy</span><em>2 adults</em></article>
            <article><span>Rooms</span><em>1</em></article>
            <article><span>Length of stay</span><em>1 night</em></article>
            <article><span>Rate plan</span><em>Breakfast included</em></article>
            <article><span>Cancellation</span><em>Flexible</em></article>
            <article><span>Tax treatment</span><em>Final payable rate</em></article>
            <article><span>Reference room</span><em>Entry-level comparable room</em></article>
          </div>
          <label className="poField poWideField">
            <span>Commercial positioning</span>
            <textarea value={profile.positioning} onChange={(event) => setProfileField('positioning', event.target.value)} placeholder="Boutique, luxury, resort, wedding, leisure..." />
          </label>
          <Field label="Main source markets" value={profile.sourceMarkets} onChange={(value) => setProfileField('sourceMarkets', value)} />
          <Field label="Typical weekday guest" value={profile.weekdayGuest} onChange={(value) => setProfileField('weekdayGuest', value)} />
          <Field label="Typical weekend guest" value={profile.weekendGuest} onChange={(value) => setProfileField('weekendGuest', value)} />
          <Field label="Average length of stay" value={profile.avgStay} onChange={(value) => setProfileField('avgStay', value)} />
        </section>
      </div>

      <section className="poPanel">
        <div className="poPanelHeader">
          <span>Competitor setup</span>
          <p>Direct competitors should be approved before they influence Revenue Intelligence.</p>
        </div>
        <div className="poTable poCompTable">
          <span>Hotel</span>
          <span>Website</span>
          <span>Google Maps</span>
          <span>Category</span>
          <span>Segment</span>
          <span>Status</span>
          {competitors.map((competitor, index) => (
            <div className="poTableRow" key={`competitor-${index + 1}`}>
              <input value={competitor.hotelName} onChange={(event) => setCompetitors((rows) => updateArrayRow(rows, index, 'hotelName', event.target.value))} />
              <input value={competitor.websiteUrl} onChange={(event) => setCompetitors((rows) => updateArrayRow(rows, index, 'websiteUrl', event.target.value))} />
              <input value={competitor.mapsUrl} onChange={(event) => setCompetitors((rows) => updateArrayRow(rows, index, 'mapsUrl', event.target.value))} />
              <input value={competitor.category} onChange={(event) => setCompetitors((rows) => updateArrayRow(rows, index, 'category', event.target.value))} />
              <input value={competitor.priceSegment} onChange={(event) => setCompetitors((rows) => updateArrayRow(rows, index, 'priceSegment', event.target.value))} />
              <select value={competitor.direct} onChange={(event) => setCompetitors((rows) => updateArrayRow(rows, index, 'direct', event.target.value))}>
                <option>Review</option>
                <option>Direct comp-set</option>
                <option>Market reference</option>
                <option>Rejected</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="poPanel">
        <div className="poPanelHeader">
          <span>Capture foundation</span>
          <p>Every source produces raw observations before validation and normalization.</p>
        </div>
        <div className="poFlow">
          {captureFlow.map((item, index) => (
            <article key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{item}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
