import type { Destination } from "./parseTrip";

/** North Goa pilot belts — must match API ROUTABLE_BELTS. */
export const NORTH_GOA_BELTS = [
  "morjim",
  "ashwem",
  "arambol",
  "anjuna",
  "vagator",
  "candolim",
  "calangute",
  "baga",
] as const;

export type NorthGoaBelt = (typeof NORTH_GOA_BELTS)[number];

export type CatalogHotel = {
  id: string;
  name: string;
  destination: Destination;
  location: string;
  /** Routing / KB belt */
  belt: NorthGoaBelt | "other";
  /** Reference OTA nightly, INR */
  otaNightlyInr: number;
  /** Public direct / website nightly if listed, INR — null if not online */
  directOnlineInr: number | null;
  blurb: string;
  photoNote: string;
  locationNote: string;
  extras: string;
};

/** Beta shortlist for assistant chat — North Goa belts only (plus kept non-pilot entries below). */
export const HOTELS_CATALOG: CatalogHotel[] = [
  {
    id: "goa-morjim-dune",
    name: "Morjim Dune House",
    destination: "Goa",
    location: "Morjim, North Goa",
    belt: "morjim",
    otaNightlyInr: 9800,
    directOnlineInr: 9100,
    blurb: "Quieter North Goa belt — good when you want sand without Baga nights.",
    photoNote: "Garden rooms, dune path, small pool.",
    locationNote: "Morjim beach ~6 min walk; Ashwem ~12 min.",
    extras: "Kitchenette suites · Quiet after 11pm · Bike desk",
  },
  {
    id: "goa-ashwem-line",
    name: "Ashwem Shoreline Inn",
    destination: "Goa",
    location: "Ashwem, North Goa",
    belt: "ashwem",
    otaNightlyInr: 10200,
    directOnlineInr: 9600,
    blurb: "Beach-lane stay between Morjim and Arambol.",
    photoNote: "Shore deck, light rooms, evening bar.",
    locationNote: "Ashwem beach access; Arambol market ~15 min.",
    extras: "Breakfast included on many dates · Late checkout on request",
  },
  {
    id: "goa-arambol-grove",
    name: "Arambol Grove Stay",
    destination: "Goa",
    location: "Arambol, North Goa",
    belt: "arambol",
    otaNightlyInr: 7600,
    directOnlineInr: 7100,
    blurb: "Backpacker-friendly belt — honest about monsoon access.",
    photoNote: "Garden cottages and simple beach-path rooms.",
    locationNote: "Main beach path; Prefer day arrivals in monsoon.",
    extras: "Scooter desk · Quiet inland rooms · Breakfast optional",
  },
  {
    id: "goa-anjuna-cliff",
    name: "Anjuna Cliff House",
    destination: "Goa",
    location: "Anjuna, North Goa",
    belt: "anjuna",
    otaNightlyInr: 11400,
    directOnlineInr: 10800,
    blurb: "Cliff-edge rooms; quieter than the Baga strip, louder than Morjim.",
    photoNote: "Sunset terrace, rock-pool, and suite balconies.",
    locationNote: "Above Anjuna beach; scooter / cab to Vagator ~10 min.",
    extras: "Adults-preferred evenings · Yoga lawn · Late checkout on request",
  },
  {
    id: "goa-vagator-salt",
    name: "Vagator Salt & Stone",
    destination: "Goa",
    location: "Vagator, North Goa",
    belt: "vagator",
    otaNightlyInr: 12800,
    directOnlineInr: 11900,
    blurb: "Design-led stay near Chapora / Ozran cliffs.",
    photoNote: "Stone courtyard, infinity edge, suite lofts.",
    locationNote: "Vagator cliff / Ozran; Chapora fort ~8 min.",
    extras: "In-house café · Scooter desk · Pet policy on request",
  },
  {
    id: "goa-candolim-marina",
    name: "Candolim Marina Inn",
    destination: "Goa",
    location: "Candolim, North Goa",
    belt: "candolim",
    otaNightlyInr: 7800,
    directOnlineInr: null,
    blurb: "Family-friendly Candolim–Sinquerim stretch.",
    photoNote: "Two pools, family rooms, kids splash zone.",
    locationNote: "Candolim–Sinquerim; Fort Aguada ~12 min.",
    extras: "Connecting rooms · Airport transfer paid · Kitchenette suites",
  },
  {
    id: "goa-calangute-palm",
    name: "Calangute Palm Suites",
    destination: "Goa",
    location: "Calangute, North Goa",
    belt: "calangute",
    otaNightlyInr: 9200,
    directOnlineInr: 8500,
    blurb: "Beach-road boutique with pool — central and lively.",
    photoNote: "Pool deck, sea-facing rooms, and evening café terrace.",
    locationNote: "~8 min walk to Calangute beach; taxis easy to Baga / Anjuna.",
    extras: "Breakfast optional · Free cancellation on many dates · 24h desk",
  },
  {
    id: "goa-baga-cove",
    name: "Baga Cove Stay",
    destination: "Goa",
    location: "Baga, North Goa",
    belt: "baga",
    otaNightlyInr: 8600,
    directOnlineInr: 8000,
    blurb: "Close to Baga beach and night strip — say so if guests want quiet.",
    photoNote: "Compact modern rooms and rooftop lounge.",
    locationNote: "Baga beach ~5 min; Calangute market ~10 min.",
    extras: "24h desk · Airport transfer paid · Party-friendly zones",
  },
];

export function hotelsForDestination(destination: Destination): CatalogHotel[] {
  return HOTELS_CATALOG.filter((h) => h.destination === destination);
}

/** Guest “Get hotel offers” shortlist — North Goa pilot belts only. */
export function hotelsForNorthGoa(): CatalogHotel[] {
  return HOTELS_CATALOG.filter(
    (h) => h.destination === "Goa" && (NORTH_GOA_BELTS as readonly string[]).includes(h.belt)
  );
}

export function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
