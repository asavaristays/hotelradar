export type InfoDoc = {
  title: string;
  updated: string;
  sections: Array<{ heading: string; body: string[] }>;
};

export const BOOKING_HOW_IT_WORKS: InfoDoc = {
  title: "How booking works",
  updated: "2026-08-09",
  sections: [
    {
      heading: "1. Tell us the trip",
      body: [
        "In the HotelRADAR booking assistant, share your North Goa dates and guests. Every query gets a booking code (OPP-…).",
      ],
    },
    {
      heading: "2. Browse & select a North Goa hotel",
      body: [
        "See matched North Goa hotels with OTA tariff (reference), Direct available online, and location. Ask about photos, location, and other facts — then confirm a private offer.",
      ],
    },
    {
      heading: "3. Private offer (10‑minute clocks)",
      body: [
        "HotelRADAR asks the hotel for a private rate (WhatsApp to hotels — API next). Target reply under 10 minutes; if none, call HotelRADAR.",
        "When an offer arrives you have 10 minutes to accept or decline. Your mobile stays with HotelRADAR until you pay — not shared with the hotel before payment.",
      ],
    },
    {
      heading: "4. Pay hotel · hotel confirms",
      body: [
        "Accept and pay the hotel directly — not HotelRADAR. The hotel confirms your stay and handles check-in. Internally this is a HotelRADAR booking on the OPP spine.",
      ],
    },
  ],
};

/** Short on-screen popup copy (assistant home). */
export const BOOKING_HOW_SHORT: Array<{ step: string; line: string }> = [
  { step: "1", line: "Tell us the trip — North Goa dates and guests." },
  { step: "2", line: "Browse North Goa hotels (OTA & Direct-online reference) and pick one." },
  { step: "3", line: "Confirm a private offer — 10‑min hotel clock, then 10‑min to accept." },
  { step: "4", line: "Pay the hotel directly; they confirm stay. Your mobile stays private until pay." },
];

export const TERMS_OF_SERVICE: InfoDoc = {
  title: "Terms of service",
  updated: "2026-08-08",
  sections: [
    {
      heading: "Service",
      body: [
        "HotelRADAR Direct helps travellers request verified private hotel offers for North Goa and helps partners refer demand.",
        "Direct is not an OTA. It does not sell inventory or process stay payments.",
      ],
    },
    {
      heading: "Offers and booking",
      body: [
        "Offers shown on Direct are invitations to confirm with the hotel.",
        "Rates, availability, cancellation, and payment terms are finalised by the hotel at confirmation.",
        "Accepting an offer on Direct does not create a paid booking until the hotel confirms and you pay the hotel directly.",
      ],
    },
    {
      heading: "Traveller responsibilities",
      body: [
        "Provide accurate contact and stay details.",
        "Complete mobile verification when requested.",
        "Review hotel terms before paying the hotel directly.",
      ],
    },
    {
      heading: "Partners and hotels",
      body: [
        "Partners may refer travellers using approved codes. Payout eligibility depends on completed-stay rules.",
        "Hotels remain responsible for property truth, guest service, confirmation, and payment.",
      ],
    },
    {
      heading: "Limitation",
      body: [
        "Direct is provided as-is for opportunity routing and coordination.",
        "We are not liable for hotel service failures, hotel payment disputes, or force majeure travel disruption.",
      ],
    },
    {
      heading: "Contact",
      body: ["For terms questions, use Speak to HotelRADAR from the assistant home."],
    },
  ],
};

export const PRIVACY_POLICY: InfoDoc = {
  title: "Privacy policy",
  updated: "2026-08-08",
  sections: [
    {
      heading: "What we collect",
      body: [
        "Name, mobile number, optional email, stay preferences, consent version, and referral codes you submit.",
        "OTP verification status and opportunity events needed to run the Direct service.",
      ],
    },
    {
      heading: "Why we use it",
      body: [
        "To verify requests, prepare private offers, contact you about your opportunity, and attribute partner referrals.",
        "To operate the desk queue and maintain an audit trail around one Opportunity ID.",
      ],
    },
    {
      heading: "Sharing",
      body: [
        "We share stay intent with the hotel needed so they can confirm your stay and take payment directly.",
        "We do not sell traveller data. Partner systems receive only approved attribution fields.",
      ],
    },
    {
      heading: "Retention",
      body: [
        "Opportunity and consent records are retained for operational and audit needs.",
        "You may request correction of contact details via Speak to HotelRADAR.",
      ],
    },
    {
      heading: "Security",
      body: [
        "OTP codes are hashed. Access is limited to Direct systems and authorised operators.",
        "Hotel payment details stay with the hotel — Direct does not store card details.",
      ],
    },
    {
      heading: "Contact",
      body: ["Privacy requests: use Speak to HotelRADAR from the assistant."],
    },
  ],
};
