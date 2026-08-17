import Link from "next/link";
import { BrandLogo } from "./BrandLogo";

export function SiteChrome({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="shell">
      <header className="site-header">
        <Link href="/" className="brand">
          <BrandLogo className="brand-logo-legal" />
        </Link>
        <nav className="nav">
          <Link href="/">Home</Link>
          <a href="tel:+917410582898">Helpdesk +91-7410582898</a>
          <Link href="/how-booking-works">How booking works</Link>
        </nav>
      </header>
      {title ? <h1 style={{ margin: "0 0 16px", fontSize: 28 }}>{title}</h1> : null}
      {children}
    </div>
  );
}
