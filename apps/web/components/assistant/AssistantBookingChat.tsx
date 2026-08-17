"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  acceptOffer,
  attachDemoOffer,
  createRequest,
  getOffer,
  submitGuestUtr,
  syncGuestChat,
  verifyOtp,
} from "../../lib/api";
import { defaultDirectDates, clampCheckInToWindow, checkoutFromNights, nightsBetween, STAY_NIGHT_OPTIONS, type StayNights } from "../../lib/bookingWindow";
import {
  formatInr,
  hotelsForNorthGoa,
  type CatalogHotel,
} from "../../lib/hotels-catalog";
import {
  loadOfferChat,
  saveOfferChat,
  type OfferChatMsg,
  type OfferChatPhase,
} from "../../lib/offerChatStore";
import type { TripSeed } from "../../lib/parseTrip";
import "./assistant-booking-chat.css";

type Phase = OfferChatPhase;

type ChatMsg = OfferChatMsg;

const PARTY = [
  { label: "Just me", value: "Solo, 1 room", rooms: 1, adults: 1 },
  { label: "Two of us", value: "2 guests, 1 room", rooms: 1, adults: 2 },
  { label: "Family", value: "Family, 2 rooms", rooms: 2, adults: 3 },
  { label: "Group", value: "Group, 3+ rooms", rooms: 3, adults: 5 },
] as const;

const OFFER_WAIT_MS = 10 * 60 * 1000;
const ACCEPT_WINDOW_MS = 10 * 60 * 1000;
/** Demo: surface offer after this wait so travellers aren't stuck 10 min in pilot */
const DEMO_OFFER_AFTER_MS = 12_000;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function partyMeta(party: string) {
  return PARTY.find((p) => p.value === party) ?? PARTY[1];
}

function normalizeMobile(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (raw.trim().startsWith("+")) return raw.trim();
  return `+${digits}`;
}

function Countdown({
  endsAt,
  totalMs,
  label,
  onExpire,
}: {
  endsAt: number;
  totalMs: number;
  label: string;
  onExpire?: () => void;
}) {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - Date.now()));
  const expired = useRef(false);

  useEffect(() => {
    expired.current = false;
    const tick = () => {
      const n = Math.max(0, endsAt - Date.now());
      setLeft(n);
      if (n <= 0 && !expired.current) {
        expired.current = true;
        onExpire?.();
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [endsAt, onExpire]);

  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const ratio = Math.min(1, left / totalMs);

  return (
    <div className="abc-clock" role="timer" aria-live="polite">
      <div className="abc-clock-top">
        <span>{label}</span>
        <strong className="abc-mono">
          {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </strong>
      </div>
      <div className="abc-clock-bar" aria-hidden>
        <i style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

type Props = {
  seed?: TripSeed | null;
  onBackHome?: () => void;
};

export function AssistantBookingChat({ seed = null, onBackHome }: Props) {
  const defaults = useMemo(() => defaultDirectDates(3), []);
  const hotels = hotelsForNorthGoa();
  const restored = useMemo(() => loadOfferChat(), []);

  const [phase, setPhase] = useState<Phase>(() => restored?.phase ?? "trip");
  const [messages, setMessages] = useState<ChatMsg[]>(() => restored?.messages ?? []);
  const [typing, setTyping] = useState(false);
  const [chatDraft, setChatDraft] = useState("");

  /** API destination stays Goa; guest market is North Goa only. */
  const destination = "Goa" as const;
  const [checkIn, setCheckIn] = useState(() =>
    clampCheckInToWindow(restored?.checkIn || seed?.checkIn || defaults.checkIn)
  );
  const [stayNights, setStayNights] = useState<StayNights>(() => {
    const n = restored?.stayNights ?? nightsBetween(
      restored?.checkIn || defaults.checkIn,
      restored?.checkOut || defaults.checkOut
    );
    return (STAY_NIGHT_OPTIONS as readonly number[]).includes(n) ? (n as StayNights) : 3;
  });
  const [checkOut, setCheckOut] = useState(() => {
    const inDay = clampCheckInToWindow(restored?.checkIn || seed?.checkIn || defaults.checkIn);
    if (restored?.checkOut && restored.checkOut > inDay) return restored.checkOut;
    if (seed?.checkOut && seed.checkOut > inDay) return seed.checkOut;
    return checkoutFromNights(inDay, 3);
  });
  const [party, setParty] = useState(restored?.party || seed?.party || "");
  const [hotel, setHotel] = useState<CatalogHotel | null>(() => {
    if (!restored?.hotelId) return null;
    return hotels.find((h) => h.id === restored.hotelId) ?? null;
  });
  const [name, setName] = useState(restored?.name ?? "");
  const [mobile, setMobile] = useState(restored?.mobile ?? "");
  const [otp, setOtp] = useState("");
  const [devHint, setDevHint] = useState<string | null>(null);
  const [publicToken, setPublicToken] = useState<string | null>(restored?.publicToken ?? null);
  const [oppId, setOppId] = useState<string | null>(restored?.oppId ?? null);
  const [offerTotal, setOfferTotal] = useState<number | null>(restored?.offerTotal ?? null);
  const [payHint, setPayHint] = useState<string | null>(restored?.payHint ?? null);
  const [utr, setUtr] = useState(restored?.utr ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitEndsAt, setWaitEndsAt] = useState<number | null>(() => {
    const t = restored?.waitEndsAt;
    return t && t > Date.now() ? t : null;
  });
  const [acceptEndsAt, setAcceptEndsAt] = useState<number | null>(() => {
    const t = restored?.acceptEndsAt;
    return t && t > Date.now() ? t : null;
  });
  const [syncedLen, setSyncedLen] = useState(() => restored?.syncedLen ?? 0);
  const [otpVerified, setOtpVerified] = useState(() => restored?.otpVerified ?? false);

  const threadRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>(phase);
  const tokenRef = useRef<string | null>(publicToken);
  const greetOnce = useRef(Boolean(restored?.messages?.length));
  const syncingRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    tokenRef.current = publicToken;
  }, [publicToken]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, phase, hotel, typing]);

  useEffect(() => {
    saveOfferChat({
      v: 1,
      active: true,
      updatedAt: Date.now(),
      phase,
      messages,
      checkIn,
      checkOut,
      stayNights,
      party,
      hotelId: hotel?.id ?? null,
      name,
      mobile,
      publicToken,
      oppId,
      offerTotal,
      payHint,
      utr,
      waitEndsAt,
      acceptEndsAt,
      syncedLen,
      otpVerified,
    });
  }, [
    phase,
    messages,
    checkIn,
    checkOut,
    stayNights,
    party,
    hotel,
    name,
    mobile,
    publicToken,
    oppId,
    offerTotal,
    payHint,
    utr,
    waitEndsAt,
    acceptEndsAt,
    syncedLen,
    otpVerified,
  ]);

  async function flushChatToServer(nextMessages: ChatMsg[], fromLen: number, token: string) {
    if (syncingRef.current) return fromLen;
    syncingRef.current = true;
    try {
      const data = await syncGuestChat(token, nextMessages, fromLen);
      const next = data.synced;
      setSyncedLen(next);
      return next;
    } catch {
      return fromLen;
    } finally {
      syncingRef.current = false;
    }
  }

  useEffect(() => {
    if (!otpVerified || !publicToken || messages.length <= syncedLen) return;
    const t = window.setTimeout(() => {
      void flushChatToServer(messages, syncedLen, publicToken);
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, otpVerified, publicToken, syncedLen]);

  function push(role: "bot" | "user", text: string) {
    setMessages((m) => [...m, { id: uid(), role, text }]);
  }

  async function say(text: string, delayMs = 700) {
    setTyping(true);
    await new Promise((r) => setTimeout(r, delayMs + Math.floor(Math.random() * 450)));
    setTyping(false);
    push("bot", text);
  }

  useEffect(() => {
    if (greetOnce.current) return;
    greetOnce.current = true;
    const intro = seed?.raw
      ? `Got it — North Goa for “${seed.raw.slice(0, 80)}”. Confirm dates and guests below, or type in the message box.`
      : "I’m your HotelRADAR booking assistant for North Goa. Check in within 48 hours, stay 3 or 5 days. Set dates below, or type in the message box.";
    void say(intro, 550);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyCheckIn(nextIn: string) {
    const clamped = clampCheckInToWindow(nextIn);
    setCheckIn(clamped);
    setCheckOut(checkoutFromNights(clamped, stayNights));
  }

  function applyStayNights(n: StayNights) {
    setStayNights(n);
    setCheckOut(checkoutFromNights(checkIn, n));
  }

  function applyCheckOut(nextOut: string) {
    if (!nextOut || nextOut <= checkIn) {
      setCheckOut(checkoutFromNights(checkIn, stayNights));
      return;
    }
    setCheckOut(nextOut);
    const n = nightsBetween(checkIn, nextOut);
    if ((STAY_NIGHT_OPTIONS as readonly number[]).includes(n)) {
      setStayNights(n as StayNights);
    }
  }

  function goBackStep() {
    if (phase === "trip") {
      onBackHome?.();
      return;
    }
    if (phase === "hotels") {
      setPhase("trip");
      void say("Back to dates — pick check-in (within 48h) and 3 or 5 days.");
      return;
    }
    if (phase === "hotel_info" || phase === "confirm") {
      setHotel(null);
      setPhase("hotels");
      void say("Back to the hotel list.");
      return;
    }
    if (phase === "contact") {
      setPhase("confirm");
      return;
    }
    if (phase === "otp") {
      setPhase("contact");
      return;
    }
    if (phase === "no_offer" || phase === "declined") {
      setHotel(null);
      setPhase("hotels");
      return;
    }
    onBackHome?.();
  }

  useEffect(() => {
    if (phase !== "waiting" || !publicToken) return;
    const timer = window.setTimeout(() => {
      void arriveOffer(publicToken);
    }, DEMO_OFFER_AFTER_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const composerPlaceholder =
    phase === "trip"
      ? "Message the assistant… e.g. tonight, 2 adults"
      : phase === "hotels"
        ? "Ask about a belt, or pick a hotel above…"
        : phase === "hotel_info"
          ? "Ask about this hotel…"
          : phase === "contact"
            ? "Or type your name / WhatsApp here…"
            : phase === "otp"
              ? "Or paste the 6-digit OTP here…"
              : phase === "accepted"
                ? "Ask about payment, or paste UTR…"
                : "Message HotelRADAR…";

  async function onChatSend(e: React.FormEvent) {
    e.preventDefault();
    const text = chatDraft.trim();
    if (!text || typing || busy) return;
    setChatDraft("");
    setError(null);
    push("user", text);
    const lower = text.toLowerCase();

    if (phase === "trip") {
      if (/\b(solo|just me|alone)\b/.test(lower)) setParty(PARTY[0].value);
      else if (/\b(couple|two of us|2 adults|2 guests)\b/.test(lower)) setParty(PARTY[1].value);
      else if (/\b(family|kids)\b/.test(lower)) setParty(PARTY[2].value);
      else if (/\b(group|friends|5)\b/.test(lower)) setParty(PARTY[3].value);
      await say(
        "Thanks — update dates above if needed, pick who’s travelling, then tap Show North Goa hotels. You can keep chatting here anytime."
      );
      return;
    }

    if (phase === "hotels") {
      const match = hotels.find(
        (h) =>
          lower.includes(h.name.toLowerCase().split(" ")[0]!) ||
          lower.includes(h.belt) ||
          lower.includes(h.location.toLowerCase().split(",")[0]!)
      );
      if (match) {
        selectHotel(match);
        return;
      }
      await say(
        "Pick a hotel card above, or name a belt (Morjim, Anjuna, Baga…). I’ll keep answers short and honest."
      );
      return;
    }

    if (phase === "hotel_info" && hotel) {
      if (/photo|vibe|look|room/.test(lower)) {
        await say(hotel.photoNote);
        return;
      }
      if (/where|location|near|beach|distance/.test(lower)) {
        await say(hotel.locationNote);
        return;
      }
      if (/price|rate|cost|₹|rs/.test(lower)) {
        await say(
          `Reference OTA ~${formatInr(hotel.otaNightlyInr)}/night. Your bookable price is the private offer after you request it — not an OTA number.`
        );
        return;
      }
      await say(`${hotel.blurb} ${hotel.extras} Tap Get private offer when you’re ready.`);
      return;
    }

    if (phase === "otp" && /^\d{6}$/.test(text.replace(/\D/g, ""))) {
      setOtp(text.replace(/\D/g, "").slice(0, 6));
      await say("Got the code — tap Verify & ask hotel, or I’ll wait while you confirm.");
      return;
    }

    if (phase === "accepted" && text.replace(/\s/g, "").length >= 12) {
      setUtr(text.replace(/\s/g, "").toUpperCase().slice(0, 22));
      await say("Looks like a payment reference — tap Submit UTR above when ready.");
      return;
    }

    await say(
      "I’m with you on this booking. Use the buttons above for the next step, or ask about dates, belts, or the hotel."
    );
  }

  function submitTrip() {
    setError(null);
    if (!checkIn || !checkOut || new Date(checkOut) <= new Date(checkIn)) {
      setError("Check-out must be after check-in.");
      return;
    }
    if (!party) {
      setError("Who’s travelling?");
      return;
    }
    push(
      "user",
      `North Goa · ${checkIn} → ${checkOut} · ${stayNights} nights · ${PARTY.find((p) => p.value === party)?.label ?? party}`
    );
    void say(
      "Here are matched North Goa hotels. OTA and Direct-online figures are reference only — your bookable price is the private offer from the hotel.",
      900
    );
    setPhase("hotels");
  }

  function selectHotel(h: CatalogHotel) {
    setHotel(h);
    push("user", `Select ${h.name}`);
    void say(
      `${h.name} · ${h.location}. Ask me anything in the message box, or confirm a private offer when you’re ready.`
    );
    setPhase("hotel_info");
  }

  function askAbout(kind: "photos" | "location" | "more") {
    if (!hotel) return;
    if (kind === "photos") {
      push("user", "Show photos / vibe");
      void say(hotel.photoNote);
    } else if (kind === "location") {
      push("user", "Location");
      void say(hotel.locationNote);
    } else {
      push("user", "Other details");
      void say(`${hotel.blurb} ${hotel.extras}`);
    }
  }

  function goConfirm() {
    if (!hotel) return;
    push("user", "I want a private offer");
    void say(
      `Confirm: should HotelRADAR request a private offer from ${hotel.name} for your dates? Your mobile stays with us — we don’t share it with the hotel until you pay.`
    );
    setPhase("confirm");
  }

  function confirmYes() {
    push("user", "Yes — get private offer");
    void say(
      "Add your name and WhatsApp so we can deliver the offer. Number is for HotelRADAR delivery only until you pay the hotel."
    );
    setPhase("contact");
  }

  function confirmNo() {
    push("user", "Not yet");
    void say("No problem — ask more about the hotel in the message box, or pick another from the list.");
    setPhase("hotel_info");
  }

  async function submitContact() {
    if (!hotel || !destination) return;
    setError(null);
    if (!name.trim()) {
      setError("Add your name.");
      return;
    }
    if (mobile.replace(/\D/g, "").length < 10) {
      setError("Enter a WhatsApp mobile number.");
      return;
    }
    setBusy(true);
    try {
      const meta = partyMeta(party);
      const data = await createRequest({
        name: name.trim(),
        mobile: normalizeMobile(mobile),
        email: null,
        consent: true,
        consent_version: "2026-08-09",
        destination,
        requested_area: hotel.location,
        requested_property: hotel.name,
        check_in: clampCheckInToWindow(checkIn),
        check_out: checkOut <= checkIn ? defaults.checkOut : checkOut,
        rooms: meta.rooms,
        adults: meta.adults,
        children: 0,
        budget_paise: hotel.otaNightlyInr * 100,
        public_rate_paise: hotel.otaNightlyInr * 100,
        preferences: [
          `catalog:${hotel.id}`,
          `channel:assistant_chat`,
          `mobile_policy:withheld_until_payment`,
        ],
        special_request: [
          `Selected hotel: ${hotel.name} (${hotel.id})`,
          "Mobile withheld from hotel until traveller pays.",
          seed?.raw ? `Trip note: ${seed.raw}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        referral_code: null,
      });
      setPublicToken(data.public_token);
      setOppId(data.external_opportunity_id);
      if (data.otp?.dev_code) setDevHint(data.otp.dev_code);
      push("user", `WhatsApp for offers · ${name.trim()}`);
      void say(
        `Booking code ${data.external_opportunity_id}. Enter the OTP we sent to confirm WhatsApp delivery.`
      );
      setPhase("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create request");
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp() {
    if (!publicToken) return;
    setError(null);
    if (otp.trim().length < 4) {
      setError("Enter the SMS code.");
      return;
    }
    setBusy(true);
    try {
      await verifyOtp(publicToken, otp.trim());
      const ends = Date.now() + OFFER_WAIT_MS;
      setWaitEndsAt(ends);
      setOtpVerified(true);
      push("user", "OTP verified");
      const nextMsgs: ChatMsg[] = [
        ...messages,
        { id: uid(), role: "user", text: "OTP verified" },
      ];
      void flushChatToServer(nextMsgs, syncedLen, publicToken);
      void say(
        `Verified. I’ve asked ${hotel?.name ?? "the hotel"} for a private offer. Usually under 10 minutes. HotelRADAR ↔ hotel is on WhatsApp (API coming next).`
      );
      setPhase("waiting");
      const token = dataToken(publicToken);
      window.setTimeout(() => {
        void arriveOffer(token);
      }, DEMO_OFFER_AFTER_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code did not match");
    } finally {
      setBusy(false);
    }
  }

  function dataToken(fallback: string | null) {
    return tokenRef.current || fallback;
  }

  async function arriveOffer(token: string | null) {
    const t = token || tokenRef.current;
    if (!t || phaseRef.current !== "waiting") return;
    try {
      await attachDemoOffer(t);
      const data = await getOffer(t);
      const total = data.offer?.total_amount_paise;
      if (typeof total === "number") setOfferTotal(total / 100);
      else if (hotel) setOfferTotal(Math.round(hotel.otaNightlyInr * 0.88));
      setAcceptEndsAt(Date.now() + ACCEPT_WINDOW_MS);
      void say(
        `Private offer ready from ${hotel?.name ?? "hotel"}. You have 10 minutes to accept or decline. Pay the hotel directly if you accept — not HotelRADAR.`,
        900
      );
      setPhase("offer");
    } catch {
      /* keep waiting; traveller can use no-offer path */
    }
  }

  async function onAccept() {
    if (!publicToken) return;
    setBusy(true);
    setError(null);
    try {
      await acceptOffer(publicToken);
      const data = await getOffer(publicToken);
      const pay = data.payment;
      const instructions =
        pay && typeof pay.instructions === "string"
          ? pay.instructions
          : `Pay ${hotel?.name ?? "the hotel"} directly, then submit your UTR here.`;
      setPayHint(instructions);
      if (typeof data.offer?.total_amount_paise === "number") {
        setOfferTotal(data.offer.total_amount_paise / 100);
      }
      push("user", "Accept private offer");
      await say(
        `Accepted under ${oppId}. ${instructions} HotelRADAR never collects the stay payment.`,
        800
      );
      setPhase("accepted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitUtr() {
    if (!publicToken || utr.trim().length < 12) return;
    setBusy(true);
    setError(null);
    try {
      await submitGuestUtr(publicToken, utr.trim());
      push("user", `UTR ${utr.trim()}`);
      await say(
        "UTR recorded. Waiting for the hotel to confirm payment received — then you’ll get your check-in code."
      );
      setUtr("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "UTR submit failed");
    } finally {
      setBusy(false);
    }
  }

  function onDecline() {
    push("user", "Decline offer");
    void say("Offer declined. Pick another hotel, or call HotelRADAR helpdesk +91-7410582898.");
    setPhase("declined");
  }

  function onWaitExpire() {
    if (phaseRef.current !== "waiting") return;
    void say(
      "No private offer within 10 minutes. You can wait a bit longer, try another hotel, or call HotelRADAR +91-7410582898."
    );
    setPhase("no_offer");
  }

  function onAcceptExpire() {
    if (phaseRef.current !== "offer") return;
    void say("The 10-minute accept window closed. Request a fresh private offer or call the helpdesk.");
    setPhase("no_offer");
  }

  return (
    <div className="abc">
      <div className="abc-nav">
        <button type="button" className="abc-nav-back" onClick={goBackStep}>
          ← Back
        </button>
        <button type="button" className="abc-nav-home" onClick={() => onBackHome?.()}>
          Home
        </button>
      </div>
      <div className="abc-bar">
        <div>
          <p className="abc-kicker">Get hotel offers · North Goa</p>
          {oppId ? <p className="abc-code abc-mono">{oppId}</p> : null}
        </div>
        {phase === "waiting" && waitEndsAt ? (
          <Countdown
            endsAt={waitEndsAt}
            totalMs={OFFER_WAIT_MS}
            label="Hotel reply"
            onExpire={onWaitExpire}
          />
        ) : null}
        {phase === "offer" && acceptEndsAt ? (
          <Countdown
            endsAt={acceptEndsAt}
            totalMs={ACCEPT_WINDOW_MS}
            label="Accept offer"
            onExpire={onAcceptExpire}
          />
        ) : null}
      </div>

      <div className="abc-thread" ref={threadRef}>
        {messages.map((m) => (
          <div key={m.id} className={`abc-msg ${m.role}`}>
            {m.text}
          </div>
        ))}
        {typing ? (
          <div className="abc-typing" aria-live="polite" aria-label="Assistant is typing">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {phase === "hotels" ? (
          <div className="abc-hotels">
            {hotels.map((h) => (
              <button
                key={h.id}
                type="button"
                className="abc-hotel"
                onClick={() => selectHotel(h)}
              >
                <strong>{h.name}</strong>
                <span className="abc-hotel-loc">{h.location}</span>
                <span className="abc-hotel-rates">
                  <span>
                    OTA <em>{formatInr(h.otaNightlyInr)}</em>
                    <small>/night</small>
                  </span>
                  <span>
                    Direct online{" "}
                    <em>{h.directOnlineInr ? formatInr(h.directOnlineInr) : "Not listed"}</em>
                    {h.directOnlineInr ? <small>/night</small> : null}
                  </span>
                </span>
                <span className="abc-hotel-cta">Select</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="abc-error">{error}</p> : null}

      <div className="abc-panel">
        {phase === "trip" ? (
          <div className="abc-form">
            <p className="abc-market">
              Market <strong>North Goa</strong>
            </p>
            <div className="abc-dates">
              <label>
                <span>Check in</span>
                <input
                  type="date"
                  value={checkIn}
                  min={defaults.min}
                  max={defaults.max}
                  onChange={(e) => applyCheckIn(e.target.value)}
                />
              </label>
              <label>
                <span>Check out</span>
                <input
                  type="date"
                  value={checkOut}
                  min={checkoutFromNights(checkIn, 1)}
                  onChange={(e) => applyCheckOut(e.target.value)}
                />
              </label>
            </div>
            <p className="abc-note">
              Check-in: today to +48 hours. Prefer 3 or 5 days — or set checkout on the calendar.
            </p>
            <p className="abc-label">Stay length</p>
            <div className="abc-row-chips">
              {STAY_NIGHT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`abc-chip ${stayNights === n ? "on" : ""}`}
                  onClick={() => applyStayNights(n)}
                >
                  {n} days
                </button>
              ))}
            </div>
            <p className="abc-label">Guests</p>
            <div className="abc-row-chips">
              {PARTY.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`abc-chip ${party === p.value ? "on" : ""}`}
                  onClick={() => setParty(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" className="abc-primary" onClick={submitTrip}>
              Show North Goa hotels
            </button>
          </div>
        ) : null}

        {phase === "hotel_info" ? (
          <div className="abc-row-chips wrap">
            <button type="button" className="abc-chip" onClick={() => askAbout("photos")}>
              Photos / vibe
            </button>
            <button type="button" className="abc-chip" onClick={() => askAbout("location")}>
              Location
            </button>
            <button type="button" className="abc-chip" onClick={() => askAbout("more")}>
              Other details
            </button>
            <button type="button" className="abc-primary" onClick={goConfirm}>
              Get private offer
            </button>
            <button type="button" className="abc-chip ghost" onClick={() => setPhase("hotels")}>
              Other hotels
            </button>
          </div>
        ) : null}

        {phase === "confirm" ? (
          <div className="abc-row-chips">
            <button type="button" className="abc-primary" onClick={confirmYes}>
              Yes, request offer
            </button>
            <button type="button" className="abc-chip" onClick={confirmNo}>
              Not yet
            </button>
          </div>
        ) : null}

        {phase === "contact" ? (
          <div className="abc-form">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="WhatsApp +91…"
              inputMode="tel"
              autoComplete="tel"
            />
            <p className="abc-note">Mobile hidden from hotel until you pay.</p>
            <button
              type="button"
              className="abc-primary"
              disabled={busy}
              onClick={() => void submitContact()}
            >
              {busy ? "Creating…" : "Continue"}
            </button>
          </div>
        ) : null}

        {phase === "otp" ? (
          <div className="abc-form">
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={devHint ? `Dev code ${devHint}` : "OTP code"}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <button
              type="button"
              className="abc-primary"
              disabled={busy}
              onClick={() => void submitOtp()}
            >
              {busy ? "Verifying…" : "Verify & ask hotel"}
            </button>
          </div>
        ) : null}

        {phase === "waiting" ? (
          <p className="abc-note center">
            Waiting on hotel WhatsApp reply… demo offer appears shortly; live path uses the full 10
            minutes.
          </p>
        ) : null}

        {phase === "offer" ? (
          <div className="abc-form">
            {offerTotal != null ? (
              <p className="abc-offer-price">
                Private offer <strong>{formatInr(offerTotal)}</strong>{" "}
                <span>total stay (demo)</span>
              </p>
            ) : null}
            <div className="abc-row-chips">
              <button
                type="button"
                className="abc-primary"
                disabled={busy}
                onClick={() => void onAccept()}
              >
                Accept & pay hotel
              </button>
              <button type="button" className="abc-chip" onClick={onDecline}>
                Decline
              </button>
            </div>
          </div>
        ) : null}

        {phase === "accepted" ? (
          <div className="abc-form">
            <p className="abc-note center">
              {payHint || `Next: pay ${hotel?.name ?? "hotel"} directly, then submit UTR.`}
            </p>
            <input
              className="abc-mono"
              value={utr}
              onChange={(e) => setUtr(e.target.value.toUpperCase())}
              placeholder="UTR / UPI ref (12–22)"
              minLength={12}
              maxLength={22}
            />
            <div className="abc-row-chips wrap">
              <button
                type="button"
                className="abc-primary"
                disabled={busy || utr.trim().length < 12}
                onClick={() => void onSubmitUtr()}
              >
                Submit UTR
              </button>
              {publicToken ? (
                <a className="abc-chip" href={`/offer/${publicToken}`}>
                  Open offer page
                </a>
              ) : null}
              {publicToken ? (
                <a className="abc-chip" href={`/request/${publicToken}`}>
                  Request status
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {phase === "no_offer" || phase === "declined" ? (
          <div className="abc-row-chips wrap">
            <button
              type="button"
              className="abc-chip"
              onClick={() => {
                setHotel(null);
                setPhase("hotels");
                void say("Back to the hotel list — pick another property.");
              }}
            >
              See hotels again
            </button>
            <a className="abc-chip" href="tel:+917410582898">
              Call HotelRADAR
            </a>
          </div>
        ) : null}

        <form className="abc-composer" onSubmit={(e) => void onChatSend(e)}>
          <input
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            placeholder={composerPlaceholder}
            aria-label="Message the assistant"
            disabled={busy}
            autoComplete="off"
          />
          <button type="submit" disabled={busy || typing || !chatDraft.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
