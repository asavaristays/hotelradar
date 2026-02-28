export default function LegalLayout({ title, children, onNavigate }) {
  return (
    <main className="legalShell">
      <section className="legalCard">
        <header className="legalHeader">
          <p className="workspaceEyebrow">HotelRADAR - Revenue Intelligence Cockpit</p>
          <h1>{title}</h1>
          <div className="legalLinks">
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
        </header>
        <div className="legalBody">{children}</div>
        <footer className="legalFooter">
          <p>Support : support@hotelradar.in | Mobile No. +91-9828981000</p>
          <p>Address: 746, New Wada, Morjim Goa 403512</p>
          <p>
            Caution: Beta version and calibrating under process may make mistakes. Use safer-side
            validation before final pricing action.
          </p>
          <button type="button" className="secondaryButton" onClick={() => onNavigate('/')}>
            Back
          </button>
        </footer>
      </section>
    </main>
  );
}
