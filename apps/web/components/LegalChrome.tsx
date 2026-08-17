import Link from "next/link";
import { BrandLogo } from "./BrandLogo";

export function LegalChrome({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link href="/" className="legal-brand">
          <BrandLogo className="brand-logo-legal" />
        </Link>
        <nav className="legal-nav">
          <Link href="/how-booking-works">How booking works</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/">Assistant</Link>
        </nav>
      </header>
      <h1 className="legal-title">{title}</h1>
      {children}
    </div>
  );
}
