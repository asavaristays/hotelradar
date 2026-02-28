import LegalLayout from './LegalLayout.jsx';

export default function PrivacyPage({ onNavigate }) {
  return (
    <LegalLayout title="Privacy Policy" onNavigate={onNavigate}>
      <p>HotelRADAR collects:</p>
      <ul className="legalList">
        <li>Account details</li>
        <li>Hotel profile data</li>
        <li>Usage analytics</li>
        <li>System logs</li>
      </ul>
      <p>HotelRADAR does not sell user data.</p>
      <p>Data may be used for:</p>
      <ul className="legalList">
        <li>Platform improvement</li>
        <li>Algorithm refinement</li>
        <li>Security monitoring</li>
      </ul>
      <p>Users must not upload sensitive personal data unrelated to hotel revenue management.</p>
    </LegalLayout>
  );
}
