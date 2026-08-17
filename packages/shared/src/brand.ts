/**
 * HotelRADAR brand tokens (kit v1.0).
 * Source of truth also lives in /brand — keep in sync when regenerating the kit.
 */
export const HOTELRADAR_BRAND = {
  version: "1.0",
  name: "HotelRADAR",
  product: "HotelRADAR Direct",
  palette: {
    amber: {
      50: "#FDF3E2",
      200: "#F3D9A6",
      400: "#E8B04A",
      500: "#E0912F",
      600: "#C4791F",
    },
    teal: {
      50: "#E6F2F0",
      200: "#A8CFC9",
      400: "#3E8C82",
      600: "#14655C",
      700: "#0E4A44",
    },
    coral: {
      200: "#F2C4B0",
      500: "#D8663A",
    },
    neutral: {
      cream: "#FFF7ED",
      sand50: "#FAF7F2",
      sand100: "#F0EBE3",
      sand300: "#D6CFC4",
      slate500: "#6E7472",
      ink900: "#16211F",
    },
  },
  roles: {
    primary: "#E0912F",
    primaryHover: "#C4791F",
    secondary: "#14655C",
    secondaryDeep: "#0E4A44",
    accent: "#D8663A",
    surface: "#FFF7ED",
    pageBg: "#FAF7F2",
    border: "#D6CFC4",
    text: "#16211F",
    textMuted: "#6E7472",
    link: "#14655C",
    /** Amber buttons use ink labels — white on amber fails contrast */
    onPrimary: "#16211F",
    onSecondary: "#FFFFFF",
  },
  fonts: {
    family: '"Nunito Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  assets: {
    lockupHorizontal: "/brand/hotelradar-lockup-horizontal.svg",
    mark: "/brand/hotelradar-mark.svg",
    markMicro: "/brand/hotelradar-mark-micro.svg",
    sunnyArc: "/brand/sunny-arc.svg",
  },
} as const;

export type HotelRadarBrand = typeof HOTELRADAR_BRAND;
