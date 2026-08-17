/**
 * Single source of truth: Excel / CSV columns ↔ HotelRADAR hotel fields.
 * Keep Excel header text exactly as `excel` (row 1 of template).
 */

export type HotelOnboardColumn = {
  excel: string;
  /** Canonical keys accepted by import API */
  keys: string[];
  mapsTo: string;
  required?: boolean;
  note?: string;
};

export const HOTEL_ONBOARD_COLUMNS: HotelOnboardColumn[] = [
  { excel: "Display name", keys: ["display_name", "Display name", "name"], mapsTo: "display_name", required: true },
  { excel: "Legal name", keys: ["legal_name", "Legal name"], mapsTo: "legal_name" },
  { excel: "Destination", keys: ["destination", "Destination"], mapsTo: "destination", note: "Goa | Rajasthan" },
  { excel: "Belt", keys: ["belt", "Belt"], mapsTo: "belt", required: true, note: "morjim…baga" },
  { excel: "Area / road", keys: ["location", "Area / road"], mapsTo: "location" },
  {
    excel: "Category",
    keys: ["hotel_category", "Category", "category"],
    mapsTo: "hotel_category",
    note: "villa|resort|boutique|hotel|homestay|guesthouse",
  },
  { excel: "Tier", keys: ["tier", "Tier"], mapsTo: "tier", note: "core|premium|breadth" },
  { excel: "Rooms", keys: ["rooms_count", "Rooms"], mapsTo: "rooms_count" },
  { excel: "Sea facing", keys: ["sea_facing", "Sea facing"], mapsTo: "sea_facing", note: "Yes|No" },
  { excel: "Amenities", keys: ["amenities", "Amenities"], mapsTo: "amenities", note: "pool|wifi|…" },
  { excel: "Blurb", keys: ["guest_blurb", "Blurb", "blurb"], mapsTo: "guest_blurb" },
  { excel: "Photo note", keys: ["photo_note", "Photo note"], mapsTo: "photo_note" },
  { excel: "Location note", keys: ["location_note", "Location note"], mapsTo: "location_note" },
  { excel: "Extras", keys: ["extras", "Extras"], mapsTo: "extras" },
  { excel: "OTA reference INR", keys: ["ota_reference_inr", "OTA reference INR", "Est. ADR high"], mapsTo: "ota_reference_inr" },
  { excel: "OTA as of", keys: ["ota_as_of", "OTA as of"], mapsTo: "ota_as_of", note: "YYYY-MM-DD" },
  { excel: "Direct online INR", keys: ["direct_online_inr", "Direct online INR", "Est. ADR low"], mapsTo: "direct_online_inr" },
  { excel: "Photo URLs", keys: ["photo_urls", "Photo URLs", "photos"], mapsTo: "photo_urls", note: "https…|https…" },
  {
    excel: "Show in guest catalog",
    keys: ["show_in_guest_catalog", "Show in guest catalog"],
    mapsTo: "show_in_guest_catalog",
    note: "Yes|No",
  },
  { excel: "Latitude", keys: ["lat", "Latitude"], mapsTo: "lat" },
  { excel: "Longitude", keys: ["lng", "Longitude"], mapsTo: "lng" },
  { excel: "Contact name", keys: ["contact_name", "Contact name"], mapsTo: "contact_name" },
  { excel: "Role", keys: ["contact_role", "Role"], mapsTo: "contact_role" },
  { excel: "Phone", keys: ["notify_whatsapp", "Phone", "phone"], mapsTo: "notify_whatsapp" },
  { excel: "Night desk phone", keys: ["night_desk_phone", "Night desk phone"], mapsTo: "night_desk_phone" },
  { excel: "Notify email", keys: ["notify_email", "Notify email"], mapsTo: "notify_email" },
  { excel: "UPI VPA", keys: ["upi_vpa", "UPI VPA"], mapsTo: "upi_vpa" },
  { excel: "Payment note", keys: ["payment_note", "Payment note"], mapsTo: "payment_note" },
  { excel: "On OTA?", keys: ["on_ota", "On OTA?"], mapsTo: "on_ota", note: "Yes|No" },
  { excel: "GSTIN", keys: ["gstin", "GSTIN"], mapsTo: "gstin" },
  { excel: "PAN", keys: ["pan", "PAN"], mapsTo: "pan" },
  { excel: "Commission %", keys: ["commission_pct", "Commission %"], mapsTo: "commission_pct" },
  { excel: "Notes", keys: ["notes", "Notes"], mapsTo: "notes" },
];

export const HOTEL_ONBOARD_EXCEL_HEADERS = HOTEL_ONBOARD_COLUMNS.map((c) => c.excel);
