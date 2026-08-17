# HotelRADAR Direct — Super Admin (Backend UI)

**Status:** S1–S5 shipped (auth · dashboard · OPP · hotels · commission)  
**Access:** Super Admin only · username + password  
**Scope now:** Internal ops console. Hotel extranet / multi-role later.

### S1 live

- Migration `005_admin_auth.sql` — `admin_users`, `admin_sessions`
- API: `POST/GET /api/v1/admin/auth/login|logout|me`, `GET /api/v1/admin/ping`
- UI: `/admin/login`, `/admin` home
- Bootstrap: `ADMIN_BOOTSTRAP_USER` + `ADMIN_BOOTSTRAP_PASSWORD` (only if table empty)

---

## 1. Purpose

A single **Super Admin** interface to operate Direct without exposing desk APIs publicly:

- Sign in with username + password  
- Manage hotels (onboarding → live)  
- Work the opportunity / private-offer spine  
- Confirm bookings, stays, commission  
- System health / config readouts  

Traveller AI assistant stays public. **All mutating ops go through Super Admin auth.**

---

## 2. Access model (v1)

| Item | Decision |
|---|---|
| Who | **Super Admin only** (one role) |
| Auth | Username + password |
| Sessions | HTTP-only secure cookie session (preferred over long-lived JWT in localStorage) |
| Password storage | Argon2id or bcrypt hash in DB |
| Users table | `admin_users` — start with 1–2 seeded accounts via env/bootstrap |
| Brute force | Rate limit login (e.g. 5 / 15 min / IP+user) |
| CSRF | SameSite=Lax/Strict cookie + origin checks on mutating routes |
| Transport | HTTPS only in production |
| Logout | Invalidate session server-side |

**Out of v1:** SSO, 2FA (add later), hotel logins, partner logins, magic links.

### Env (proposed)

```bash
ADMIN_SESSION_SECRET=   # 32+ bytes
ADMIN_BOOTSTRAP_USER=superadmin
ADMIN_BOOTSTRAP_PASSWORD=  # only used if no admin_users row exists
```

---

## 3. Architecture (fits current stack)

```
Browser  /admin/*  (Next.js app route — Super Admin UI)
    │
    ├─ POST /api/v1/admin/auth/login
    ├─ POST /api/v1/admin/auth/logout
    ├─ GET  /api/v1/admin/auth/me
    └─ /api/v1/admin/*  (all require session)
           │
           Express API (:4101)
           Postgres — admin_users, sessions, hotels, opportunities, …
```

| Layer | Choice |
|---|---|
| UI | Next.js under **`/admin`** (separate shell from traveller assistant) |
| API | Express prefix **`/api/v1/admin`** |
| Gate | Middleware: valid session → `role === 'super_admin'` |
| Existing `/desk` | **Deprecate public access**; redirect to `/admin/opportunities` or protect behind same auth |

Nginx: keep `/admin` and `/api/v1/admin` on Direct only; do not put admin on a public marketing CDN without auth.

---

## 4. Data (v1)

```sql
admin_users (
  id UUID PK,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'super_admin',  -- only super_admin in v1
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at, updated_at
)

admin_sessions (
  id UUID PK,
  admin_user_id UUID REFERENCES admin_users,
  token_hash TEXT UNIQUE NOT NULL,  -- store hash of session token
  expires_at TIMESTAMPTZ NOT NULL,
  ip TEXT, user_agent TEXT,
  revoked_at TIMESTAMPTZ,
  created_at
)
```

Later (from Operating Manual): `hotels`, `commission_entries`, `mobile_shared_at`, deadlines — admin UI is the first consumer.

---

## 5. UI map (Super Admin shell)

**Route prefix:** `/admin`

| Route | Screen | Jobs |
|---|---|---|
| `/admin/login` | Login | Username + password |
| `/admin` | Home / dashboard | Counts: open OPPs, awaiting hotel, accept window, commission due; health |
| `/admin/opportunities` | Opportunity queue | Filter destination/status; open OPP detail |
| `/admin/opportunities/[oppId]` | Opportunity detail | Trip, hotel, timers, events; actions below |
| `/admin/hotels` | Hotels list | Onboarding status, destination, SLA |
| `/admin/hotels/[id]` | Hotel detail | Profile, commercial, go-live / pause |
| `/admin/hotels/new` | Create hotel | Draft onboarding |
| `/admin/commission` | Commission ledger | Due / settled; mark settled |
| `/admin/exceptions` | Desk exceptions | Existing exception types |
| `/admin/system` | System | API health, OTP provider mode, Asavari sync flag (read) |
| `/admin/account` | Account | Change password (self) |

### Opportunity actions (v1)

| Action | Effect |
|---|---|
| Assign hotel | Link `hotel_id` / property; status → routed / hotel_notified |
| Record private offer | Write `offers_cache`; status → offer_sent; set accept deadline |
| Mark hotel declined / more details | Status branch |
| Mark traveller paid | Set `mobile_shared_at` (privacy unlock) |
| Confirm booking | Set `hotel_booking_ref` / generate `HRB-…`; status → hotel_confirmed |
| Stay completed | → commission_due + ledger row |
| Cancel / issue review | Status + note |

### Hotel actions (v1)

Create/edit profile · set commission bps · notify WhatsApp · go live / pause · attach Asavari property id if any.

---

## 6. API surface (proposed)

All under `/api/v1/admin`, session required except login.

### Auth
- `POST /auth/login` `{ username, password }` → Set-Cookie  
- `POST /auth/logout`  
- `GET /auth/me`  

### Opportunities
- `GET /opportunities?status&destination&q`  
- `GET /opportunities/:externalId` (full + events + offer + **unmasked mobile only after auth**)  
- `POST /opportunities/:externalId/assign-hotel`  
- `POST /opportunities/:externalId/offers`  
- `POST /opportunities/:externalId/mark-paid`  
- `POST /opportunities/:externalId/confirm-booking`  
- `POST /opportunities/:externalId/stay-completed`  
- `POST /opportunities/:externalId/transition` (guarded status changes)

### Hotels
- `GET/POST /hotels`  
- `GET/PATCH /hotels/:id`  
- `POST /hotels/:id/go-live`  
- `POST /hotels/:id/pause`  

### Commission
- `GET /commission?status=`  
- `POST /commission/:id/settle`  

### System
- `GET /system/overview` — healthz/readyz summary, OTP mode, counts  

**Public traveller APIs stay masked.** Admin serializers may return full mobile only inside admin session.

---

## 7. UX principles

- Dense ops UI (table + detail drawer/page) — not traveller brand theatre  
- Always show **OPP code** as primary key  
- Show both **10‑min clocks** when deadlines exist  
- Audit: every admin action → `opportunity_events` with `actor_type=admin`, `actor_id=username`  
- Confirm destructive transitions (cancel, settle)

---

## 8. Security checklist

- [ ] `/desk` no longer anonymous  
- [ ] Admin cookie `HttpOnly; Secure; SameSite=Lax`  
- [ ] Login rate limit + generic error messages  
- [ ] No admin routes in Cloudflare/Pages static export without origin auth  
- [ ] Bootstrap password rotated after first login  
- [ ] Session absolute TTL (e.g. 12h) + idle TTL (e.g. 2h)  
- [ ] Admin password change requires current password  

---

## 9. Build phases

| Phase | Deliverable |
|---|---|
| **S0** | Design lock (this doc) |
| **S1** | `admin_users` + sessions + login/logout/me |
| **S2** | `/admin` shell + dashboard + protect `/desk` |
| **S3** | Opportunities list/detail + core transitions |
| **S4** | Hotels CRUD + go-live |
| **S5** | Commission list + settle |
| **S6** | Harden (2FA optional, audit export) |

---

## 10. What we are not building in Super Admin v1

- Hotel self-service extranet logins  
- Traveller impersonation chat  
- Full ARI / inventory calendar  
- Automated WhatsApp send (button “copy WhatsApp message” is enough at first)  

---

## Related

- Ops domain design: `docs/OPERATING-MANUAL.md`  
- Product locks: `project-reference.md`  
- Current open desk (to be gated): `apps/web/app/desk/page.tsx`  
