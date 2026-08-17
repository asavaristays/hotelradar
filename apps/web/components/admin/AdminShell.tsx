"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "../BrandLogo";
import { adminLogout, adminMe, type AdminUser } from "../../lib/adminApi";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/opportunities", label: "Opportunities" },
  { href: "/admin/attestation", label: "Attestation" },
  { href: "/admin/hotels", label: "Hotels" },
  { href: "/admin/guests", label: "Guests" },
  { href: "/admin/commission", label: "Commission" },
  { href: "/admin/invoices", label: "Invoices" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/redeem", label: "Redeem code" },
  { href: "/admin/comms", label: "Comms" },
  { href: "/admin/assistant", label: "Assistant" },
  { href: "/admin/exceptions", label: "Exceptions" },
  { href: "/admin/system", label: "System" },
];

export function AdminShell({
  children,
  title,
  titleClassName = "",
  actions,
}: {
  children: ReactNode;
  title?: string;
  titleClassName?: string;
  actions?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    adminMe()
      .then((d) => setUser(d.user))
      .catch(() => router.replace("/admin/login"));
  }, [router]);

  if (!user) {
    return (
      <div className="admin-boot">
        <BrandLogo className="admin-boot-logo" priority />
        <p>Opening control room…</p>
      </div>
    );
  }

  const pageTitle =
    title ||
    NAV.find((n) =>
      n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href)
    )?.label ||
    "Admin";

  return (
    <div className="admin-app">
      <aside className="admin-nav" aria-label="Admin navigation">
        <Link href="/admin" className="admin-nav-logo" aria-label="HotelRADAR Direct admin home">
          <BrandLogo className="admin-nav-lockup" priority />
          <span className="admin-nav-eyebrow">Direct · Super Admin</span>
        </Link>

        <nav className="admin-nav-links">
          {NAV.map((item) => {
            const on =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={on ? "on" : ""}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="admin-nav-foot">
          <div className="admin-user">
            <BrandLogo variant="mark-micro" className="admin-user-mark" />
            <div>
              <strong>{user.username}</strong>
              <span>super_admin</span>
            </div>
          </div>
          <button
            type="button"
            className="admin-ghost-btn"
            onClick={() => {
              void adminLogout().finally(() => router.replace("/admin/login"));
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="admin-stage">
        <header className="admin-topbar">
          <div className="admin-topbar-text">
            <p className="admin-kicker">HotelRADAR Direct</p>
            <h1 className={`admin-h1 ${titleClassName}`.trim()}>{pageTitle}</h1>
          </div>
          {actions ? <div className="admin-topbar-actions">{actions}</div> : null}
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
