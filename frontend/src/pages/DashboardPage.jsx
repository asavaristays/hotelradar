import { useEffect, useState } from 'react';
import AdminManagementPanel from '../components/AdminManagementPanel.jsx';
import BetaAcceptanceModal from '../components/BetaAcceptanceModal.jsx';
import Dashboard from '../components/Dashboard.jsx';
import HotelSelector from '../components/HotelSelector.jsx';
import { downloadDashboardPdf } from '../components/dashboardPdf.js';
import { parseServerError as parseHttpServerError, readResponseBody } from '../http.js';

export default function DashboardPage({ session, onLogout, onNavigate }) {
  const [selectedHotelId, setSelectedHotelId] = useState('');
  const [selectedCheckinDate, setSelectedCheckinDate] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hotelListVersion, setHotelListVersion] = useState(0);
  const [toast, setToast] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [recalcJob, setRecalcJob] = useState(null);
  const [betaModalOpen, setBetaModalOpen] = useState(false);
  const [betaAcceptLoading, setBetaAcceptLoading] = useState(false);
  const [betaAcceptError, setBetaAcceptError] = useState('');
  const [pendingHotelId, setPendingHotelId] = useState('');
  const [manualSignalForm, setManualSignalForm] = useState({
    event_name: '',
    venue: '',
    start_date: '',
    end_date: '',
    category: 'conference',
    scale: 'medium',
    confidence: 'confirmed',
    impact_score: 12,
  });
  const [manualSignals, setManualSignals] = useState([]);
  const [manualSignalsLoading, setManualSignalsLoading] = useState(false);
  const [manualSignalsSubmitting, setManualSignalsSubmitting] = useState(false);
  const [manualSignalsError, setManualSignalsError] = useState('');
  const [manualSliderOverrides, setManualSliderOverrides] = useState({
    competitorScore: 55,
    holidayScore: 60,
    eventSharePct: 60,
    weddingSharePct: 35,
    corporateSharePct: 45,
    airfareScore: 55,
    seasonScore: 55,
  });

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);

  function normalizeDateInput(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }

  function buildDashboardUrl(hotelId, checkinDate = '') {
    const params = new URLSearchParams();
    const safeDate = normalizeDateInput(checkinDate);
    if (safeDate) params.set('checkin_date', safeDate);
    const query = params.toString();
    return `/hotel/${encodeURIComponent(hotelId)}/dashboard${query ? `?${query}` : ''}`;
  }

  async function fetchCompetitiveGrid(hotelId, checkinDate = '') {
    const params = new URLSearchParams();
    const safeDate = normalizeDateInput(checkinDate);
    if (safeDate) params.set('checkin_date', safeDate);
    const response = await fetch(
      `/hotel/${encodeURIComponent(hotelId)}/competitive-grid${params.size ? `?${params.toString()}` : ''}`,
      {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
      },
    );

    if (!response.ok) {
      return [];
    }
    const body = await readResponseBody(response);
    const payload = body.json;
    return Array.isArray(payload) ? payload : [];
  }

  async function parseServerError(response, fallbackPrefix) {
    return parseHttpServerError(response, fallbackPrefix);
  }

  function markLegalAcceptanceRequired(hotelId = '') {
    setPendingHotelId(String(hotelId || selectedHotelId || dashboard?.hotelId || '').trim());
    setBetaAcceptError('');
    setBetaModalOpen(true);
    setRecalcJob((prev) => (prev ? { ...prev, status: 'blocked' } : prev));
    setError('User Error: Beta legal acceptance required before dashboard access.');
  }

  async function loadDashboard(hotelIdOverride = '', checkinDateOverride = '') {
    const overrideId = typeof hotelIdOverride === 'string' ? hotelIdOverride : '';
    const hotelId = String(overrideId || selectedHotelId || '').trim();
    const activeDate = normalizeDateInput(checkinDateOverride || selectedCheckinDate || '');
    if (!hotelId) return;

    setLoading(true);
    setError('');
    try {
      const dashboardRes = await fetch(buildDashboardUrl(hotelId, activeDate), {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      if (dashboardRes.status === 451) {
        markLegalAcceptanceRequired(hotelId);
        return;
      }
      if (!dashboardRes.ok) {
        const parsed = await parseServerError(dashboardRes, 'Unable to load dashboard');
        throw new Error(parsed.message);
      }
      const body = await readResponseBody(dashboardRes);
      const dashboardJson = body.json;
      if (!Array.isArray(dashboardJson?.competitiveGrid) || dashboardJson.competitiveGrid.length <= 1) {
        const fallbackGrid = await fetchCompetitiveGrid(hotelId, activeDate);
        if (fallbackGrid.length) {
          dashboardJson.competitiveGrid = fallbackGrid;
        }
      }
      setDashboard(dashboardJson);
      const responseDate = normalizeDateInput(dashboardJson?.marketContext?.checkinDate || '');
      setSelectedCheckinDate(activeDate || responseDate);
      if (hotelId !== selectedHotelId) {
        setSelectedHotelId(hotelId);
      }
    } catch (err) {
      setDashboard(null);
      setError(err.message || 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }

  async function waitForRecalculationCompletion(hotelId, jobId, checkinDate = '') {
    for (let i = 0; i < 90; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const statusRes = await fetch(
        `/hotel/${encodeURIComponent(hotelId)}/recalculate-jobs/${encodeURIComponent(jobId)}`,
        {
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        },
      );

      if (statusRes.status === 451) {
        markLegalAcceptanceRequired(hotelId);
        throw new Error('User Error: Beta legal acceptance required before dashboard access.');
      }
      if (!statusRes.ok) {
        const parsed = await parseServerError(statusRes, 'Unable to fetch recalculation status');
        throw new Error(parsed.message);
      }

      const body = await readResponseBody(statusRes);
      const statusPayload = body.json;
      setRecalcJob(statusPayload);

      if (statusPayload.status === 'completed') {
        await loadDashboard(hotelId, checkinDate);
        return;
      }

      if (statusPayload.status === 'failed') {
        throw new Error(statusPayload.errorMessage || 'Recalculation failed.');
      }
    }

    throw new Error('Recalculation is taking longer than expected. Please retry.');
  }

  function buildManualSignalOverridePayload() {
    const toScore = (value, fallback = 50) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return fallback;
      return Math.max(0, Math.min(100, Math.round(numeric)));
    };
    const toShare = (pct) => {
      const numeric = Number(pct);
      if (!Number.isFinite(numeric)) return 0;
      return Math.max(0, Math.min(100, numeric)) / 100;
    };
    return {
      competitor: { score: toScore(manualSliderOverrides.competitorScore, 55) },
      holiday: {
        score: toScore(manualSliderOverrides.holidayScore, 60),
        eventShare: toShare(manualSliderOverrides.eventSharePct),
        weddingShare: toShare(manualSliderOverrides.weddingSharePct),
        corporateShare: toShare(manualSliderOverrides.corporateSharePct),
      },
      airfare: { score: toScore(manualSliderOverrides.airfareScore, 55) },
      season: { score: toScore(manualSliderOverrides.seasonScore, 55) },
    };
  }

  async function handleRecalculate(hotelIdOverride = '', options = {}) {
    const hotelId = String(hotelIdOverride || selectedHotelId || dashboard?.hotelId || '').trim();
    const activeDate = normalizeDateInput(selectedCheckinDate || dashboard?.marketContext?.checkinDate || '');
    const manualOverrides = options?.manualSignalOverrides || null;
    if (!hotelId) return;

    setError('');
    setRecalcJob({ status: 'queued', hotelId, attempts: 0, maxAttempts: 3 });

    try {
      const response = await fetch(`/hotel/${encodeURIComponent(hotelId)}/recalculate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          triggered_by: 'manual',
          source: 'dashboard-ui',
          ...(activeDate ? { checkin_date: activeDate } : {}),
          ...(manualOverrides ? { manual_signal_overrides: manualOverrides } : {}),
        }),
      });

      if (response.status === 451) {
        markLegalAcceptanceRequired(hotelId);
        throw new Error('User Error: Beta legal acceptance required before dashboard access.');
      }
      if (response.status === 202) {
        const body = await readResponseBody(response);
        const payload = body.json;
        setRecalcJob({
          id: payload.jobId,
          status: payload.status || 'queued',
          hotelId,
          attempts: 0,
          maxAttempts: 3,
        });
        await waitForRecalculationCompletion(hotelId, payload.jobId, activeDate);
        setRecalcJob((prev) => ({
          ...(prev || {}),
          status: 'completed',
        }));
        return;
      }

      if (!response.ok) {
        const parsed = await parseServerError(response, 'Unable to trigger recalculation');
        throw new Error(parsed.message);
      }

      // Backward-compatible sync fallback.
      const body = await readResponseBody(response);
      const dashboardJson = body.json;
      setDashboard(dashboardJson);
      const responseDate = normalizeDateInput(dashboardJson?.marketContext?.checkinDate || '');
      setSelectedCheckinDate(activeDate || responseDate);
      setRecalcJob({ status: 'completed', hotelId });
    } catch (err) {
      setRecalcJob((prev) => ({
        ...(prev || {}),
        status: 'failed',
      }));
      setError(err.message || 'Unable to trigger recalculation.');
    }
  }

  useEffect(() => {
    const role = session?.user?.role;
    const assignedHotels = Array.isArray(session?.user?.hotels) ? session.user.hotels : [];
    if (role !== 'hotel_user') return;
    if (assignedHotels.length !== 1) return;
    if (selectedHotelId || loading || dashboard) return;
    loadDashboard(assignedHotels[0]);
  }, [session, selectedHotelId, loading, dashboard]);

  function handleHotelCreated(payload) {
    const hotelId = payload?.hotelId || '';
    const hotelName = payload?.hotelName || 'New hotel';
    const message = payload?.message || `${hotelName} added successfully.`;

    setHotelListVersion((prev) => prev + 1);
    if (!hotelId) {
      return;
    }
    setToast({
      type: 'success',
      message,
      hotelId,
    });
  }

  function handleOpenCreatedHotel(hotelId) {
    if (!hotelId) return;
    loadDashboard(hotelId);
    const panel = document.getElementById('hotel-dashboard-panel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setToast(null);
  }

  async function handleDownloadPdf() {
    if (dashboard?.productLock?.enabled) {
      setError('PDF export is locked until signal quality is actionable for this market.');
      return;
    }
    try {
      setExportingPdf(true);
      const selectedName =
        dashboard?.competitiveGrid?.[0]?.name ||
        dashboard?.hotelId ||
        'Hotel';
      await downloadDashboardPdf(dashboard, selectedName);
    } catch (err) {
      setError(err.message || 'Unable to export PDF.');
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleAcceptBeta() {
    setBetaAcceptError('');
    setBetaAcceptLoading(true);
    try {
      const response = await fetch('/api/legal/accept-beta', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const parsed = await parseServerError(response, 'Unable to record beta acceptance');
        throw new Error(parsed.message);
      }

      setBetaModalOpen(false);
      setError('');

      const hotelId = String(pendingHotelId || selectedHotelId || dashboard?.hotelId || '').trim();
      if (hotelId) {
        await loadDashboard(hotelId, selectedCheckinDate);
      }
    } catch (err) {
      setBetaAcceptError(err.message || 'Unable to record beta acceptance.');
    } finally {
      setBetaAcceptLoading(false);
    }
  }

  async function loadManualSignals(city) {
    const safeCity = String(city || '').trim();
    if (!safeCity) {
      setManualSignals([]);
      return;
    }
    setManualSignalsLoading(true);
    setManualSignalsError('');
    try {
      const params = new URLSearchParams({ city: safeCity, horizon_days: '45' });
      const response = await fetch(`/admin/manual-signals/events?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      if (!response.ok) {
        const parsed = await parseServerError(response, 'Unable to load manual signals');
        throw new Error(parsed.message);
      }
      const body = await readResponseBody(response);
      setManualSignals(Array.isArray(body.json?.rows) ? body.json.rows : []);
    } catch (err) {
      setManualSignalsError(err.message || 'Unable to load manual signals.');
      setManualSignals([]);
    } finally {
      setManualSignalsLoading(false);
    }
  }

  async function handleManualSignalSubmit(event) {
    event.preventDefault();
    const activeHotelId = String(selectedHotelId || dashboard?.hotelId || '').trim();
    const activeCity = String(dashboard?.city || '').trim();
    if (!activeHotelId || !activeCity) {
      setManualSignalsError('Select a hotel dashboard before adding manual signals.');
      return;
    }

    const payload = {
      city: activeCity,
      event_name: String(manualSignalForm.event_name || '').trim(),
      venue: String(manualSignalForm.venue || '').trim(),
      start_date: normalizeDateInput(manualSignalForm.start_date || selectedCheckinDate),
      end_date: normalizeDateInput(manualSignalForm.end_date || manualSignalForm.start_date || selectedCheckinDate),
      category: String(manualSignalForm.category || 'conference').trim(),
      scale: String(manualSignalForm.scale || 'medium').trim(),
      confidence: String(manualSignalForm.confidence || 'confirmed').trim(),
      impact_score: Number(manualSignalForm.impact_score || 12),
      source: 'manual-ui',
    };

    if (!payload.event_name || !payload.start_date) {
      setManualSignalsError('Event name and start date are required.');
      return;
    }

    setManualSignalsSubmitting(true);
    setManualSignalsError('');
    try {
      const response = await fetch('/admin/manual-signals/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const parsed = await parseServerError(response, 'Unable to save manual signal');
        throw new Error(parsed.message);
      }

      setManualSignalForm((prev) => ({
        ...prev,
        event_name: '',
        venue: '',
        start_date: payload.start_date,
        end_date: payload.end_date,
      }));
      await loadManualSignals(activeCity);
      await handleRecalculate(activeHotelId, {
        manualSignalOverrides: buildManualSignalOverridePayload(),
      });
      setToast({
        type: 'success',
        message: `Manual signal added for ${activeCity}: ${payload.event_name}`,
        hotelId: activeHotelId,
      });
    } catch (err) {
      setManualSignalsError(err.message || 'Unable to save manual signal.');
    } finally {
      setManualSignalsSubmitting(false);
    }
  }

  async function handleApplyDateFilter() {
    const activeHotelId = String(selectedHotelId || dashboard?.hotelId || '').trim();
    if (!activeHotelId) return;
    await loadDashboard(activeHotelId, selectedCheckinDate);
  }

  async function handleApplyManualSliders() {
    const activeHotelId = String(selectedHotelId || dashboard?.hotelId || '').trim();
    if (!activeHotelId) {
      setManualSignalsError('Select a hotel dashboard before applying manual sliders.');
      return;
    }
    setManualSignalsError('');
    await handleRecalculate(activeHotelId, {
      manualSignalOverrides: buildManualSignalOverridePayload(),
    });
  }

  const adminRole = session?.user?.role || '';
  const showAdminPanel = adminRole === 'super_admin' || adminRole === 'admin';
  const scopedCity = String(dashboard?.city || '').trim();
  const scopedCityKey = scopedCity.toLowerCase();
  const isFocusPilotCity = scopedCityKey === 'goa' || scopedCityKey === 'mumbai';
  const canManageManualSignals = showAdminPanel && isFocusPilotCity;
  const canUseManualSliders = Boolean(dashboard);
  const scopeLabel =
    adminRole === 'super_admin'
      ? 'Scope: All hotels'
      : adminRole === 'admin'
        ? 'Scope: Managed hotels'
        : `Scope: ${Array.isArray(session?.user?.hotels) ? session.user.hotels.length : 0} assigned hotel(s)`;

  const workspaceLabel =
    adminRole === 'super_admin'
      ? 'Super Admin Workspace'
      : adminRole === 'admin'
        ? 'Admin Workspace'
        : 'Hotel Workspace';
  const recalcStatus = recalcJob?.status || '';
  const recalcInProgress = recalcStatus === 'queued' || recalcStatus === 'processing';
  const productLockEnabled = Boolean(dashboard?.productLock?.enabled);

  useEffect(() => {
    if (!canManageManualSignals) {
      setManualSignals([]);
      return;
    }
    loadManualSignals(scopedCity);
    const fallbackDate = normalizeDateInput(dashboard?.marketContext?.checkinDate || '');
    setManualSignalForm((prev) => ({
      ...prev,
      start_date: prev.start_date || selectedCheckinDate || fallbackDate,
      end_date: prev.end_date || selectedCheckinDate || fallbackDate,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageManualSignals, scopedCity, dashboard?.hotelId]);

  return (
    <main className="premiumShell">
      <aside className="premiumSidebar" aria-label="Primary navigation">
        <div className="premiumBrand">
          <h1>HotelRADAR</h1>
          <p>Revenue Intelligence Cockpit</p>
        </div>
        <nav className="premiumNav">
          <button type="button" className="premiumNavItem active">Overview</button>
          <button type="button" className="premiumNavItem">Demand</button>
          <button type="button" className="premiumNavItem">Pricing</button>
          <button type="button" className="premiumNavItem">Signals</button>
          <button type="button" className="premiumNavItem">Alerts</button>
          <button type="button" className="premiumNavItem">Reports</button>
        </nav>
        <footer className="premiumSidebarFooter">
          <p className="metaLabel">© 2026 HotelRADAR</p>
          <div className="sidebarLegalLinks">
            <button type="button" className="linkButton" onClick={() => onNavigate('/legal/privacy')}>
              Privacy
            </button>
            <span>|</span>
            <button type="button" className="linkButton" onClick={() => onNavigate('/legal/terms')}>
              Terms
            </button>
            <span>|</span>
            <button type="button" className="linkButton" onClick={() => onNavigate('/legal/disclaimer')}>
              Disclaimer
            </button>
          </div>
          <p className="metaLabel sidebarSupport">
            Support : support@hotelradar.in | Mobile No. +91-9828981000
          </p>
        </footer>
      </aside>

      <section className="premiumMain">
        <header className="premiumTopbar">
          <div className="premiumTopbarIntro">
            <span className="workspaceEyebrow">{workspaceLabel}</span>
            <h2>AI Revenue Optimizer Overview</h2>
            <p className="metaLabel headerScope">{scopeLabel}</p>
          </div>

          <HotelSelector
            token={session.token}
            selectedHotelId={selectedHotelId}
            onSelect={setSelectedHotelId}
            onLoadDashboard={loadDashboard}
            loading={loading}
            reloadKey={hotelListVersion}
            className="topbarSelector"
          />

          <div className="premiumTopbarActions">
            <p className="metaLabel headerUser">
              {(session.user.full_name || session.user.email)}
            </p>
            <div className="topbarDateSearch">
              <label htmlFor="dashboard-checkin-date" className="metaLabel">Stay Date</label>
              <input
                id="dashboard-checkin-date"
                type="date"
                value={selectedCheckinDate}
                onChange={(event) => setSelectedCheckinDate(normalizeDateInput(event.target.value))}
              />
              <button
                type="button"
                className="secondaryButton"
                onClick={handleApplyDateFilter}
                disabled={loading || (!selectedHotelId && !dashboard?.hotelId)}
              >
                Apply Date
              </button>
            </div>
            <button
              type="button"
              className="secondaryButton"
              onClick={() => handleRecalculate()}
              disabled={recalcInProgress || loading || (!selectedHotelId && !dashboard?.hotelId)}
            >
              {recalcInProgress ? 'Recalculating...' : 'Recalculate'}
            </button>
            <button
              type="button"
              className="secondaryButton"
              onClick={handleDownloadPdf}
              disabled={!dashboard || exportingPdf || productLockEnabled}
            >
              {productLockEnabled ? 'Export Locked' : exportingPdf ? 'Preparing PDF...' : 'Download PDF'}
            </button>
            <button type="button" className="secondaryButton" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>

        <div className="premiumContent">
          {!!recalcStatus && (
            <section className="panel" aria-label="Recalculation status">
              <p className="metaLabel">
                Recalculation status: <strong>{String(recalcStatus).toUpperCase()}</strong>
                {Number.isFinite(Number(recalcJob?.attempts))
                  ? ` (attempt ${Number(recalcJob.attempts || 0)} of ${Number(recalcJob.maxAttempts || 0)})`
                  : ''}
              </p>
            </section>
          )}

          {showAdminPanel && (
            <section className="row rowWide adminPanelRow">
              <AdminManagementPanel
                role={adminRole}
                token={session.token}
                onHotelCreated={handleHotelCreated}
              />
            </section>
          )}

          {toast && (
            <section className={`panel toastPanel toast-${toast.type}`} role="status" aria-live="polite">
              <p className="toastText">{toast.message}</p>
              <div className="toastActions">
                {toast.hotelId && (
                  <button type="button" onClick={() => handleOpenCreatedHotel(toast.hotelId)}>
                    Open Dashboard
                  </button>
                )}
                <button type="button" className="secondaryButton" onClick={() => setToast(null)}>
                  Dismiss
                </button>
              </div>
            </section>
          )}

          {(canManageManualSignals || canUseManualSliders) && (
            <section className="panel manualSignalPanel" aria-label="Manual signal controls">
              <header className="panelHeader">
                <h3>Manual Signal Controls ({scopedCity || 'Selected Hotel'})</h3>
                <p className="metaLabel">
                  {canManageManualSignals
                    ? 'Add wedding/corporate/event signals manually for pilot runs, then auto-recalculate this hotel.'
                    : 'Use sliders for what-if sensing on selected stay date.'}
                </p>
              </header>
              <div className="topbarDateSearch manualDateSearch">
                <label htmlFor="manual-panel-checkin-date" className="metaLabel">Stay Date</label>
                <input
                  id="manual-panel-checkin-date"
                  type="date"
                  value={selectedCheckinDate}
                  onChange={(event) => setSelectedCheckinDate(normalizeDateInput(event.target.value))}
                />
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={handleApplyDateFilter}
                  disabled={loading || (!selectedHotelId && !dashboard?.hotelId)}
                >
                  Apply Date
                </button>
              </div>
              {canManageManualSignals && (
                <form className="adminForm" onSubmit={handleManualSignalSubmit}>
                  <div className="adminGrid">
                    <label>
                      Event Name
                      <input
                        value={manualSignalForm.event_name}
                        onChange={(event) => setManualSignalForm((prev) => ({ ...prev, event_name: event.target.value }))}
                        placeholder="e.g. Goa Wedding Expo"
                      />
                    </label>
                    <label>
                      Venue
                      <input
                        value={manualSignalForm.venue}
                        onChange={(event) => setManualSignalForm((prev) => ({ ...prev, venue: event.target.value }))}
                        placeholder="Optional"
                      />
                    </label>
                    <label>
                      Start Date
                      <input
                        type="date"
                        value={manualSignalForm.start_date}
                        onChange={(event) => setManualSignalForm((prev) => ({ ...prev, start_date: normalizeDateInput(event.target.value) }))}
                      />
                    </label>
                    <label>
                      End Date
                      <input
                        type="date"
                        value={manualSignalForm.end_date}
                        onChange={(event) => setManualSignalForm((prev) => ({ ...prev, end_date: normalizeDateInput(event.target.value) }))}
                      />
                    </label>
                    <label>
                      Category
                      <select
                        value={manualSignalForm.category}
                        onChange={(event) => setManualSignalForm((prev) => ({ ...prev, category: event.target.value }))}
                      >
                        <option value="wedding_season">Wedding</option>
                        <option value="conference">Conference</option>
                        <option value="exhibition">Exhibition</option>
                        <option value="sports">Sports</option>
                        <option value="festival">Festival</option>
                        <option value="general">General</option>
                      </select>
                    </label>
                    <label>
                      Scale
                      <select
                        value={manualSignalForm.scale}
                        onChange={(event) => setManualSignalForm((prev) => ({ ...prev, scale: event.target.value }))}
                      >
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                        <option value="mega">Mega</option>
                      </select>
                    </label>
                    <label>
                      Confidence
                      <select
                        value={manualSignalForm.confidence}
                        onChange={(event) => setManualSignalForm((prev) => ({ ...prev, confidence: event.target.value }))}
                      >
                        <option value="tentative">Tentative</option>
                        <option value="confirmed">Confirmed</option>
                      </select>
                    </label>
                    <label>
                      Impact Score
                      <input
                        type="number"
                        min="0"
                        max="40"
                        value={manualSignalForm.impact_score}
                        onChange={(event) => setManualSignalForm((prev) => ({ ...prev, impact_score: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="manualSignalActions">
                    <button type="submit" disabled={manualSignalsSubmitting || loading}>
                      {manualSignalsSubmitting ? 'Saving...' : 'Add Signal + Recalculate'}
                    </button>
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => loadManualSignals(scopedCity)}
                      disabled={manualSignalsLoading}
                    >
                      {manualSignalsLoading ? 'Refreshing...' : 'Refresh Signals'}
                    </button>
                  </div>
                </form>
              )}
              <div className="manualSliderPanel">
                <h4>Manual Signal Sliders</h4>
                <p className="metaLabel">Use for pilot what-if control on selected stay date.</p>
                <div className="manualSliderGrid">
                  <label>
                    Competitor Score ({Number(manualSliderOverrides.competitorScore || 0)})
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={manualSliderOverrides.competitorScore}
                      onChange={(event) =>
                        setManualSliderOverrides((prev) => ({ ...prev, competitorScore: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Holiday Score ({Number(manualSliderOverrides.holidayScore || 0)})
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={manualSliderOverrides.holidayScore}
                      onChange={(event) =>
                        setManualSliderOverrides((prev) => ({ ...prev, holidayScore: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Event Share % ({Number(manualSliderOverrides.eventSharePct || 0)}%)
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={manualSliderOverrides.eventSharePct}
                      onChange={(event) =>
                        setManualSliderOverrides((prev) => ({ ...prev, eventSharePct: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Wedding Share % ({Number(manualSliderOverrides.weddingSharePct || 0)}%)
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={manualSliderOverrides.weddingSharePct}
                      onChange={(event) =>
                        setManualSliderOverrides((prev) => ({ ...prev, weddingSharePct: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Corporate Share % ({Number(manualSliderOverrides.corporateSharePct || 0)}%)
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={manualSliderOverrides.corporateSharePct}
                      onChange={(event) =>
                        setManualSliderOverrides((prev) => ({ ...prev, corporateSharePct: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Airfare Score ({Number(manualSliderOverrides.airfareScore || 0)})
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={manualSliderOverrides.airfareScore}
                      onChange={(event) =>
                        setManualSliderOverrides((prev) => ({ ...prev, airfareScore: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Season Score ({Number(manualSliderOverrides.seasonScore || 0)})
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={manualSliderOverrides.seasonScore}
                      onChange={(event) =>
                        setManualSliderOverrides((prev) => ({ ...prev, seasonScore: Number(event.target.value) }))
                      }
                    />
                  </label>
                </div>
                <div className="manualSignalActions">
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={handleApplyManualSliders}
                    disabled={loading || recalcInProgress}
                  >
                    Apply Sliders + Recalculate
                  </button>
                </div>
              </div>
              {manualSignalsError ? <p className="errorText">{manualSignalsError}</p> : null}
              {canManageManualSignals && !!manualSignals.length && (
                <div className="tableWrap manualSignalsTableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Scale</th>
                        <th>Impact</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualSignals.slice(0, 8).map((row) => (
                        <tr key={`${row.id || row.event_name}-${row.start_date}`}>
                          <td>{row.event_name || 'N/A'}</td>
                          <td>{normalizeDateInput(row.start_date)}</td>
                          <td>{row.category || 'general'}</td>
                          <td>{row.scale || 'medium'}</td>
                          <td>{Number(row.impact_score || 0).toFixed(2)}</td>
                          <td>{row.source || 'manual-ui'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <Dashboard dashboard={dashboard} loading={loading} error={error} />
        </div>
      </section>
      <BetaAcceptanceModal
        open={betaModalOpen}
        loading={betaAcceptLoading}
        error={betaAcceptError}
        onAccept={handleAcceptBeta}
        onNavigate={onNavigate}
      />
    </main>
  );
}
