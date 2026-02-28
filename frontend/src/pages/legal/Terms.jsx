import LegalLayout from './LegalLayout.jsx';

export default function TermsPage({ onNavigate }) {
  return (
    <LegalLayout title="Terms of Use" onNavigate={onNavigate}>
      <ol className="legalList legalListOrdered">
        <li>
          <strong>Scope of Service</strong>
          <p>
            HotelRADAR provides revenue intelligence analytics and algorithmic recommendations for
            hotels. No financial outcomes are guaranteed.
          </p>
        </li>
        <li>
          <strong>No Financial Advice</strong>
          <p>All outputs are informational only. Users retain full responsibility for all commercial decisions.</p>
        </li>
        <li>
          <strong>Limitation of Liability</strong>
          <p>HotelRADAR and its operators shall not be liable for:</p>
          <ul className="legalList">
            <li>Lost revenue</li>
            <li>Lost profits</li>
            <li>Pricing miscalculations</li>
            <li>Market positioning errors</li>
            <li>Indirect or consequential damages</li>
          </ul>
          <p>Total liability shall not exceed the subscription amount paid in the preceding 30 days.</p>
        </li>
        <li>
          <strong>Data Accuracy</strong>
          <p>HotelRADAR relies on external and user-provided data. Accuracy is not guaranteed.</p>
        </li>
        <li>
          <strong>Beta Services</strong>
          <p>Functionality may change without notice.</p>
        </li>
        <li>
          <strong>Intellectual Property</strong>
          <p>
            All algorithms, scoring engines, and systems remain exclusive intellectual property of
            HotelRADAR.
          </p>
        </li>
        <li>
          <strong>Governing Law</strong>
          <p>These terms are governed by the laws of India. Jurisdiction: Jodhpur, Rajasthan.</p>
        </li>
      </ol>
    </LegalLayout>
  );
}
