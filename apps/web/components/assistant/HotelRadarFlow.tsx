"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { attachDemoOffer, createRequest, verifyOtp } from "../../lib/api";
import { clampCheckInToWindow, defaultDirectDates } from "../../lib/bookingWindow";
import type { Destination, TripSeed } from "../../lib/parseTrip";
import "./hotel-radar-flow.css";

export type { Destination };

type Answers = {
  destination: Destination | "";
  checkIn: string;
  checkOut: string;
  party: string;
  name: string;
  mobile: string;
};

type ChoiceOption = { key: string; label: string; value: string };

const DESTINATIONS: ChoiceOption[] = [
  { key: "A", label: "North Goa", value: "Goa" },
];

const PARTY: ChoiceOption[] = [
  { key: "A", label: "Just me", value: "Solo, 1 room" },
  { key: "B", label: "Two of us", value: "2 guests, 1 room" },
  { key: "C", label: "Family with kids", value: "Family, 2 rooms" },
  { key: "D", label: "Five or more", value: "Group, 3+ rooms" },
];

/** Traveller-facing steps: 1 Trip · 2 Contact · 3 OTP · 4 Done */
const TOTAL_STEPS = 4;

function partyToRoomsAdults(party: string) {
  if (party.startsWith("Solo")) return { rooms: 1, adults: 1 };
  if (party.startsWith("Family")) return { rooms: 2, adults: 3 };
  if (party.startsWith("Group")) return { rooms: 3, adults: 5 };
  return { rooms: 1, adults: 2 };
}

function seedToAnswers(seed: TripSeed | null | undefined, defaults: { checkIn: string; checkOut: string }): Answers {
  const checkIn = clampCheckInToWindow(seed?.checkIn || defaults.checkIn);
  return {
    destination: "Goa",
    checkIn,
    checkOut: seed?.checkOut && seed.checkOut > checkIn ? seed.checkOut : defaults.checkOut,
    party: seed?.party || "",
    name: "",
    mobile: "",
  };
}

function startStep(seed: TripSeed | null | undefined) {
  if (seed?.checkIn && seed.party) return 1;
  return 0;
}

type Props = {
  seed?: TripSeed | null;
};

export function HotelRadarFlow({ seed = null }: Props) {
  const defaults = useMemo(() => defaultDirectDates(1), []);
  const [step, setStep] = useState(() => startStep(seed));
  const [answers, setAnswers] = useState<Answers>(() => seedToAnswers(seed, defaults));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [oppId, setOppId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [devHint, setDevHint] = useState<string | null>(null);

  const liveRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  const guardTrip = () => {
    if (!answers.destination) {
      setError("Confirm North Goa.");
      return false;
    }
    if (!answers.checkIn || !answers.checkOut) {
      setError("Add check-in and check-out.");
      return false;
    }
    if (new Date(answers.checkOut) <= new Date(answers.checkIn)) {
      setError("Check-out needs to be after check-in.");
      return false;
    }
    if (!answers.party) {
      setError("Who’s travelling?");
      return false;
    }
    return true;
  };

  const guardContact = () => {
    if (!answers.name.trim()) {
      setError("Add your name for the hotel.");
      return false;
    }
    const digits = answers.mobile.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Enter a WhatsApp number for offers.");
      return false;
    }
    return true;
  };

  const goContact = () => {
    if (!guardTrip()) return;
    setError(null);
    setStep(1);
  };

  const back = useCallback(() => {
    if (step === 0 || step >= 2) return;
    setError(null);
    setStep(0);
  }, [step]);

  useEffect(() => {
    firstFieldRef.current?.focus();
    if (liveRef.current) {
      liveRef.current.textContent = `Step ${step + 1} of ${TOTAL_STEPS}`;
    }
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || step >= 3) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA") return;
      e.preventDefault();
      if (step === 0) goContact();
      else if (step === 1) void submitRequest();
      else if (step === 2) void confirmOtp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, answers, otpCode]);

  async function submitRequest() {
    if (!guardContact() || !answers.destination) return;
    setBusy(true);
    setError(null);
    try {
      const { rooms, adults } = partyToRoomsAdults(answers.party);
      const mobile = normalizeMobile(answers.mobile);
      const data = await createRequest({
        name: answers.name.trim(),
        mobile,
        email: null,
        consent: true,
        consent_version: "2026-08-08",
        destination: answers.destination,
        requested_area: `Other ${answers.destination}`,
        requested_property: null,
        check_in: clampCheckInToWindow(answers.checkIn),
        check_out: answers.checkOut,
        rooms,
        adults,
        children: 0,
        budget_paise: 8000 * 100,
        special_request: seed?.raw ? `Trip note: ${seed.raw}` : null,
        referral_code: null,
      });
      setPublicToken(data.public_token);
      setOppId(data.external_opportunity_id);
      if (data.otp?.dev_code) {
        setDevHint(data.otp.dev_code);
        sessionStorage.setItem(`otp_dev_${data.public_token}`, data.otp.dev_code);
      }
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start your request");
    } finally {
      setBusy(false);
    }
  }

  async function confirmOtp() {
    if (!publicToken) return;
    const code = otpCode.trim();
    if (code.length < 4) {
      setError("Enter the code from your SMS.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(publicToken, code);
      try {
        await attachDemoOffer(publicToken);
      } catch {
        /* optional */
      }
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code did not match");
    } finally {
      setBusy(false);
    }
  }

  const progress = (step + 1) / TOTAL_STEPS;

  return (
    <div className="hrf hrf-assistant">
      <div ref={liveRef} aria-live="polite" className="sr-only" />

      <div className="hrf-assistant-bar">
        <p className="hrf-assistant-label">HotelRADAR assistant</p>
        <span className="hrf-mono hrf-stepno">
          {step + 1} / {TOTAL_STEPS}
        </span>
      </div>

      <div className="hrf-progress" aria-hidden="true">
        <i style={{ width: `${progress * 100}%` }} />
      </div>

      <div key={step} className="hrf-enter">
        {step === 0 && (
          <Screen
            title="Quick trip details"
            sub="Four short answers — then hotels send a private price on WhatsApp."
          >
            <fieldset className="hrf-block">
              <legend>Market</legend>
              <Choices
                options={DESTINATIONS}
                selected={answers.destination || "Goa"}
                compact
                onPick={(v) => set("destination", v as Destination)}
              />
            </fieldset>

            <fieldset className="hrf-block">
              <legend>Nights (same-day to +48h)</legend>
              <div className="hrf-dates">
                <label className="hrf-field">
                  <span>Check in</span>
                  <input
                    ref={firstFieldRef}
                    className="hrf-input"
                    type="date"
                    min={defaults.min}
                    max={defaults.max}
                    value={answers.checkIn}
                    onChange={(e) => set("checkIn", clampCheckInToWindow(e.target.value))}
                  />
                </label>
                <label className="hrf-field">
                  <span>Check out</span>
                  <input
                    className="hrf-input"
                    type="date"
                    min={answers.checkIn}
                    value={answers.checkOut}
                    onChange={(e) => set("checkOut", e.target.value)}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="hrf-block">
              <legend>Travellers</legend>
              <Choices
                options={PARTY}
                selected={answers.party}
                compact
                onPick={(v) => set("party", v)}
              />
            </fieldset>

            <div className="hrf-actions">
              <button type="button" className="hrf-btn hrf-btn-amber" onClick={goContact}>
                Continue
              </button>
              <span className="hrf-hint">1 of 4 · Enter to continue</span>
            </div>
          </Screen>
        )}

        {step === 1 && (
          <Screen
            title="Where should offers go?"
            sub="Name + WhatsApp only. We send a one-time code, then hotels can reach you."
          >
            <label className="hrf-field hrf-stack-field">
              <span>Your name</span>
              <input
                ref={firstFieldRef}
                className="hrf-input"
                value={answers.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Traveller name"
                autoComplete="name"
              />
            </label>
            <label className="hrf-field hrf-stack-field">
              <span>WhatsApp number</span>
              <input
                className="hrf-input"
                value={answers.mobile}
                onChange={(e) => set("mobile", e.target.value)}
                placeholder="+91…"
                inputMode="tel"
                autoComplete="tel"
              />
            </label>
            <div className="hrf-actions">
              <button
                type="button"
                className="hrf-btn hrf-btn-amber"
                disabled={busy}
                onClick={() => void submitRequest()}
              >
                {busy ? "Sending…" : "Request hotel offers"}
              </button>
              <span className="hrf-hint">2 of 4</span>
            </div>
          </Screen>
        )}

        {step === 2 && (
          <Screen
            title="Confirm WhatsApp"
            sub={
              devHint
                ? `Dev code: ${devHint}`
                : "Enter the SMS code so we can deliver offers to this number."
            }
          >
            <input
              ref={firstFieldRef}
              className="hrf-input"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <div className="hrf-actions">
              <button
                type="button"
                className="hrf-btn hrf-btn-amber"
                disabled={busy}
                onClick={() => void confirmOtp()}
              >
                {busy ? "Verifying…" : "Verify & send to hotels"}
              </button>
              <span className="hrf-hint">3 of 4</span>
            </div>
          </Screen>
        )}

        {step === 3 && (
          <Screen
            title="Request sent to hotels"
            sub="First private offers usually arrive in about 10 minutes on WhatsApp. Accept the one you want and pay the hotel directly."
          >
            <dl className="hrf-card">
              <div className="hrf-row">
                <dt>Opportunity</dt>
                <dd className="hrf-mono is-signal">{oppId}</dd>
              </div>
              <div className="hrf-row">
                <dt>Trip</dt>
                <dd>North Goa</dd>
              </div>
              <div className="hrf-row">
                <dt>Stay</dt>
                <dd>
                  {answers.checkIn} → {answers.checkOut}
                </dd>
              </div>
            </dl>
            <div className="hrf-actions">
              {publicToken ? (
                <a className="hrf-btn" href={`/request/${publicToken}`}>
                  Open request status
                </a>
              ) : null}
            </div>
            <p className="hrf-hint" style={{ marginTop: 12 }}>
              4 of 4 · Done
            </p>
          </Screen>
        )}
      </div>

      {error ? <p className="hrf-error">{error}</p> : null}

      <div className="hrf-foot">
        <button
          type="button"
          className={`hrf-back ${step !== 1 ? "is-hidden" : ""}`}
          onClick={back}
        >
          ← Back
        </button>
        <span className="hrf-mono hrf-foot-note">Pay hotel directly</span>
      </div>
    </div>
  );
}

function normalizeMobile(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (raw.trim().startsWith("+")) return raw.trim();
  return `+${digits}`;
}

function Screen({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="hrf-screen">
      <div className="hrf-bot-bubble">
        <h1 className="hrf-title hrf-display">{title}</h1>
        {sub ? <p className="hrf-sub">{sub}</p> : null}
      </div>
      <div className="hrf-body">{children}</div>
    </div>
  );
}

function Choices({
  options,
  selected,
  onPick,
  compact,
}: {
  options: ChoiceOption[];
  selected: string;
  onPick: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`hrf-choices ${compact ? "is-compact" : ""}`}>
      {options.map((o) => {
        const on = selected === o.value;
        return (
          <button
            key={o.key}
            type="button"
            className={`hrf-choice ${on ? "is-on" : ""}`}
            onClick={() => onPick(o.value)}
          >
            <span className="hrf-key">{o.key}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
