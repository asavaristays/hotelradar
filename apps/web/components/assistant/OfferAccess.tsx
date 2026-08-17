"use client";

import { useMemo, useState, type FormEvent } from "react";
import { defaultDirectDates } from "../../lib/bookingWindow";

/** Guest market is North Goa; API destination remains Goa. */
const NORTH_GOA_AREAS = [
  "Calangute / Baga",
  "Anjuna / Vagator",
  "Candolim / Sinquerim",
  "Morjim / Ashwem",
  "Arambol",
  "Other North Goa",
];

type Props = {
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  busy: boolean;
  error: string | null;
};

export function OfferAccess({ onSubmit, busy, error }: Props) {
  const defaults = useMemo(() => defaultDirectDates(1), []);
  const [rooms, setRooms] = useState(1);
  const [adults, setAdults] = useState(2);
  const [showMore, setShowMore] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await onSubmit({
      name: String(fd.get("name") || "").trim(),
      mobile: String(fd.get("mobile") || "").trim(),
      email: String(fd.get("email") || "").trim() || null,
      consent: true,
      consent_version: "2026-08-08",
      destination: "Goa",
      requested_area: String(fd.get("requested_area") || ""),
      requested_property: String(fd.get("requested_property") || "").trim() || null,
      check_in: String(fd.get("check_in") || ""),
      check_out: String(fd.get("check_out") || ""),
      rooms,
      adults,
      children: Number(fd.get("children") || 0),
      special_request: String(fd.get("special_request") || "").trim() || null,
      referral_code: String(fd.get("referral_code") || "").trim() || null,
    });
  }

  return (
    <div className="offer-access">
      <form className="offer-sheet offer-enter" onSubmit={handleSubmit}>
        <p className="offer-kicker">Private hotel offer</p>
        <h1 className="offer-title">North Goa hotels</h1>
        <p className="offer-lead">Pick an area and dates. We’ll match verified North Goa hotels.</p>

        {error ? <p className="error">{error}</p> : null}

        <fieldset className="offer-block">
          <legend>Stay</legend>
          <label htmlFor="requested_area">Area</label>
          <select id="requested_area" name="requested_area" defaultValue={NORTH_GOA_AREAS[0]} required>
            {NORTH_GOA_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <div className="offer-dates">
            <div>
              <label htmlFor="check_in">Check-in</label>
              <input
                id="check_in"
                name="check_in"
                type="date"
                required
                min={defaults.min}
                max={defaults.max}
                defaultValue={defaults.check_in}
              />
            </div>
            <div>
              <label htmlFor="check_out">Check-out</label>
              <input
                id="check_out"
                name="check_out"
                type="date"
                required
                min={defaults.check_in}
                defaultValue={defaults.check_out}
              />
            </div>
          </div>
          <p className="muted">Direct window: same-day to +48 hours.</p>

          <div className="offer-counters">
            <Counter label="Rooms" value={rooms} min={1} onChange={setRooms} />
            <Counter label="Adults" value={adults} min={1} onChange={setAdults} />
          </div>
        </fieldset>

        <fieldset className="offer-block">
          <legend>You</legend>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required autoComplete="name" placeholder="Your name" />
          <label htmlFor="mobile">Mobile</label>
          <input
            id="mobile"
            name="mobile"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91…"
          />
        </fieldset>

        <button
          type="button"
          className="offer-more-toggle"
          aria-expanded={showMore}
          onClick={() => setShowMore((v) => !v)}
        >
          {showMore ? "Hide extras" : "Hotel preference, notes, referral"}
        </button>

        {showMore ? (
          <fieldset className="offer-block offer-more">
            <legend className="sr-only">Optional</legend>
            <label htmlFor="requested_property">Hotel preference</label>
            <input id="requested_property" name="requested_property" placeholder="Optional" />
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" placeholder="Optional" />
            <label htmlFor="referral_code">Referral code</label>
            <input id="referral_code" name="referral_code" placeholder="Optional" />
            <label htmlFor="special_request">Notes</label>
            <textarea id="special_request" name="special_request" rows={2} placeholder="Optional" />
            <input type="hidden" name="children" value={0} />
          </fieldset>
        ) : (
          <input type="hidden" name="children" value={0} />
        )}

        <button className="offer-cta" type="submit" disabled={busy}>
          {busy ? "Submitting…" : "Continue to verify"}
        </button>
        <p className="offer-foot">We’ll send a code to your mobile next. Confirm by hotel · Pay hotel directly</p>
      </form>
    </div>
  );
}

function Counter({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="offer-counter">
      <span>{label}</span>
      <div className="offer-counter-ctrl">
        <button
          type="button"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <strong>{value}</strong>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
