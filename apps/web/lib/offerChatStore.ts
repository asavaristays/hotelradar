/** Browser-only offer-chat snapshot (pre-OTP). Cleared on New chat / fresh Get hotel offer. */

export type OfferChatPhase =
  | "trip"
  | "hotels"
  | "hotel_info"
  | "confirm"
  | "contact"
  | "otp"
  | "waiting"
  | "offer"
  | "accepted"
  | "declined"
  | "no_offer";

export type OfferChatMsg = { id: string; role: "bot" | "user"; text: string };

export type OfferChatSnapshot = {
  v: 1;
  active: boolean;
  updatedAt: number;
  phase: OfferChatPhase;
  messages: OfferChatMsg[];
  checkIn: string;
  checkOut: string;
  stayNights?: number;
  party: string;
  hotelId: string | null;
  name: string;
  mobile: string;
  publicToken: string | null;
  oppId: string | null;
  offerTotal: number | null;
  payHint: string | null;
  utr: string;
  waitEndsAt: number | null;
  acceptEndsAt: number | null;
  /** Messages already pushed to server after OTP. */
  syncedLen: number;
  otpVerified: boolean;
};

const KEY = "hrd_offer_chat_v1";

export function loadOfferChat(): OfferChatSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as OfferChatSnapshot;
    if (!data || data.v !== 1 || !data.active) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveOfferChat(snapshot: OfferChatSnapshot) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...snapshot, v: 1 as const, active: true, updatedAt: Date.now() })
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearOfferChat() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
