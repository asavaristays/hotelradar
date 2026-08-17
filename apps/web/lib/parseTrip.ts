export type Destination = "Goa" | "Rajasthan";

export type TripSeed = {
  destination: Destination | null;
  checkIn?: string;
  checkOut?: string;
  party?: string;
  nights?: number;
  adults?: number;
  raw: string;
};

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function partyFromText(lower: string): string | undefined {
  if (/\b(solo|just me|alone|1 adult)\b/.test(lower)) return "Solo, 1 room";
  if (/\b(family|kids|children)\b/.test(lower)) return "Family, 2 rooms";
  if (/\b(group|friends|five|5\+|\b5 adults)\b/.test(lower)) return "Group, 3+ rooms";
  const adults = lower.match(/(\d+)\s*adults?/);
  if (adults) {
    const n = Number(adults[1]);
    if (n <= 1) return "Solo, 1 room";
    if (n === 2) return "2 guests, 1 room";
    if (n <= 4) return "Family, 2 rooms";
    return "Group, 3+ rooms";
  }
  if (/\b(couple|two of us|2 of us)\b/.test(lower)) return "2 guests, 1 room";
  return undefined;
}

function nightsFromText(lower: string): number | undefined {
  const m = lower.match(/(\d+)\s*nights?/);
  if (m) return Math.max(1, Number(m[1]));
  return undefined;
}

function monthDates(lower: string, nights: number): { checkIn: string; checkOut: string } | null {
  // mid-March, early April, late Jan
  const mid = lower.match(/\b(early|mid|late)?\s*-?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
  if (!mid) return null;
  const when = (mid[1] || "mid").toLowerCase();
  const monthKey = mid[2].slice(0, 3).toLowerCase();
  const month = MONTHS[monthKey] ?? MONTHS[mid[2].toLowerCase()];
  if (month === undefined) return null;

  const now = new Date();
  let year = now.getUTCFullYear();
  const day = when === "early" ? 5 : when === "late" ? 22 : 15;
  let checkIn = new Date(Date.UTC(year, month, day));
  if (checkIn.getTime() < Date.now() - 86400000) {
    year += 1;
    checkIn = new Date(Date.UTC(year, month, day));
  }
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + nights);
  return { checkIn: iso(checkIn), checkOut: iso(checkOut) };
}

/** Lightweight NL parse for home chat: destination, nights, party, rough month. */
export function parseTrip(text: string): TripSeed {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  let destination: Destination | null = null;
  if (
    /\bnorth\s*goa\b|\bcandolim\b|\banjuna\b|\bbaga\b|\bcalangute\b|\bvagator\b|\bmorjim\b|\bashwem\b|\barambol\b|\bgoa\b/.test(
      lower
    )
  ) {
    destination = "Goa";
  } else if (/\brajasthan\b|\bjaipur\b|\bjodhpur\b|\budaipur\b|\bpushkar\b|\bjawai\b/.test(lower)) {
    // Guest pilot is North Goa; map other markets to Goa so the offer flow stays on-market.
    destination = "Goa";
  }

  const nights = nightsFromText(lower) ?? 2;
  const party = partyFromText(lower);
  const adultsMatch = lower.match(/(\d+)\s*adults?/);
  const dates = monthDates(lower, nights);

  return {
    destination,
    nights,
    party,
    adults: adultsMatch ? Number(adultsMatch[1]) : undefined,
    checkIn: dates?.checkIn,
    checkOut: dates?.checkOut,
    raw,
  };
}
