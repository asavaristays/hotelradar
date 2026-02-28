import { useState } from 'react';

export default function BetaAcceptanceModal({
  open,
  loading,
  error,
  onAccept,
  onNavigate,
}) {
  const [checked, setChecked] = useState(false);

  if (!open) return null;

  return (
    <div className="betaModalOverlay" role="dialog" aria-modal="true" aria-label="Beta acceptance required">
      <section className="betaModalCard">
        <h3>Beta Legal Acceptance Required</h3>
        <p className="metaLabel">
          HotelRADAR is currently in beta. You must accept legal terms before accessing Hotel Revenue
          Intelligence dashboard APIs.
        </p>
        <ul className="detailList">
          <li>Outputs are decision-support only and may be incomplete or delayed.</li>
          <li>All pricing and revenue decisions remain with hotel management.</li>
          <li>Beta services may include recalibration and temporary discrepancies.</li>
        </ul>

        <label className="betaCheckboxRow" htmlFor="beta_acceptance_checkbox">
          <input
            id="beta_acceptance_checkbox"
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>I acknowledge HotelRADAR is in Beta and accept the Terms of Use.</span>
        </label>

        {error ? <p className="errorText">{error}</p> : null}

        <div className="betaModalActions">
          <button type="button" className="secondaryButton" onClick={() => onNavigate('/legal/terms')}>
            View Terms
          </button>
          <button type="button" className="secondaryButton" onClick={() => onNavigate('/legal/disclaimer')}>
            View Disclaimer
          </button>
          <button type="button" disabled={!checked || loading} onClick={onAccept}>
            {loading ? 'Accepting...' : 'Accept and Continue'}
          </button>
        </div>
      </section>
    </div>
  );
}
