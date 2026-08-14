import { useEffect, useRef, useState } from 'react';
import AlertsPanel from '../components/AlertsPanel.jsx';
import BetaAcceptanceModal from '../components/BetaAcceptanceModal.jsx';
import CompressionAlert from '../components/CompressionAlert.jsx';
import CompetitorPanel from '../components/CompetitorPanel.jsx';
import Dashboard from '../components/Dashboard.jsx';
import DemandForecast from '../components/DemandForecast.jsx';
import HotelSelector from '../components/HotelSelector.jsx';
import MarketDemandCockpit from '../components/MarketDemandCockpit.jsx';
import MorningBrief from '../components/MorningBrief.jsx';
import OpportunityPanel from '../components/OpportunityPanel.jsx';
import PositionMeter from '../components/PositionMeter.jsx';
import PropertyOnboardingPanel from '../components/PropertyOnboardingPanel.jsx';
import RadarScore from '../components/RadarScore.jsx';
import RevenueAdviceCard from '../components/RevenueAdviceCard.jsx';
import SignalInputPanel from '../components/SignalInputPanel.jsx';
import SystemUpdatesPanel from '../components/SystemUpdatesPanel.jsx';
import { getSystemStatus } from '../services/intelligenceApi.js';
import { parseServerError as parseHttpServerError, readResponseBody } from '../http.js';

const ADMIN_INSIGHT_OPTIONS = [
  { value: 'market-demand', label: 'Market Demand Cockpit' },
  { value: 'radar-score', label: 'RADAR Score' },
  { value: 'morning-brief', label: 'WhatsApp Morning Brief' },
  { value: 'demand-forecast', label: 'Demand Forecast' },
  { value: 'compression-alert', label: 'Market Compression Alert' },
  { value: 'revenue-advice', label: 'AI Revenue Advice' },
  { value: 'market-position', label: 'Market Position Meter' },
  { value: 'intelligence-alerts', label: 'Intelligence Alerts' },
  { value: 'competitors', label: 'Competitor Intelligence' },
];
const HOTELRADAR_FOCUS_KEY = 'hotelradar_focus_insight';
const DASHBOARD_WORKSPACE_KEY = 'dashboard_workspace_target';
const DEFAULT_PROPERTY_ID = '10101010-1010-4010-8010-101010101010';

function currentIndiaStayDate() {
  return indiaDateOffset(0);
}

function indiaDateOffset(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(offsetDays || 0));
  return date.toISOString().slice(0, 10);
}

function defaultPilotStayDate() {
  return indiaDateOffset(1);
}

const WORKSPACE_SECTIONS = [
  { value: 'hotelradar', label: 'Revenue Intelligence', icon: 'chart' },
  { value: 'opportunity', label: 'Opportunity', icon: 'opportunity' },
  { value: 'signal-input', label: 'Signal Input', icon: 'signal', adminOnly: true },
  { value: 'admin-control', label: 'Add Property', icon: 'property', adminOnly: true },
  { value: 'system-updates', label: 'System Health', icon: 'health', adminOnly: true },
];

const NAV_ICON_PATHS = {
  chart: 'M4 19h16M7 16V9m5 7V5m5 11v-6',
  opportunity: 'M12 3v4m0 10v4M5 12H3m18 0h-2M6.3 6.3l2.8 2.8m5.8 5.8 2.8 2.8m0-11.4-2.8 2.8m-5.8 5.8-2.8 2.8',
  signal: 'M4 18h4l3-12 4 12 2-7h3M4 6h3m10 0h3',
  property: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6',
  health: 'M4 13h4l2-6 4 12 2-6h4',
  logout: 'M10 17l5-5-5-5M15 12H3m9 7h6a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-6',
};

function NavIcon({ type }) {
  return (
    <span className="premiumNavIcon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d={NAV_ICON_PATHS[type] || NAV_ICON_PATHS.chart} />
      </svg>
    </span>
  );
}

export default function DashboardPage({ session, onLogout, onNavigate }) {
  const defaultPropertyLoadStarted = useRef(false);
  const [selectedHotelId, setSelectedHotelId] = useState('');
  const [selectedCheckinDate, setSelectedCheckinDate] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hotelListVersion, setHotelListVersion] = useState(0);
  const [toast, setToast] = useState(null);
  const [recalcJob, setRecalcJob] = useState(null);
  const [betaModalOpen, setBetaModalOpen] = useState(false);
  const [betaAcceptLoading, setBetaAcceptLoading] = useState(false);
  const [betaAcceptError, setBetaAcceptError] = useState('');
  const [pendingHotelId, setPendingHotelId] = useState('');
  const [selectedInsight, setSelectedInsight] = useState(ADMIN_INSIGHT_OPTIONS[0].value);
  const [showFocusedInsight, setShowFocusedInsight] = useState(false);
  const [activeWorkspaceSection, setActiveWorkspaceSection] = useState('hotelradar');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarPinnedOpen, setSidebarPinnedOpen] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 1024;
  });
  const [systemStatus, setSystemStatus] = useState(null);
  const [systemStatusLoading, setSystemStatusLoading] = useState(false);
  const [systemStatusError, setSystemStatusError] = useState('');

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const nextWorkspace = localStorage.getItem(DASHBOARD_WORKSPACE_KEY);
      const nextFocus = localStorage.getItem(HOTELRADAR_FOCUS_KEY);
      if (nextWorkspace === 'admin-control' || nextWorkspace === 'system-updates' || nextWorkspace === 'hotelradar' || nextWorkspace === 'opportunity' || nextWorkspace === 'signal-input') {
        setActiveWorkspaceSection(nextWorkspace);
      }
      if (nextFocus) {
        const isSupportedInsight = ADMIN_INSIGHT_OPTIONS.some((option) => option.value === nextFocus);
        if (isSupportedInsight) {
          setActiveWorkspaceSection('hotelradar');
          setSelectedInsight(nextFocus);
          setShowFocusedInsight(true);
        }
      }
      localStorage.removeItem(DASHBOARD_WORKSPACE_KEY);
      localStorage.removeItem(HOTELRADAR_FOCUS_KEY);
    } catch {
      // ignore storage failures and keep the default workspace state
    }
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeWorkspaceSection]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    function syncViewport() {
      setIsCompactViewport(window.innerWidth <= 1024);
    }

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    const role = String(session?.user?.role || '').trim().toLowerCase();
    if (role !== 'admin' && role !== 'super_admin') return undefined;

    let active = true;

    async function loadSystemStatus() {
      setSystemStatusLoading(true);
      setSystemStatusError('');
      try {
        const nextStatus = await getSystemStatus(session.token);
        if (!active) return;
        setSystemStatus(nextStatus);
      } catch (loadError) {
        if (!active) return;
        setSystemStatus(null);
        setSystemStatusError(loadError.message || 'Unable to load system updates.');
      } finally {
        if (active) {
          setSystemStatusLoading(false);
        }
      }
    }

    loadSystemStatus();
    return () => {
      active = false;
    };
  }, [session]);

  async function handleRefreshSystemStatus() {
    try {
      setSystemStatusLoading(true);
      setSystemStatusError('');
      const nextStatus = await getSystemStatus(session.token);
      setSystemStatus(nextStatus);
    } catch (loadError) {
      setSystemStatus(null);
      setSystemStatusError(loadError.message || 'Unable to load system updates.');
    } finally {
      setSystemStatusLoading(false);
    }
  }

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

  useEffect(() => {
    const role = String(session?.user?.role || '').trim().toLowerCase();
    if (role !== 'admin' && role !== 'super_admin') return;
    if (selectedHotelId || loading || dashboard || defaultPropertyLoadStarted.current) return;

    defaultPropertyLoadStarted.current = true;
    const stayDate = defaultPilotStayDate();
    setSelectedHotelId(DEFAULT_PROPERTY_ID);
    setSelectedCheckinDate(stayDate);
    loadDashboard(DEFAULT_PROPERTY_ID, stayDate);
  }, [session, selectedHotelId, loading, dashboard]);

  useEffect(() => {
    if (!selectedHotelId || !selectedCheckinDate || !dashboard) return undefined;
    const timer = window.setInterval(() => {
      loadDashboard(selectedHotelId, selectedCheckinDate);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [selectedHotelId, selectedCheckinDate, Boolean(dashboard)]);

  function handleHotelCreated(payload) {
    const hotelId = payload?.hotelId || '';
    const hotelName = payload?.hotelName || 'New hotel';
    const message = payload?.message || `${hotelName} added successfully.`;

    setHotelListVersion((prev) => prev + 1);
    if (!hotelId) {
      return;
    }
    const stayDate = defaultPilotStayDate();
    setActiveWorkspaceSection('hotelradar');
    setSelectedHotelId(hotelId);
    setSelectedCheckinDate(stayDate);
    loadDashboard(hotelId, stayDate);
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

  async function handleSignalSaved(checkinDate = '') {
    const hotelId = String(selectedHotelId || dashboard?.hotelId || '').trim();
    if (!hotelId) return;
    const activeDate = normalizeDateInput(checkinDate || selectedCheckinDate || dashboard?.marketContext?.checkinDate || '');
    setSelectedCheckinDate(activeDate);
    await loadDashboard(hotelId, activeDate);
    await handleRefreshSystemStatus();
    setToast({
      type: 'success',
      message: 'Market signal saved and Revenue Intelligence refreshed.',
      hotelId,
    });
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

  async function handleApplyDateFilter() {
    const activeHotelId = String(selectedHotelId || dashboard?.hotelId || '').trim();
    if (!activeHotelId) return;
    await loadDashboard(activeHotelId, selectedCheckinDate);
  }

  const adminRole = session?.user?.role || '';
  const showAdminPanel = adminRole === 'super_admin' || adminRole === 'admin';
  const scopeLabel =
    adminRole === 'super_admin'
      ? 'Revenue Intelligence pilot · The Ten Resort'
      : adminRole === 'admin'
        ? 'Revenue Intelligence · managed hotels'
        : `Revenue Intelligence · ${Array.isArray(session?.user?.hotels) ? session.user.hotels.length : 0} assigned hotel(s)`;

  const workspaceLabel =
    adminRole === 'super_admin'
      ? 'Revenue Intelligence Desk'
      : adminRole === 'admin'
        ? 'Revenue Intelligence Desk'
        : 'Revenue Intelligence Desk';
  const recalcStatus = recalcJob?.status || '';
  const recalcInProgress = recalcStatus === 'queued' || recalcStatus === 'processing';
  const intelligenceHotelId = String(selectedHotelId || dashboard?.hotelId || '').trim();
  const visibleWorkspaceSections = WORKSPACE_SECTIONS.filter((item) => !item.adminOnly || showAdminPanel);
  function renderSidebarFooter(className = '') {
    return (
      <footer className={className}>
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
    );
  }

  function renderSelectedAdminInsight() {
    switch (selectedInsight) {
      case 'market-demand':
        return <MarketDemandCockpit token={session.token} compact selectedDate={selectedCheckinDate} />;
      case 'radar-score':
        return null;
      case 'morning-brief':
        return <MorningBrief token={session.token} hotelId={intelligenceHotelId} />;
      case 'demand-forecast':
        return <DemandForecast token={session.token} hotelId={intelligenceHotelId} />;
      case 'compression-alert':
        return <CompressionAlert token={session.token} hotelId={intelligenceHotelId} />;
      case 'revenue-advice':
        return <RevenueAdviceCard token={session.token} hotelId={intelligenceHotelId} />;
      case 'market-position':
        return <PositionMeter token={session.token} hotelId={intelligenceHotelId} />;
      case 'intelligence-alerts':
        return <AlertsPanel mode="intelligence" token={session.token} hotelId={intelligenceHotelId} />;
      case 'competitors':
        return <CompetitorPanel token={session.token} hotelId={intelligenceHotelId} />;
      default:
        return <RadarScore token={session.token} hotelId={intelligenceHotelId} />;
    }
  }

  function renderWorkspaceSection() {
    switch (activeWorkspaceSection) {
      case 'admin-control':
        return showAdminPanel ? (
          <PropertyOnboardingPanel
            token={session.token}
            onPropertyReady={handleHotelCreated}
          />
        ) : null;
      case 'system-updates':
        return showAdminPanel ? (
          <SystemUpdatesPanel
            status={systemStatus}
            dashboard={dashboard}
            loading={systemStatusLoading}
            error={systemStatusError}
            onRefresh={handleRefreshSystemStatus}
          />
        ) : null;
      case 'signal-input':
        return showAdminPanel ? (
          <SignalInputPanel
            token={session.token}
            hotelId={intelligenceHotelId}
            selectedDate={selectedCheckinDate || dashboard?.marketContext?.checkinDate || ''}
            onSaved={handleSignalSaved}
          />
        ) : null;
      case 'opportunity':
        return (
          <OpportunityPanel
            dashboard={dashboard}
            loading={loading}
            error={error}
          />
        );
      case 'hotelradar':
      default:
        return (
          <>
            {!intelligenceHotelId ? (
              <section className="panel hotelRadarWorkspaceIntro" aria-label="HotelRADAR workspace">
                <header className="panelHeader">
                  <div className="gridMetaBlock">
                    <h2>HotelRADAR</h2>
                    <p className="metaLabel">
                      Select a hotel from the top bar to open its Revenue Intelligence brief.
                    </p>
                  </div>
                </header>
                <p className="metaLabel">Select a hotel to load HotelRADAR.</p>
              </section>
            ) : null}
            {intelligenceHotelId && showFocusedInsight ? (
              <section className="panel hotelRadarFocusPanel" aria-label="Focused HotelRADAR view">
                <header className="panelHeader">
                  <div className="gridMetaBlock">
                    <span className="workspaceEyebrow">Focused View</span>
                    <h3>{ADMIN_INSIGHT_OPTIONS.find((option) => option.value === selectedInsight)?.label || 'HotelRADAR Focus'}</h3>
                    <p className="metaLabel">
                      Focused access to the selected HotelRADAR intelligence block.
                    </p>
                  </div>
                  <button type="button" className="secondaryButton" onClick={() => setShowFocusedInsight(false)}>
                    Close
                  </button>
                </header>
                {renderSelectedAdminInsight()}
              </section>
            ) : null}
            <Dashboard
              dashboard={dashboard}
              loading={loading}
              error={error}
              token={session.token}
              hotelId={String(selectedHotelId || dashboard?.hotelId || '').trim()}
            />
          </>
        );
    }
  }

  function renderMobileControlPanel() {
    return (
      <section className="premiumMobileControlPanel" aria-label="Mobile dashboard controls">
        <div className="premiumMobileControlIntro">
          <span className="workspaceEyebrow">{workspaceLabel}</span>
          <h2>Revenue Intelligence Brief</h2>
          <p className="metaLabel headerScope">{scopeLabel}</p>
        </div>

        <HotelSelector
          token={session.token}
          selectedHotelId={selectedHotelId}
          onSelect={setSelectedHotelId}
          onLoadDashboard={loadDashboard}
          loading={loading}
          reloadKey={hotelListVersion}
          className="topbarSelector premiumMobileSelector"
        />

        <div className="premiumMobileActions">
          <details className="premiumMobileActionDrawer">
            <summary>More actions</summary>
            <div className="premiumMobileActionDrawerBody">
              <div className="topbarDateSearch">
                <label htmlFor="dashboard-checkin-date-mobile" className="metaLabel">Stay Date</label>
                <input
                  id="dashboard-checkin-date-mobile"
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
                  View Date
                </button>
              </div>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => handleRecalculate()}
                disabled={recalcInProgress || loading || (!selectedHotelId && !dashboard?.hotelId)}
              >
                {recalcInProgress ? 'Refreshing…' : 'Refresh Intelligence'}
              </button>
            </div>
          </details>
        </div>
      </section>
    );
  }

  return (
    <main className={`premiumShell ${sidebarPinnedOpen ? 'sidebarPinnedOpen' : 'sidebarCollapsed'}`}>
      {!isCompactViewport ? (
        <aside className="premiumSidebar" aria-label="Primary navigation">
          <div className="premiumBrand">
            <div className="premiumBrandMark" aria-hidden="true">HR</div>
            <div className="premiumBrandCopy">
              <strong className="premiumBrandTitle">HotelRADAR</strong>
              <p>Realtime revenue signals</p>
            </div>
            <button
              type="button"
              className="premiumSidebarToggle"
              onMouseDown={(event) => {
                event.preventDefault();
                setSidebarPinnedOpen((prev) => !prev);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                setSidebarPinnedOpen((prev) => !prev);
              }}
              aria-pressed={sidebarPinnedOpen}
              aria-label={sidebarPinnedOpen ? 'Collapse sidebar' : 'Pin sidebar open'}
              title={sidebarPinnedOpen ? 'Collapse sidebar' : 'Pin sidebar open'}
            >
              <span />
            </button>
          </div>
          <nav className="premiumNav">
            {visibleWorkspaceSections.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`premiumNavItem ${activeWorkspaceSection === item.value ? 'active' : ''}`}
                onClick={() => setActiveWorkspaceSection(item.value)}
                title={item.label}
              >
                <NavIcon type={item.icon} />
                <span className="premiumNavLabel">{item.label}</span>
              </button>
            ))}
            <button type="button" className="premiumNavItem" onClick={onLogout} title="Logout">
              <NavIcon type="logout" />
              <span className="premiumNavLabel">Logout</span>
            </button>
          </nav>
          {!isCompactViewport ? renderSidebarFooter('premiumSidebarFooter') : null}
        </aside>
      ) : null}

      <section className="premiumMain">
        <header className="premiumTopbar">
          {isCompactViewport ? (
            <div className="premiumMobileMenuBar">
              <div className="premiumMobileBrand" aria-label="HotelRADAR beta">
                <strong className="premiumMobileBrandTitle">Hotel Revenue Intelligence</strong>
              </div>
              <button
                type="button"
                className="premiumMobileMenuButton"
                onClick={() => setMobileNavOpen((prev) => !prev)}
                aria-expanded={mobileNavOpen}
                aria-controls="premium-mobile-nav"
                aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              >
                <span className="premiumMobileMenuIcon" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
          ) : null}
          {!isCompactViewport ? (
          <div className="premiumTopbarIntro premiumDesktopOnlyShell">
            <span className="workspaceEyebrow">HotelRADAR</span>
            <h2>Realtime revenue signals</h2>
            <p className="metaLabel headerScope">{scopeLabel}</p>
          </div>
          ) : null}

          {!isCompactViewport ? (
          <HotelSelector
            token={session.token}
            selectedHotelId={selectedHotelId}
            onSelect={setSelectedHotelId}
            onLoadDashboard={loadDashboard}
            loading={loading}
            reloadKey={hotelListVersion}
            className="topbarSelector premiumDesktopOnlyShell"
          />
          ) : null}

          {!isCompactViewport ? (
          <div className="premiumTopbarActions premiumDesktopOnlyShell">
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
                View Date
              </button>
            </div>
            <button
              type="button"
              className="secondaryButton"
              onClick={() => handleRecalculate()}
              disabled={recalcInProgress || loading || (!selectedHotelId && !dashboard?.hotelId)}
            >
              {recalcInProgress ? 'Refreshing…' : 'Refresh Intelligence'}
            </button>
          </div>
          ) : null}
        </header>

        {isCompactViewport && mobileNavOpen ? (
          <section id="premium-mobile-nav" className="premiumMobileNavPanel" aria-label="Mobile navigation menu">
            <div className="premiumMobileNav">
              {visibleWorkspaceSections.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`premiumNavItem ${activeWorkspaceSection === item.value ? 'active' : ''}`}
                  onClick={() => setActiveWorkspaceSection(item.value)}
                >
                  <NavIcon type={item.icon} />
                  <span className="premiumNavLabel">{item.label}</span>
                </button>
              ))}
              <button type="button" className="premiumNavItem" onClick={onLogout}>
                <NavIcon type="logout" />
                <span className="premiumNavLabel">Logout</span>
              </button>
            </div>
          </section>
        ) : null}

        {isCompactViewport ? renderMobileControlPanel() : null}

        <div className="premiumContent">
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

          {renderWorkspaceSection()}
        </div>
        {isCompactViewport ? renderSidebarFooter('premiumMobileFooter') : null}
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
