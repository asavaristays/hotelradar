import LegalLayout from './LegalLayout.jsx';

export default function DisclaimerPage({ onNavigate }) {
  return (
    <LegalLayout title="Beta Disclaimer" onNavigate={onNavigate}>
      <p><strong>HotelRADAR Revenue Intelligence Platform - Beta Release</strong></p>
      <p>
        The HotelRADAR platform is currently provided in a limited beta version for evaluation and
        testing purposes only.
      </p>
      <p>By accessing or using this platform, you acknowledge and agree that:</p>
      <ol className="legalList legalListOrdered">
        <li>The software is provided "as is" and "as available", without warranties of any kind.</li>
        <li>
          Forecasts, pricing suggestions, analytics, and signals may be incomplete, inaccurate,
          delayed, or subject to change without notice.
        </li>
        <li>
          HotelRADAR provides decision-support tools only and does not constitute financial, commercial,
          legal, or investment advice.
        </li>
        <li>All pricing and revenue decisions remain solely the responsibility of the user.</li>
        <li>
          HotelRADAR shall not be liable for revenue loss, profit loss, pricing errors, business
          interruption, data inaccuracies, or consequential damages.
        </li>
        <li>Beta services may experience downtime, recalibration, or data discrepancies.</li>
        <li>Use of the beta platform is at your own risk.</li>
      </ol>
    </LegalLayout>
  );
}
