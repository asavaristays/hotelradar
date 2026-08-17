/**
 * Money for HotelRADAR.
 *
 * Everything is BigInt paise. No floats anywhere — one rounding drift in a
 * commission calculation costs a hotel relationship.
 *
 * Two commercial modes (set per hotel / booking):
 *
 *   agent (default)     You are an intermediary. Hotel supplies the room.
 *                       GST on commission only. Guest room GST is hotel's.
 *
 *   principal           You supply the stay. Gross is your turnover.
 *                       Margin is not intermediary commission GST; room GST
 *                       is remitted by the platform. Hotel is paid a net cost.
 *
 * Confirm mode with counsel/CA before flipping hotels to principal.
 */

export const GST_ON_COMMISSION_BPS = 1800; // 18% on intermediary services
export const DEFAULT_GATEWAY_BPS = 200; // ~2% — confirm your actual rate

/** Common TCS rates under s.206C(1H) / ECO — confirm with CA; 0 = off. */
export const TCS_BPS_OPTIONS = [0, 10, 50, 100] as const; // 0%, 0.1%, 0.5%, 1%

export type GatewayBorneBy = "hotel" | "platform" | "split";
export type CommercialMode = "agent" | "principal";

export type BreakupInput = {
  /** What the guest pays, GST-inclusive. 1000000n = ₹10,000 */
  grossCollectedPaise: bigint;
  /** The hotel's room GST rate. 500 | 1200 | 1800. NEVER hardcode. */
  roomGstRateBps: number;
  /** Your commission / margin on the base tariff. 1200 = 12%. */
  commissionRateBps: number;
  gatewayBps?: number;
  gatewayBorneBy?: GatewayBorneBy;
  /** TCS on taxable base. Confirm ECO / 206C applicability with a CA. */
  tcsBps?: number;
  /** Both parties in Goa → CGST+SGST. Different states → IGST. */
  interState?: boolean;
  /** agent = intermediary (default). principal = you are the supplier. */
  commercialMode?: CommercialMode;
};

export type Breakup = {
  commercialMode: CommercialMode;
  grossCollectedPaise: bigint;
  /** Under principal, equals gross — your reported turnover. Under agent, 0. */
  platformTurnoverPaise: bigint;
  baseTariffPaise: bigint;
  roomGstPaise: bigint;
  commissionPaise: bigint;
  commissionGstPaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  igstPaise: bigint;
  gatewayFeePaise: bigint;
  gatewayBorneBy: GatewayBorneBy;
  tcsPaise: bigint;
  tcsRateBps: number;
  netPayoutPaise: bigint;
  /** Your revenue after your own GST / gateway share. */
  platformNetPaise: bigint;
};

/** Round-half-up division for BigInt. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function bps(amount: bigint, rateBps: number): bigint {
  return divRound(amount * BigInt(rateBps), 10000n);
}

/**
 * Split a GST-inclusive amount into base and tax.
 * Tax is derived by subtraction so base + tax === gross, exactly, always.
 */
export function splitGstInclusive(
  grossPaise: bigint,
  gstRateBps: number,
): { basePaise: bigint; gstPaise: bigint } {
  const basePaise = divRound(grossPaise * 10000n, BigInt(10000 + gstRateBps));
  return { basePaise, gstPaise: grossPaise - basePaise };
}

/**
 * The full breakup, computed once at booking confirmation and snapshotted
 * onto the Booking row. Never recompute this from live rates afterwards.
 */
export function computeBreakup(input: BreakupInput): Breakup {
  const {
    grossCollectedPaise,
    roomGstRateBps,
    commissionRateBps,
    gatewayBps = DEFAULT_GATEWAY_BPS,
    gatewayBorneBy = "hotel",
    tcsBps = 0,
    interState = false,
    commercialMode = "agent",
  } = input;

  if (grossCollectedPaise <= 0n) throw new Error("gross must be positive");
  if (commercialMode !== "agent" && commercialMode !== "principal") {
    throw new Error(`Unknown commercialMode: ${commercialMode}`);
  }

  const { basePaise, gstPaise } = splitGstInclusive(
    grossCollectedPaise,
    roomGstRateBps,
  );

  // Margin / commission is always on the BASE tariff, not GST-inclusive gross.
  const commissionPaise = bps(basePaise, commissionRateBps);

  // Agent: GST on intermediary commission. Principal: not an intermediary fee.
  const commissionGstPaise =
    commercialMode === "agent" ? bps(commissionPaise, GST_ON_COMMISSION_BPS) : 0n;

  const half = commissionGstPaise / 2n;
  const cgstPaise = interState ? 0n : half;
  const sgstPaise = interState ? 0n : commissionGstPaise - half;
  const igstPaise = interState ? commissionGstPaise : 0n;

  const gatewayFeePaise = bps(grossCollectedPaise, gatewayBps);
  const tcsPaise = tcsBps > 0 ? bps(basePaise, tcsBps) : 0n;

  const gatewayFromHotel =
    gatewayBorneBy === "hotel"
      ? gatewayFeePaise
      : gatewayBorneBy === "split"
        ? gatewayFeePaise / 2n
        : 0n;

  // Hotel net: base margin deduction + (agent) GST on commission + gateway + TCS.
  // Room GST stays with the remitter (hotel in agent mode; platform in principal).
  const netPayoutPaise =
    commercialMode === "agent"
      ? grossCollectedPaise -
        commissionPaise -
        commissionGstPaise -
        gatewayFromHotel -
        tcsPaise
      : basePaise - commissionPaise - gatewayFromHotel - tcsPaise;

  const platformNetPaise =
    commercialMode === "agent"
      ? commissionPaise - (gatewayFeePaise - gatewayFromHotel)
      : commissionPaise + gstPaise - (gatewayFeePaise - gatewayFromHotel);

  const platformTurnoverPaise =
    commercialMode === "principal" ? grossCollectedPaise : 0n;

  return {
    commercialMode,
    grossCollectedPaise,
    platformTurnoverPaise,
    baseTariffPaise: basePaise,
    roomGstPaise: gstPaise,
    commissionPaise,
    commissionGstPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    gatewayFeePaise,
    gatewayBorneBy,
    tcsPaise,
    tcsRateBps: tcsBps,
    netPayoutPaise,
    platformNetPaise,
  };
}

/**
 * Price up from a tariff instead of down from a gross — this is what the rate
 * engine does when quoting from a sheet.
 */
export function grossFromTariff(
  tariffPerNightPaise: bigint,
  nights: number,
  roomGstRateBps: number,
): bigint {
  const base = tariffPerNightPaise * BigInt(nights);
  return base + bps(base, roomGstRateBps);
}

/**
 * Invariant check. Run this in a test and as a CHECK constraint.
 * If it ever fails in production, stop and reconcile before paying anyone.
 */
export function assertBreakupValid(b: Breakup): void {
  if (b.baseTariffPaise + b.roomGstPaise !== b.grossCollectedPaise) {
    throw new Error("base + roomGst !== gross");
  }
  if (b.cgstPaise + b.sgstPaise + b.igstPaise !== b.commissionGstPaise) {
    throw new Error("GST components !== commissionGst");
  }
  if (b.commercialMode === "principal") {
    if (b.platformTurnoverPaise !== b.grossCollectedPaise) {
      throw new Error("principal turnover must equal gross");
    }
    if (b.commissionGstPaise !== 0n) {
      throw new Error("principal mode must not charge intermediary GST on margin");
    }
  } else if (b.platformTurnoverPaise !== 0n) {
    throw new Error("agent mode platform turnover must be zero");
  }
  if (b.netPayoutPaise <= 0n) {
    throw new Error("net payout is not positive");
  }
  if (b.netPayoutPaise > b.grossCollectedPaise) {
    throw new Error("payout exceeds collection");
  }
}

/* ------------------------------------------------------------------ */
/* Display                                                             */
/* ------------------------------------------------------------------ */

export function formatINR(paise: bigint): string {
  const rupees = Number(paise) / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(rupees);
}

/** The payout advice a hotel receives. Same lines, so they reconcile alone. */
export function payoutAdviceLines(
  b: Breakup,
): Array<{ label: string; paise: bigint; negative?: boolean }> {
  const lines = [
    { label: "Room tariff", paise: b.baseTariffPaise },
    {
      label:
        b.commercialMode === "principal"
          ? "GST (platform remits)"
          : "GST collected on your behalf",
      paise: b.roomGstPaise,
    },
    {
      label: b.commercialMode === "principal" ? "Less platform margin" : "Less commission",
      paise: b.commissionPaise,
      negative: true,
    },
  ];
  if (b.commissionGstPaise > 0n) {
    lines.push({
      label: "Less GST on commission",
      paise: b.commissionGstPaise,
      negative: true,
    });
  }
  if (b.gatewayBorneBy !== "platform") {
    const share =
      b.gatewayBorneBy === "split" ? b.gatewayFeePaise / 2n : b.gatewayFeePaise;
    lines.push({ label: "Less payment gateway", paise: share, negative: true });
  }
  if (b.tcsPaise > 0n) {
    lines.push({
      label: `Less TCS (${(b.tcsRateBps / 100).toFixed(2)}%)`,
      paise: b.tcsPaise,
      negative: true,
    });
  }
  lines.push({ label: "Net transferred", paise: b.netPayoutPaise });
  return lines;
}
