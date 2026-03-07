import { useEffect, useState } from 'react';
import AdminManagementPanel from '../components/AdminManagementPanel.jsx';
import BetaAcceptanceModal from '../components/BetaAcceptanceModal.jsx';
import Dashboard from '../components/Dashboard.jsx';
import HotelSelector from '../components/HotelSelector.jsx';
import { downloadDashboardPdf } from '../components/dashboardPdf.js';
import { parseServerError as parseHttpServerError, readResponseBody } from '../http.js';

export default function DashboardPage({ session, onLogout, onNavigate }) {
  const [selectedHotelId, setSelectedHotelId] = useState('');
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

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function fetchCompetitiveGrid(hotelId) {
    const response = await fetch(`/hotel/${encodeURIComponent(hotelId)}/competitive-grid`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

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

  async function loadDashboard(hotelIdOverride = '') {
    const overrideId = typeof hotelIdOverride === 'string' ? hotelIdOverride : '';
    const hotelId = String(overrideId || selectedHotelId || '').trim();
    if (!hotelId) return;

    setLoading(true);
    setError('');
    try {
      const dashboardRes = await fetch(`/hotel/${encodeURIComponent(hotelId)}/dashboard`, {
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
        const fallbackGrid = await fetchCompetitiveGrid(hotelId);
        if (fallbackGrid.length) {
          dashboardJson.competitiveGrid = fallbackGrid;
        }
      }
      setDashboard(dashboardJson);
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

  async function waitForRecalculationCompletion(hotelId, jobId) {
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
        await loadDashboard(hotelId);
        return;
      }

      if (statusPayload.status === 'failed') {
        throw new Error(statusPayload.errorMessage || 'Recalculation failed.');
      }
    }

    throw new Error('Recalculation is taking longer than expected. Please retry.');
  }

  async function handleRecalculate(hotelIdOverride = '') {
    const hotelId = String(hotelIdOverride || selectedHotelId || dashboard?.hotelId || '').trim();
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
        await waitForRecalculationCompletion(hotelId, payload.jobId);
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
        await loadDashboard(hotelId);
      }
    } catch (err) {
      setBetaAcceptError(err.message || 'Unable to record beta acceptance.');
    } finally {
      setBetaAcceptLoading(false);
    }
  }

  const adminRole = session?.user?.role || '';
  const showAdminPanel = adminRole === 'super_admin' || adminRole === 'admin';
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
              disabled={!dashboard || exportingPdf}
            >
              {exportingPdf ? 'Preparing PDF...' : 'Download PDF'}
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
