"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "../../../components/BrandLogo";
import { adminLogin, adminMe } from "../../../lib/adminApi";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    adminMe()
      .then(() => router.replace("/admin"))
      .catch(() => setChecking(false));
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLogin(username.trim(), password);
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="admin-login-wrap">
        <BrandLogo className="admin-login-hero-logo" priority />
        <p className="admin-login-checking">Checking session…</p>
      </div>
    );
  }

  return (
    <div className="admin-login-wrap">
      <div className="admin-login-frame">
        <div className="admin-login-brand">
          <BrandLogo className="admin-login-hero-logo" priority />
          <p className="admin-login-tag">Private hotel offers · Super Admin</p>
        </div>

        <form className="admin-login-card" onSubmit={onSubmit}>
          <h1>Sign in</h1>
          <p className="sub">Username and password for HotelRADAR Direct control.</p>
          {error ? <p className="admin-error">{error}</p> : null}
          <label htmlFor="admin_user">Username</label>
          <input
            id="admin_user"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <label htmlFor="admin_pass">Password</label>
          <input
            id="admin_pass"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Enter control room"}
          </button>
        </form>
      </div>
    </div>
  );
}
