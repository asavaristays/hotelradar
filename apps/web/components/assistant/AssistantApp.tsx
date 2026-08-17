"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  BOOKING_HOW_IT_WORKS,
  PRIVACY_POLICY,
  TERMS_OF_SERVICE,
} from "../../lib/content";
import {
  IconBed,
  IconBook,
  IconChat,
  IconClose,
  IconDoc,
  IconPhone,
  IconHandshake,
  IconHeadset,
  IconMenu,
  IconPanel,
  IconPlus,
  IconSend,
  IconShield,
} from "../../lib/icons";
import { BrandLogo } from "../BrandLogo";
import { InfoDocView } from "../InfoDocView";
import { clearOfferChat, loadOfferChat } from "../../lib/offerChatStore";
import { parseTrip, type TripSeed } from "../../lib/parseTrip";
import { AssistantBookingChat } from "./AssistantBookingChat";
import { BookingHowModal } from "./BookingHowModal";

type Mode =
  | "home"
  | "offer"
  | "partner"
  | "pilot"
  | "speak"
  | "booking"
  | "terms"
  | "privacy";

type Msg = { role: "bot" | "user"; text: string };
type Thread = { id: string; title: string; mode: Mode; updatedAt: number };

const MODES: Mode[] = [
  "home",
  "offer",
  "partner",
  "pilot",
  "speak",
  "booking",
  "terms",
  "privacy",
];

const MENU: Array<{
  mode: Mode;
  title: string;
  intro: string;
  icon: ReactNode;
}> = [
  {
    mode: "offer",
    title: "Get hotel offer",
    intro: "North Goa hotels — dates, guests, then a private offer from the property.",
    icon: <IconBed />,
  },
  {
    mode: "partner",
    title: "Join partner",
    intro:
      "Welcome — partners refer travellers with a tracked code. Leave your details and we'll follow up.",
    icon: <IconHandshake />,
  },
  {
    mode: "booking",
    title: "How booking works",
    intro: "How HotelRADAR Direct booking works for North Goa — from request to stay.",
    icon: <IconBook />,
  },
  {
    mode: "speak",
    title: "Speak to HotelRADAR",
    intro: "Of course. Drop a mobile or email and a preferred time.",
    icon: <IconHeadset />,
  },
  {
    mode: "terms",
    title: "Terms of service",
    intro: "HotelRADAR Direct terms of service.",
    icon: <IconDoc />,
  },
  {
    mode: "privacy",
    title: "Privacy policy",
    intro: "HotelRADAR Direct privacy policy.",
    icon: <IconShield />,
  },
];

function loadThreads(): Thread[] {
  try {
    const rows = JSON.parse(localStorage.getItem("hrd_threads") || "[]") as Thread[];
    return rows.filter((t) => MODES.includes(t.mode) && t.mode !== "home");
  } catch {
    return [];
  }
}

function saveThreads(threads: Thread[]) {
  localStorage.setItem("hrd_threads", JSON.stringify(threads.slice(0, 20)));
}

function introFor(mode: Mode, title: string): string {
  const found = MENU.find((s) => s.mode === mode);
  if (found) return found.intro;
  if (mode === "pilot") return "Happy to help with the hotel pilot. Leave your details below.";
  return `Continuing: ${title}`;
}

export function AssistantApp() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("home");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tripSeed, setTripSeed] = useState<TripSeed | null>(null);
  const [offerKey, setOfferKey] = useState(0);
  const [bookingHowOpen, setBookingHowOpen] = useState(false);

  const emptyHome = mode === "home" && messages.length === 0;
  const offerFocus = mode === "offer";

  function openBookingHow() {
    setBookingHowOpen(true);
    setMenuOpen(false);
  }

  useEffect(() => {
    setThreads(loadThreads());
    if (loadOfferChat()?.active) {
      setMode("offer");
    }
  }, []);

  function pushThread(title: string, nextMode: Mode) {
    const t: Thread = {
      id: `${Date.now()}`,
      title,
      mode: nextMode,
      updatedAt: Date.now(),
    };
    const next = [t, ...threads.filter((x) => x.title !== title)].slice(0, 20);
    setThreads(next);
    saveThreads(next);
  }

  function startMode(next: Mode, title: string, botLine?: string) {
    setError(null);
    if (next === "offer") {
      startOffer(null);
      return;
    }
    setMode(next);
    setMessages([{ role: "bot", text: botLine ?? introFor(next, title) }]);
    if (next !== "terms" && next !== "privacy" && next !== "booking") {
      pushThread(title, next);
    }
    setMenuOpen(false);
  }

  function startOffer(seed: TripSeed | null = null) {
    clearOfferChat();
    setTripSeed(seed);
    setOfferKey((k) => k + 1);
    setMode("offer");
    setError(null);
    setMessages([]);
    pushThread("Get hotel offer", "offer");
    setMenuOpen(false);
  }

  function newChat() {
    clearOfferChat();
    setMode("home");
    setMessages([]);
    setError(null);
    setDraft("");
    setTripSeed(null);
    setMenuOpen(false);
  }

  function routeIntent(text: string) {
    const lower = text.toLowerCase();
    if (lower.includes("partner") || lower.includes("referral") || lower.includes("list your property")) {
      startMode("partner", "Join partner");
      return true;
    }
    if (lower.includes("pilot") || lower.includes("hotel join")) {
      startMode("pilot", "Join hotel pilot");
      return true;
    }
    if (lower.includes("booking") || lower.includes("how it works") || lower.includes("how does")) {
      openBookingHow();
      return true;
    }
    if (lower.includes("terms")) {
      startMode("terms", "Terms of service");
      return true;
    }
    if (lower.includes("privacy")) {
      startMode("privacy", "Privacy policy");
      return true;
    }
    if (lower.includes("speak") || lower.includes("call") || lower.includes("human")) {
      startMode("speak", "Speak to HotelRADAR");
      return true;
    }
    // Natural-language trip → offer flow
    const seed = parseTrip(text);
    if (
      seed.destination ||
      lower.includes("offer") ||
      lower.includes("night") ||
      lower.includes("hotel")
    ) {
      startOffer(seed.destination || seed.party || seed.checkIn ? seed : null);
      return true;
    }
    return false;
  }

  async function onComposer(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    if (emptyHome) {
      const seed = parseTrip(text);
      startOffer(seed);
      return;
    }
    setMessages((m) => [...m, { role: "user", text }]);
    if (routeIntent(text)) return;
    setMessages((m) => [
      ...m,
      {
        role: "bot",
        text: "Describe your trip — for example “Tonight in North Goa, 2 adults” — or tap Get hotel offers. Check in within 48 hours; stay 3 or 5 days.",
      },
    ]);
  }

  return (
    <div className={`app-shell ${menuOpen ? "menu-open" : ""}`}>
      {menuOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      {/* Always-visible icon rail */}
      <nav className="icon-rail" aria-label="Quick menu">
        <button
          type="button"
          className="rail-btn"
          aria-label={menuOpen ? "Collapse menu" : "Expand menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <IconClose /> : <IconMenu />}
        </button>
        <button type="button" className="rail-btn" aria-label="New chat" onClick={newChat}>
          <IconPlus />
        </button>
        <div className="rail-sep" />
        {MENU.filter((m) => !["terms", "privacy"].includes(m.mode)).map((item) =>
          item.mode === "booking" ? (
            <button
              key={item.mode}
              type="button"
              className="rail-btn"
              aria-label={item.title}
              title={item.title}
              onClick={openBookingHow}
            >
              {item.icon}
            </button>
          ) : (
            <button
              key={item.mode}
              type="button"
              className={`rail-btn ${mode === item.mode ? "active" : ""}`}
              aria-label={item.title}
              title={item.title}
              onClick={() => startMode(item.mode, item.title, item.intro)}
            >
              {item.icon}
            </button>
          )
        )}
        <div className="rail-sep" />
        <button
          type="button"
          className={`rail-btn ${mode === "terms" ? "active" : ""}`}
          aria-label="Terms"
          title="Terms of service"
          onClick={() => startMode("terms", "Terms of service")}
        >
          <IconDoc />
        </button>
        <button
          type="button"
          className={`rail-btn ${mode === "privacy" ? "active" : ""}`}
          aria-label="Privacy"
          title="Privacy policy"
          onClick={() => startMode("privacy", "Privacy policy")}
        >
          <IconShield />
        </button>
        <a
          href="tel:+917410582898"
          className="rail-btn rail-link"
          aria-label="Helpdesk +91-7410582898"
          title="Helpdesk +91-7410582898"
        >
          <IconPhone />
        </a>
      </nav>

      {/* Sliding drawer with labels */}
      <aside className={`menu-slider ${menuOpen ? "open" : ""}`} aria-hidden={!menuOpen}>
        <div className="slider-head">
          <BrandLogo className="brand-logo-sidebar" />
          <button
            type="button"
            className="icon-btn ghost"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <IconPanel />
          </button>
        </div>

        <button type="button" className="btn-new" onClick={newChat}>
          <IconPlus /> New chat
        </button>

        <div className="nav-section">Menu</div>
        {MENU.map((item) =>
          item.mode === "booking" ? (
            <button
              key={item.mode}
              type="button"
              className="nav-item"
              onClick={openBookingHow}
            >
              <span className="nav-ico">{item.icon}</span>
              <span>{item.title}</span>
            </button>
          ) : (
            <button
              key={item.mode}
              type="button"
              className={`nav-item ${mode === item.mode ? "active" : ""}`}
              onClick={() => startMode(item.mode, item.title, item.intro)}
            >
              <span className="nav-ico">{item.icon}</span>
              <span>{item.title}</span>
            </button>
          )
        )}

        <div className="nav-section">Support</div>
        <a href="tel:+917410582898" className="nav-item" onClick={() => setMenuOpen(false)}>
          <span className="nav-ico">
            <IconPhone />
          </span>
          <span className="nav-label">Helpdesk · +91-7410582898</span>
        </a>

        <div className="nav-section">Recent</div>
        <div className="recent-scroll">
          {threads.length === 0 ? (
            <p className="muted recent-empty">No chats yet</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`nav-item ${mode === t.mode ? "active" : ""}`}
                onClick={() => startMode(t.mode, t.title)}
              >
                <span className="nav-ico">
                  <IconChat />
                </span>
                <span className="nav-label">{t.title}</span>
              </button>
            ))
          )}
        </div>

        <div className="sidebar-foot">
          <a href="tel:+917410582898" className="helpdesk-link" onClick={() => setMenuOpen(false)}>
            <IconPhone size={16} />
            <span>
              Helpdesk
              <small>+91-7410582898</small>
            </span>
          </a>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          {offerFocus || !emptyHome ? (
            <button
              type="button"
              className="icon-btn topbar-back"
              aria-label="Back to home"
              onClick={newChat}
            >
              ←
            </button>
          ) : (
            <button
              type="button"
              className="icon-btn topbar-menu"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <IconMenu />
            </button>
          )}
          {!emptyHome ? (
            <div className="topbar-title-wrap">
              <BrandLogo className="brand-logo-top" />
              {offerFocus ? <span className="topbar-flow">Get hotel offers</span> : null}
            </div>
          ) : null}
          {(offerFocus || !emptyHome) && (
            <button
              type="button"
              className="icon-btn topbar-menu topbar-menu-right"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <IconMenu />
            </button>
          )}
        </div>

        <div
          className={`chat-stage ${emptyHome ? "is-home" : ""} ${offerFocus ? "is-offer" : ""}`}
        >
          {emptyHome ? (
            <div className="home-stack home-landing">
              <div className="home-hero">
                <BrandLogo className="brand-logo-home" priority />
                <p className="home-headline">
                  Tell us the trip. Hotels send you their own direct price.
                </p>
                <p className="home-subline">
                  Check in within 48 hours · Stay 3 or 5 days · North Goa
                </p>
              </div>

              <form
                className="composer-wrap"
                onSubmit={(e) => {
                  e.preventDefault();
                  startOffer(draft.trim() ? parseTrip(draft) : null);
                }}
              >
                <div className="composer home-composer">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Tonight in North Goa, 2 adults"
                    aria-label="Describe your trip"
                  />
                  <button type="submit" aria-label="Get hotel offers">
                    <IconSend size={22} />
                  </button>
                </div>
              </form>

              <div className="home-cta-row">
                <button
                  type="button"
                  className="home-cta"
                  onClick={() => startOffer(draft.trim() ? parseTrip(draft) : null)}
                >
                  Get hotel offers
                </button>
              </div>

              <p className="home-foot">
                <button type="button" className="home-foot-link" onClick={openBookingHow}>
                  How booking works
                </button>
                <span className="home-foot-sep" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  className="home-foot-link"
                  onClick={() => startMode("pilot", "Join hotel pilot")}
                >
                  List your property
                </button>
                <span className="home-foot-sep" aria-hidden>
                  ·
                </span>
                <span>North Goa</span>
                <span className="home-foot-sep" aria-hidden>
                  ·
                </span>
                <span>Private hotel offers</span>
                <span className="home-foot-sep" aria-hidden>
                  ·
                </span>
                <span>Get offer in ~10 min</span>
              </p>
            </div>
          ) : offerFocus ? (
            <AssistantBookingChat key={offerKey} seed={tripSeed} onBackHome={newChat} />
          ) : (
            <>
              <div className="thread">
                {messages.map((m, i) => (
                  <div key={i} className={`msg ${m.role}`}>
                    {m.text}
                  </div>
                ))}

                {mode === "partner" || mode === "pilot" || mode === "speak" ? (
                  <LeadForm
                    mode={mode}
                    onDone={(text) => setMessages((m) => [...m, { role: "bot", text }])}
                  />
                ) : null}

                {mode === "booking" ? <InfoDocView doc={BOOKING_HOW_IT_WORKS} /> : null}
                {mode === "terms" ? <InfoDocView doc={TERMS_OF_SERVICE} /> : null}
                {mode === "privacy" ? <InfoDocView doc={PRIVACY_POLICY} /> : null}
              </div>

              <form className="composer-wrap" onSubmit={onComposer}>
                <div className="composer">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Tonight in North Goa, 2 adults"
                    aria-label="Describe your trip"
                  />
                  <button type="submit" disabled={!draft.trim()} aria-label="Send">
                    <IconSend />
                  </button>
                </div>
                <p className="composer-hint">
                  <button type="button" className="linkish" onClick={openBookingHow}>
                    How booking works
                  </button>
                  {" · "}
                  <Link href="/terms">Terms</Link>
                  {" · "}
                  <Link href="/privacy">Privacy</Link>
                </p>
              </form>
            </>
          )}
        </div>

        <p className="assistant-disclaimer">
          HotelRADAR can make mistakes. Check important info.
          <span className="assistant-disclaimer-beta">Beta</span>
        </p>
      </main>

      <BookingHowModal open={bookingHowOpen} onClose={() => setBookingHowOpen(false)} />
    </div>
  );
}

function LeadForm({
  mode,
  onDone,
}: {
  mode: "partner" | "pilot" | "speak";
  onDone: (text: string) => void;
}) {
  const [sent, setSent] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    localStorage.setItem(`hrd_lead_${mode}_${Date.now()}`, JSON.stringify(Object.fromEntries(fd)));
    setSent(true);
    onDone(
      mode === "partner"
        ? "Thanks — your partner interest is saved. We'll follow up about codes and onboarding."
        : mode === "pilot"
          ? "Thanks — your hotel pilot interest is saved. Our team will follow up."
          : "Got it — HotelRADAR will reach out at your preferred time."
    );
  }

  if (sent) {
    return (
      <div className="panel-card">
        <p className="ok">Submitted. Start a new chat anytime from the menu.</p>
      </div>
    );
  }

  const title =
    mode === "partner" ? "Join as a partner" : mode === "pilot" ? "Hotel pilot" : "Speak to us";

  return (
    <form className="panel-card" onSubmit={onSubmit}>
      <h2>{title}</h2>
      {mode === "partner" ? (
        <p className="muted">
          For cafés, drivers, planners, and local desks who refer travellers with a tracked code.
        </p>
      ) : null}
      <label htmlFor="lead_name">Name</label>
      <input id="lead_name" name="name" required />
      <label htmlFor="lead_contact">Mobile or email</label>
      <input id="lead_contact" name="contact" required />
      {mode === "partner" ? (
        <>
          <label htmlFor="business">Business / organisation</label>
          <input id="business" name="business" required placeholder="Café, tour desk, …" />
          <label htmlFor="area">Area</label>
          <input id="area" name="area" placeholder="North Goa" />
        </>
      ) : null}
      {mode === "pilot" ? (
        <>
          <label htmlFor="hotel">Hotel name</label>
          <input id="hotel" name="hotel" required />
          <label htmlFor="city">City</label>
          <input id="city" name="city" placeholder="Goa" />
        </>
      ) : null}
      {mode === "speak" ? (
        <>
          <label htmlFor="when">Preferred time</label>
          <input id="when" name="when" placeholder="Tomorrow afternoon" />
        </>
      ) : null}
      <label htmlFor="notes">Notes</label>
      <textarea id="notes" name="notes" rows={3} />
      <button className="btn-primary" type="submit">
        Submit
      </button>
    </form>
  );
}
