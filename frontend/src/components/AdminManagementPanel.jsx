import { useEffect, useMemo, useState } from 'react';
import { parseServerError, readResponseBody } from '../http.js';

const PROFILE_PAGE_SIZE = 25;

const defaultStateForm = {
  name: '',
  country: 'India',
  timezone: 'Asia/Kolkata',
};

const defaultCityForm = {
  name: '',
  state_id: '',
  airport_code: '',
  season_profile_id: '',
  holiday_calendar_id: '',
};

const defaultHotelForm = {
  hotel_name: '',
  state_id: '',
  city_id: '',
  room_count: 40,
  base_price_min: 2500,
  base_price_max: 15000,
  alert_sensitivity: 'balanced',
};

const defaultUserForm = {
  full_name: '',
  email: '',
  mobile_no: '',
  password: '',
};

const defaultProfileFilters = {
  state_id: '',
  city_id: '',
  subscription_status: 'active',
  search: '',
};

const defaultProfileForm = {
  id: '',
  hotel_name: '',
  state_id: '',
  city_id: '',
  room_count: 40,
  base_price_min: 2500,
  base_price_max: 15000,
  alert_sensitivity: 'balanced',
  subscription_status: 'active',
};

const defaultProfileUser = {
  full_name: '',
  email: '',
  mobile_no: '',
  password: '',
};

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

function formatDateTime(value) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString();
}

export default function AdminManagementPanel({ role, token, onHotelCreated }) {
  const isSuperAdmin = role === 'super_admin';

  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [seasonProfiles, setSeasonProfiles] = useState([]);
  const [holidayCalendars, setHolidayCalendars] = useState([]);

  const [hotelProfiles, setHotelProfiles] = useState([]);
  const [usageRows, setUsageRows] = useState([]);
  const [resetRequests, setResetRequests] = useState([]);

  const [metaLoading, setMetaLoading] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const [metaError, setMetaError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const [stateForm, setStateForm] = useState(defaultStateForm);
  const [cityForm, setCityForm] = useState(defaultCityForm);
  const [hotelForm, setHotelForm] = useState(defaultHotelForm);
  const [hotelUserForm, setHotelUserForm] = useState(defaultUserForm);

  const [profileFilters, setProfileFilters] = useState(defaultProfileFilters);
  const [profileForm, setProfileForm] = useState(defaultProfileForm);
  const [profileUser, setProfileUser] = useState(defaultProfileUser);

  const [resolvePasswordMap, setResolvePasswordMap] = useState({});
  const [activeSection, setActiveSection] = useState(isSuperAdmin ? 'state' : 'city');
  const [selectedHotelIds, setSelectedHotelIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('paused');
  const [profileView, setProfileView] = useState('table');
  const [profilePage, setProfilePage] = useState(1);

  const onboardingCities = useMemo(() => {
    if (!hotelForm.state_id) return [];
    return cities.filter((city) => city.state_id === hotelForm.state_id);
  }, [cities, hotelForm.state_id]);

  const filterCities = useMemo(() => {
    if (!profileFilters.state_id) return [];
    return cities.filter((city) => city.state_id === profileFilters.state_id);
  }, [cities, profileFilters.state_id]);

  const profileEditableCities = useMemo(() => {
    if (!profileForm.state_id) return [];
    return cities.filter((city) => city.state_id === profileForm.state_id);
  }, [cities, profileForm.state_id]);

  const profilePageCount = Math.max(1, Math.ceil(hotelProfiles.length / PROFILE_PAGE_SIZE));
  const pagedHotelProfiles = useMemo(() => {
    const start = (profilePage - 1) * PROFILE_PAGE_SIZE;
    return hotelProfiles.slice(start, start + PROFILE_PAGE_SIZE);
  }, [hotelProfiles, profilePage]);

  useEffect(() => {
    setProfilePage((prev) => (prev > profilePageCount ? profilePageCount : prev));
  }, [profilePageCount]);

  useEffect(() => {
    if (!hotelForm.state_id) return;
    if (!onboardingCities.find((city) => city.id === hotelForm.city_id)) {
      setHotelForm((prev) => ({ ...prev, city_id: '' }));
    }
  }, [hotelForm.state_id, hotelForm.city_id, onboardingCities]);

  async function loadMetadata() {
    setMetaLoading(true);
    setMetaError('');
    try {
      const [statesRes, citiesRes, seasonRes, calendarRes] = await Promise.all([
        requestJson('/admin/states', token),
        requestJson('/admin/cities', token),
        requestJson('/admin/season-profiles', token),
        requestJson('/admin/holiday-calendars', token),
      ]);

      const safeStates = Array.isArray(statesRes) ? statesRes : [];
      const safeCities = Array.isArray(citiesRes) ? citiesRes : [];
      const safeProfiles = Array.isArray(seasonRes) ? seasonRes : [];

      setStates(safeStates);
      setCities(safeCities);
      setSeasonProfiles(safeProfiles);
      setHolidayCalendars(Array.isArray(calendarRes) ? calendarRes : []);

      setCityForm((prev) => ({
        ...prev,
        state_id: prev.state_id || safeStates?.[0]?.id || '',
        season_profile_id: prev.season_profile_id || safeProfiles?.[0]?.id || '',
      }));
      setHotelForm((prev) => ({
        ...prev,
        state_id: prev.state_id || safeStates?.[0]?.id || '',
      }));
    } catch (error) {
      setMetaError(error.message || 'Unable to load metadata.');
    } finally {
      setMetaLoading(false);
    }
  }

  async function loadHotelProfiles(filters = profileFilters) {
    setProfilesLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.state_id) params.set('state_id', filters.state_id);
      if (filters.city_id) params.set('city_id', filters.city_id);
      if (filters.subscription_status) params.set('subscription_status', filters.subscription_status);
      if (filters.search.trim()) params.set('search', filters.search.trim());
      const rows = await requestJson(`/admin/hotels${params.size ? `?${params.toString()}` : ''}`, token);
      const safeRows = Array.isArray(rows) ? rows : [];
      setHotelProfiles(safeRows);
      setSelectedHotelIds((prev) => prev.filter((id) => safeRows.some((row) => row.id === id)));
    } catch (error) {
      setActionError(error.message || 'Unable to load hotel profiles.');
    } finally {
      setProfilesLoading(false);
    }
  }

  async function loadUsage() {
    setAnalyticsLoading(true);
    try {
      const rows = await requestJson('/admin/usage', token);
      setUsageRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setActionError(error.message || 'Unable to load usage analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function loadResetRequests() {
    setRequestsLoading(true);
    try {
      const rows = await requestJson('/admin/password-reset-requests?status=pending', token);
      setResetRequests(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setActionError(error.message || 'Unable to load password reset requests.');
    } finally {
      setRequestsLoading(false);
    }
  }

  useEffect(() => {
    loadMetadata();
    loadHotelProfiles(defaultProfileFilters);
    loadUsage();
    loadResetRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleStateSubmit(event) {
    event.preventDefault();
    setActionError('');
    setActionSuccess('');

    try {
      const payload = {
        name: stateForm.name.trim(),
        country: stateForm.country.trim() || 'India',
        timezone: stateForm.timezone.trim() || 'Asia/Kolkata',
      };
      if (!payload.name) throw new Error('State name is required.');

      const created = await requestJson('/admin/states', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setStates((prev) => [...prev.filter((row) => row.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name)));
      setStateForm(defaultStateForm);
      setActionSuccess(`State saved: ${created.name}`);
    } catch (error) {
      setActionError(error.message || 'Unable to save state.');
    }
  }

  async function handleCitySubmit(event) {
    event.preventDefault();
    setActionError('');
    setActionSuccess('');

    try {
      const payload = {
        name: cityForm.name.trim(),
        state_id: cityForm.state_id,
        airport_code: cityForm.airport_code.trim() || null,
        season_profile_id: cityForm.season_profile_id,
        holiday_calendar_id: cityForm.holiday_calendar_id || null,
      };
      if (!payload.name || !payload.state_id || !payload.season_profile_id) {
        throw new Error('City name, state, and season profile are required.');
      }

      await requestJson('/admin/cities', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      await loadMetadata();
      setCityForm((prev) => ({ ...prev, name: '', airport_code: '' }));
      setActionSuccess(`City saved: ${payload.name}`);
    } catch (error) {
      setActionError(error.message || 'Unable to save city.');
    }
  }

  async function handleHotelSubmit(event) {
    event.preventDefault();
    setActionError('');
    setActionSuccess('');

    try {
      const payload = {
        hotel_name: hotelForm.hotel_name.trim(),
        city_id: hotelForm.city_id,
        room_count: Number(hotelForm.room_count),
        base_price_min: Number(hotelForm.base_price_min),
        base_price_max: Number(hotelForm.base_price_max),
        alert_sensitivity: hotelForm.alert_sensitivity,
        user_profile: hotelUserForm.email
          ? {
              email: hotelUserForm.email.trim().toLowerCase(),
              password: hotelUserForm.password,
              full_name: hotelUserForm.full_name.trim(),
              mobile_no: hotelUserForm.mobile_no.trim(),
            }
          : null,
      };

      if (!payload.hotel_name || !payload.city_id) {
        throw new Error('Hotel name and city are required.');
      }

      const created = await requestJson('/admin/hotels', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const createdHotel = created?.hotel;
      if (!createdHotel?.id) throw new Error('Hotel creation failed.');

      setHotelForm((prev) => ({ ...prev, hotel_name: '' }));
      setHotelUserForm(defaultUserForm);
      setActionSuccess(`Hotel onboarded: ${createdHotel.hotel_name}`);

      await Promise.all([loadHotelProfiles(), loadUsage()]);
      onHotelCreated({
        hotelId: createdHotel.id,
        hotelName: createdHotel.hotel_name,
        message: `${createdHotel.hotel_name} created successfully.`,
      });
    } catch (error) {
      setActionError(error.message || 'Unable to onboard hotel.');
    }
  }

  function selectProfile(profile) {
    setProfileForm({
      id: profile.id,
      hotel_name: profile.hotel_name || '',
      state_id: profile.state_id || '',
      city_id: profile.city_id || '',
      room_count: Number(profile.room_count || 40),
      base_price_min: Number(profile.base_price_min || 2500),
      base_price_max: Number(profile.base_price_max || 15000),
      alert_sensitivity: profile.alert_sensitivity || 'balanced',
      subscription_status: profile.subscription_status || 'active',
    });

    setProfileUser({
      full_name: profile.user_full_name || '',
      email: profile.user_email || '',
      mobile_no: profile.user_mobile_no || '',
      password: '',
    });
  }

  async function handleApplyProfileFilters(event) {
    event.preventDefault();
    setActionError('');
    setActionSuccess('');
    setProfilePage(1);
    await loadHotelProfiles(profileFilters);
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    setActionError('');
    setActionSuccess('');

    if (!profileForm.id) {
      setActionError('Select a hotel profile first.');
      return;
    }

    try {
      const updated = await requestJson(`/admin/hotels/${profileForm.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          hotel_name: profileForm.hotel_name.trim(),
          city_id: profileForm.city_id,
          room_count: Number(profileForm.room_count),
          base_price_min: Number(profileForm.base_price_min),
          base_price_max: Number(profileForm.base_price_max),
          alert_sensitivity: profileForm.alert_sensitivity,
          subscription_status: profileForm.subscription_status,
        }),
      });

      setActionSuccess(`Hotel profile updated: ${updated.hotel_name}`);
      await Promise.all([loadHotelProfiles(), loadUsage()]);
      onHotelCreated({
        hotelId: updated.id,
        hotelName: updated.hotel_name,
        message: `${updated.hotel_name} profile updated.`,
      });
    } catch (error) {
      setActionError(error.message || 'Unable to update hotel profile.');
    }
  }

  async function handleUserSave() {
    setActionError('');
    setActionSuccess('');

    if (!profileForm.id || !profileUser.email.trim()) {
      setActionError('Select hotel and provide user email.');
      return;
    }

    try {
      await requestJson(`/admin/hotels/${profileForm.id}/user`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          email: profileUser.email.trim().toLowerCase(),
          full_name: profileUser.full_name.trim(),
          mobile_no: profileUser.mobile_no.trim(),
          password: profileUser.password,
        }),
      });

      setProfileUser((prev) => ({ ...prev, password: '' }));
      setActionSuccess('Hotel user profile updated.');
      await loadHotelProfiles();
    } catch (error) {
      setActionError(error.message || 'Unable to update hotel user profile.');
    }
  }

  async function handleDeleteHotel() {
    setActionError('');
    setActionSuccess('');

    if (!profileForm.id) {
      setActionError('Select hotel profile to delete.');
      return;
    }

    const profile = hotelProfiles.find((row) => row.id === profileForm.id);
    const ok = window.confirm(`Delete hotel '${profile?.hotel_name || profileForm.id}'?`);
    if (!ok) return;

    try {
      const deleted = await requestJson(`/admin/hotels/${profileForm.id}`, token, {
        method: 'DELETE',
      });
      setActionSuccess(`Hotel deleted: ${deleted.hotel_name}`);
      setProfileForm(defaultProfileForm);
      setProfileUser(defaultProfileUser);
      await Promise.all([loadHotelProfiles(), loadUsage()]);
    } catch (error) {
      setActionError(error.message || 'Unable to delete hotel.');
    }
  }

  async function handleResolveRequest(requestId) {
    const newPassword = resolvePasswordMap[requestId] || '';
    if (!newPassword || newPassword.length < 6) {
      setActionError('Enter new password (min 6 chars) before resolving request.');
      return;
    }

    setActionError('');
    setActionSuccess('');

    try {
      await requestJson(`/admin/password-reset-requests/${requestId}/resolve`, token, {
        method: 'POST',
        body: JSON.stringify({ new_password: newPassword }),
      });
      setResolvePasswordMap((prev) => ({ ...prev, [requestId]: '' }));
      setActionSuccess('Password reset request resolved.');
      await loadResetRequests();
    } catch (error) {
      setActionError(error.message || 'Unable to resolve request.');
    }
  }

  function toggleSection(sectionId) {
    setActiveSection((prev) => (prev === sectionId ? '' : sectionId));
  }

  function toggleHotelSelection(hotelId) {
    setSelectedHotelIds((prev) =>
      prev.includes(hotelId) ? prev.filter((id) => id !== hotelId) : [...prev, hotelId],
    );
  }

  function clearHotelSelection() {
    setSelectedHotelIds([]);
  }

  async function applySubscriptionStatus(hotelId, subscriptionStatus) {
    await requestJson(`/admin/hotels/${hotelId}/subscription`, token, {
      method: 'PATCH',
      body: JSON.stringify({ subscription_status: subscriptionStatus }),
    });
  }

  async function handleQuickSubscriptionToggle(profile) {
    try {
      await applySubscriptionStatus(
        profile.id,
        profile.subscription_status === 'active' ? 'paused' : 'active',
      );
      await loadHotelProfiles();
    } catch (error) {
      setActionError(error.message || 'Unable to change subscription status.');
    }
  }

  async function handleBulkSubscriptionApply() {
    if (!selectedHotelIds.length) {
      setActionError('Select one or more hotels for bulk action.');
      return;
    }

    setActionError('');
    setActionSuccess('');
    try {
      await Promise.all(
        selectedHotelIds.map((hotelId) => applySubscriptionStatus(hotelId, bulkStatus)),
      );
      setActionSuccess(`Bulk status update completed (${selectedHotelIds.length} hotels).`);
      clearHotelSelection();
      await loadHotelProfiles();
    } catch (error) {
      setActionError(error.message || 'Bulk status update failed.');
    }
  }

  const navItems = [
    ...(isSuperAdmin ? [{ id: 'state', label: '1. State' }] : []),
    { id: 'city', label: '2. City' },
    { id: 'hotel', label: '3. Hotel + User' },
    { id: 'profile', label: '4. Profiles' },
    { id: 'usage', label: '5. Usage' },
    { id: 'reset', label: '6. Reset Requests' },
  ];

  return (
    <section className="panel adminPanel" aria-label="Admin management panel">
      <header className="panelHeader adminPanelHeader">
        <div className="adminPanelTitleBlock">
          <span className="adminPanelEyebrow">
            {isSuperAdmin ? 'Super Admin Workspace' : 'Admin Workspace'}
          </span>
          <h2 className="adminPanelTitle">Super Admin Control Center</h2>
          <p className="metaLabel adminPanelHint">Choose a section below to manage setup and operations.</p>
        </div>
        <p className="metaLabel adminPanelMeta">Faster onboarding, profile control, and usage visibility</p>
      </header>

      <div className="adminNav" role="tablist" aria-label="Admin sections">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`adminNavItem ${activeSection === item.id ? 'active' : ''}`}
            onClick={() => toggleSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {metaError && <p className="errorText">{metaError}</p>}
      {actionError && <p className="errorText">{actionError}</p>}
      {actionSuccess && <p className="successText">{actionSuccess}</p>}

      {isSuperAdmin ? (
        <section className={`adminSection ${activeSection === 'state' ? 'open' : ''}`}>
          <button type="button" className="adminSectionToggle" onClick={() => toggleSection('state')}>
            1. Add State
          </button>
          {activeSection === 'state' && (
            <div className="adminSectionBody">
              <form className="adminForm" onSubmit={handleStateSubmit}>
                <div className="adminGrid">
                  <label>
                    State Name
                    <input value={stateForm.name} onChange={(event) => setStateForm((prev) => ({ ...prev, name: event.target.value }))} />
                  </label>
                  <label>
                    Country
                    <input value={stateForm.country} onChange={(event) => setStateForm((prev) => ({ ...prev, country: event.target.value }))} />
                  </label>
                  <label>
                    Timezone
                    <input value={stateForm.timezone} onChange={(event) => setStateForm((prev) => ({ ...prev, timezone: event.target.value }))} />
                  </label>
                </div>
                <button type="submit" disabled={metaLoading}>Save State</button>
              </form>
            </div>
          )}
        </section>
      ) : null}

      <section className={`adminSection ${activeSection === 'city' ? 'open' : ''}`}>
        <button type="button" className="adminSectionToggle" onClick={() => toggleSection('city')}>
          2. Add City
        </button>
        {activeSection === 'city' && (
          <div className="adminSectionBody">
            <form className="adminForm" onSubmit={handleCitySubmit}>
              <div className="adminGrid">
                <label>
                  State
                  <select value={cityForm.state_id} onChange={(event) => setCityForm((prev) => ({ ...prev, state_id: event.target.value }))}>
                    <option value="">Select state</option>
                    {states.map((state) => (
                      <option key={state.id} value={state.id}>{state.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  City Name
                  <input value={cityForm.name} onChange={(event) => setCityForm((prev) => ({ ...prev, name: event.target.value }))} />
                </label>
                <label>
                  Airport Code
                  <input value={cityForm.airport_code} onChange={(event) => setCityForm((prev) => ({ ...prev, airport_code: event.target.value.toUpperCase() }))} maxLength={3} />
                </label>
                <label>
                  Season Profile
                  <select value={cityForm.season_profile_id} onChange={(event) => setCityForm((prev) => ({ ...prev, season_profile_id: event.target.value }))}>
                    <option value="">Select profile</option>
                    {seasonProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Holiday Calendar
                  <select value={cityForm.holiday_calendar_id} onChange={(event) => setCityForm((prev) => ({ ...prev, holiday_calendar_id: event.target.value }))}>
                    <option value="">Default / None</option>
                    {holidayCalendars.map((calendar) => (
                      <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="submit" disabled={metaLoading}>Save City</button>
            </form>
          </div>
        )}
      </section>

      <section className={`adminSection ${activeSection === 'hotel' ? 'open' : ''}`}>
        <button type="button" className="adminSectionToggle" onClick={() => toggleSection('hotel')}>
          3. Add Hotel + Hotel User
        </button>
        {activeSection === 'hotel' && (
          <div className="adminSectionBody">
            <form className="adminForm" onSubmit={handleHotelSubmit}>
              <div className="adminGrid">
                <label>
                  State
                  <select value={hotelForm.state_id} onChange={(event) => setHotelForm((prev) => ({ ...prev, state_id: event.target.value, city_id: '' }))}>
                    <option value="">Select state</option>
                    {states.map((state) => (
                      <option key={state.id} value={state.id}>{state.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  City
                  <select value={hotelForm.city_id} onChange={(event) => setHotelForm((prev) => ({ ...prev, city_id: event.target.value }))}>
                    <option value="">Select city</option>
                    {onboardingCities.map((city) => (
                      <option key={city.id} value={city.id}>{city.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Hotel Name
                  <input value={hotelForm.hotel_name} onChange={(event) => setHotelForm((prev) => ({ ...prev, hotel_name: event.target.value }))} />
                </label>
                <label>
                  Room Count
                  <input type="number" min="1" value={hotelForm.room_count} onChange={(event) => setHotelForm((prev) => ({ ...prev, room_count: event.target.value }))} />
                </label>
                <label>
                  Base Price Min
                  <input type="number" min="1" value={hotelForm.base_price_min} onChange={(event) => setHotelForm((prev) => ({ ...prev, base_price_min: event.target.value }))} />
                </label>
                <label>
                  Base Price Max
                  <input type="number" min="1" value={hotelForm.base_price_max} onChange={(event) => setHotelForm((prev) => ({ ...prev, base_price_max: event.target.value }))} />
                </label>
                <label>
                  Alert Sensitivity
                  <select value={hotelForm.alert_sensitivity} onChange={(event) => setHotelForm((prev) => ({ ...prev, alert_sensitivity: event.target.value }))}>
                    <option value="conservative">Conservative</option>
                    <option value="balanced">Balanced</option>
                    <option value="aggressive">Aggressive</option>
                  </select>
                </label>
              </div>

              <h4 className="adminSubTitle">Hotel User Profile</h4>
              <div className="adminGrid">
                <label>
                  Full Name
                  <input value={hotelUserForm.full_name} onChange={(event) => setHotelUserForm((prev) => ({ ...prev, full_name: event.target.value }))} />
                </label>
                <label>
                  Email (Username)
                  <input type="email" value={hotelUserForm.email} onChange={(event) => setHotelUserForm((prev) => ({ ...prev, email: event.target.value }))} />
                </label>
                <label>
                  Mobile No.
                  <input value={hotelUserForm.mobile_no} onChange={(event) => setHotelUserForm((prev) => ({ ...prev, mobile_no: event.target.value }))} />
                </label>
                <label>
                  Password
                  <input type="password" value={hotelUserForm.password} onChange={(event) => setHotelUserForm((prev) => ({ ...prev, password: event.target.value }))} placeholder="Optional. Defaults to Hotel@123" />
                </label>
              </div>

              <button type="submit" disabled={metaLoading}>Create Hotel</button>
            </form>
          </div>
        )}
      </section>

      <section className={`adminSection ${activeSection === 'profile' ? 'open' : ''}`}>
        <button type="button" className="adminSectionToggle" onClick={() => toggleSection('profile')}>
          4. Hotel Profiles (Modify / Delete / Reset User)
        </button>
        {activeSection === 'profile' && (
          <div className="adminSectionBody">
            <form className="adminForm" onSubmit={handleApplyProfileFilters}>
              <div className="adminGrid">
                <label>
                  State
                  <select value={profileFilters.state_id} onChange={(event) => setProfileFilters((prev) => ({ ...prev, state_id: event.target.value, city_id: '' }))}>
                    <option value="">All states</option>
                    {states.map((state) => (
                      <option key={state.id} value={state.id}>{state.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  City
                  <select value={profileFilters.city_id} onChange={(event) => setProfileFilters((prev) => ({ ...prev, city_id: event.target.value }))}>
                    <option value="">All cities</option>
                    {filterCities.map((city) => (
                      <option key={city.id} value={city.id}>{city.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Subscription
                  <select
                    value={profileFilters.subscription_status}
                    onChange={(event) =>
                      setProfileFilters((prev) => ({ ...prev, subscription_status: event.target.value }))
                    }
                  >
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="paused">Paused</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label>
                  Search
                  <input value={profileFilters.search} onChange={(event) => setProfileFilters((prev) => ({ ...prev, search: event.target.value }))} placeholder="Hotel name" />
                </label>
              </div>
              <div className="adminActionRow">
                <button type="submit" disabled={profilesLoading}>Apply</button>
                <button type="button" className="secondaryButton" onClick={() => {
                  setProfileFilters(defaultProfileFilters);
                  setProfilePage(1);
                  loadHotelProfiles(defaultProfileFilters);
                }}>Reset</button>
                <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>
                  <option value="active">Set Active</option>
                  <option value="paused">Set Paused</option>
                  <option value="trial">Set Trial</option>
                  <option value="cancelled">Set Cancelled</option>
                </select>
                <button type="button" onClick={handleBulkSubscriptionApply}>
                  Apply To Selected
                </button>
                <button type="button" className="secondaryButton" onClick={clearHotelSelection}>
                  Clear Selection
                </button>
                <select value={profileView} onChange={(event) => setProfileView(event.target.value)}>
                  <option value="table">Table View</option>
                  <option value="cards">Card View</option>
                </select>
              </div>

              <p className="metaLabel">
                Showing {hotelProfiles.length} hotel(s) | Page {profilePage} of {profilePageCount}
              </p>

              {profileView === 'table' ? (
                <div className="tableWrap profileTableWrap">
                  <table className="gridTable adminHotelTable">
                    <thead>
                      <tr>
                        <th>Select</th>
                        <th>Hotel</th>
                        <th>State</th>
                        <th>City</th>
                        <th>User</th>
                        <th>Status</th>
                        <th>Last Calc</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedHotelProfiles.map((profile) => (
                        <tr key={profile.id} className={profileForm.id === profile.id ? 'ownHotelRow' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedHotelIds.includes(profile.id)}
                              onChange={() => toggleHotelSelection(profile.id)}
                              aria-label={`Select ${profile.hotel_name}`}
                            />
                          </td>
                          <td>{profile.hotel_name}</td>
                          <td>{profile.state_name || 'N/A'}</td>
                          <td>{profile.city || 'N/A'}</td>
                          <td>{profile.user_email || 'Not linked'}</td>
                          <td>
                            <span className={`subscriptionBadge status-${profile.subscription_status || 'active'}`}>
                              {profile.subscription_status || 'active'}
                            </span>
                          </td>
                          <td>{formatDateTime(profile.last_calculated_at)}</td>
                          <td className="tableActionCell">
                            <button type="button" className="secondaryButton" onClick={() => selectProfile(profile)}>
                              Open
                            </button>
                            <button
                              type="button"
                              className="secondaryButton"
                              onClick={() => handleQuickSubscriptionToggle(profile)}
                            >
                              {profile.subscription_status === 'active' ? 'Pause' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="profileList" role="list">
                  {pagedHotelProfiles.length ? pagedHotelProfiles.map((profile) => (
                    <article key={profile.id} className={`profileItem ${profileForm.id === profile.id ? 'active' : ''}`}>
                      <div className="profileItemTop">
                        <label className="profileCheck">
                          <input
                            type="checkbox"
                            checked={selectedHotelIds.includes(profile.id)}
                            onChange={() => toggleHotelSelection(profile.id)}
                          />
                          <span>Select</span>
                        </label>
                        <span className={`subscriptionBadge status-${profile.subscription_status || 'active'}`}>
                          {profile.subscription_status || 'active'}
                        </span>
                      </div>
                      <strong>{profile.hotel_name}</strong>
                      <span>{profile.state_name || 'N/A'} | {profile.city || 'N/A'}</span>
                      <span>User: {profile.user_email || 'Not linked'}</span>
                      <span>Last calc: {formatDateTime(profile.last_calculated_at)}</span>
                      <div className="profileItemActions">
                        <button type="button" className="secondaryButton" onClick={() => selectProfile(profile)}>
                          Open Profile
                        </button>
                        <button
                          type="button"
                          className="secondaryButton"
                          onClick={() => handleQuickSubscriptionToggle(profile)}
                        >
                          {profile.subscription_status === 'active' ? 'Pause' : 'Activate'}
                        </button>
                      </div>
                    </article>
                  )) : null}
                </div>
              )}

              {hotelProfiles.length ? (
                <div className="adminPagination">
                  <button
                    type="button"
                    className="secondaryButton"
                    disabled={profilePage <= 1}
                    onClick={() => setProfilePage((prev) => Math.max(1, prev - 1))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="secondaryButton"
                    disabled={profilePage >= profilePageCount}
                    onClick={() => setProfilePage((prev) => Math.min(profilePageCount, prev + 1))}
                  >
                    Next
                  </button>
                </div>
              ) : <p className="metaLabel">{profilesLoading ? 'Loading...' : 'No hotels found.'}</p>}
            </form>

            <form className="adminForm" onSubmit={handleProfileSave}>
              <h4 className="adminSubTitle">Selected Hotel Profile</h4>
              <div className="adminGrid">
                <label>Hotel Name<input value={profileForm.hotel_name} onChange={(event) => setProfileForm((prev) => ({ ...prev, hotel_name: event.target.value }))} /></label>
                <label>
                  State
                  <select value={profileForm.state_id} onChange={(event) => setProfileForm((prev) => ({ ...prev, state_id: event.target.value, city_id: '' }))}>
                    <option value="">Select state</option>
                    {states.map((state) => (
                      <option key={state.id} value={state.id}>{state.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  City
                  <select value={profileForm.city_id} onChange={(event) => setProfileForm((prev) => ({ ...prev, city_id: event.target.value }))}>
                    <option value="">Select city</option>
                    {profileEditableCities.map((city) => (
                      <option key={city.id} value={city.id}>{city.name}</option>
                    ))}
                  </select>
                </label>
                <label>Room Count<input type="number" min="1" value={profileForm.room_count} onChange={(event) => setProfileForm((prev) => ({ ...prev, room_count: event.target.value }))} /></label>
                <label>Base Price Min<input type="number" min="1" value={profileForm.base_price_min} onChange={(event) => setProfileForm((prev) => ({ ...prev, base_price_min: event.target.value }))} /></label>
                <label>Base Price Max<input type="number" min="1" value={profileForm.base_price_max} onChange={(event) => setProfileForm((prev) => ({ ...prev, base_price_max: event.target.value }))} /></label>
                <label>
                  Alert Sensitivity
                  <select value={profileForm.alert_sensitivity} onChange={(event) => setProfileForm((prev) => ({ ...prev, alert_sensitivity: event.target.value }))}>
                    <option value="conservative">Conservative</option>
                    <option value="balanced">Balanced</option>
                    <option value="aggressive">Aggressive</option>
                  </select>
                </label>
                <label>
                  Subscription
                  <select value={profileForm.subscription_status} onChange={(event) => setProfileForm((prev) => ({ ...prev, subscription_status: event.target.value }))}>
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="paused">Paused</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
              </div>

              <h4 className="adminSubTitle">Hotel User</h4>
              <div className="adminGrid">
                <label>Full Name<input value={profileUser.full_name} onChange={(event) => setProfileUser((prev) => ({ ...prev, full_name: event.target.value }))} /></label>
                <label>Email (Username)<input type="email" value={profileUser.email} onChange={(event) => setProfileUser((prev) => ({ ...prev, email: event.target.value }))} /></label>
                <label>Mobile No.<input value={profileUser.mobile_no} onChange={(event) => setProfileUser((prev) => ({ ...prev, mobile_no: event.target.value }))} /></label>
                <label>Reset Password<input type="password" value={profileUser.password} onChange={(event) => setProfileUser((prev) => ({ ...prev, password: event.target.value }))} placeholder="Set new password" /></label>
              </div>

              <div className="adminActionRow">
                <button type="submit" disabled={!profileForm.id}>Save Hotel</button>
                <button type="button" className="secondaryButton" disabled={!profileForm.id} onClick={handleUserSave}>Save User</button>
                <button type="button" className="secondaryButton" disabled={!profileForm.id} onClick={() => onHotelCreated({ hotelId: profileForm.id, hotelName: profileForm.hotel_name, message: 'Dashboard opened.' })}>Open Dashboard</button>
                {isSuperAdmin && <button type="button" className="dangerButton" disabled={!profileForm.id} onClick={handleDeleteHotel}>Delete Hotel</button>}
              </div>
            </form>
          </div>
        )}
      </section>

      <section className={`adminSection ${activeSection === 'usage' ? 'open' : ''}`}>
        <button type="button" className="adminSectionToggle" onClick={() => toggleSection('usage')}>
          5. Usage Analytics (By Hotel)
        </button>
        {activeSection === 'usage' && (
          <div className="adminSectionBody">
            <div className="adminForm">
              <div className="tableWrap usageTableWrap">
                <table className="gridTable">
                  <thead>
                    <tr>
                      <th>Hotel</th>
                      <th>City</th>
                      <th>Recalc 7D</th>
                      <th>Recalc 30D</th>
                      <th>Active Users 30D</th>
                      <th>Last Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageRows.map((row) => (
                      <tr key={row.hotel_id}>
                        <td>{row.hotel_name}</td>
                        <td>{row.city}</td>
                        <td>{row.recalculations_7d}</td>
                        <td>{row.recalculations_30d}</td>
                        <td>{row.active_users_30d}</td>
                        <td>{formatDateTime(row.last_activity_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {analyticsLoading ? <p className="metaLabel">Loading analytics...</p> : null}
            </div>
          </div>
        )}
      </section>

      <section className={`adminSection ${activeSection === 'reset' ? 'open' : ''}`}>
        <button type="button" className="adminSectionToggle" onClick={() => toggleSection('reset')}>
          6. Forgot Password Requests
        </button>
        {activeSection === 'reset' && (
          <div className="adminSectionBody">
            <div className="adminForm">
              <div className="tableWrap usageTableWrap">
                <table className="gridTable">
                  <thead>
                    <tr>
                      <th>Requested At</th>
                      <th>Email</th>
                      <th>Hotel</th>
                      <th>Set New Password</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resetRequests.map((request) => (
                      <tr key={request.id}>
                        <td>{formatDateTime(request.requested_at)}</td>
                        <td>{request.email}</td>
                        <td>{request.hotel_name || 'N/A'}</td>
                        <td>
                          <input
                            type="password"
                            value={resolvePasswordMap[request.id] || ''}
                            onChange={(event) => setResolvePasswordMap((prev) => ({ ...prev, [request.id]: event.target.value }))}
                            placeholder="New password"
                          />
                        </td>
                        <td>
                          <button type="button" onClick={() => handleResolveRequest(request.id)}>
                            Resolve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {requestsLoading ? <p className="metaLabel">Loading requests...</p> : null}
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
