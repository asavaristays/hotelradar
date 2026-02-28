import { clamp, round } from '../../utils/math.js';

const BAR_INCLUDE_PATTERNS = [/bar/i, /best available/i, /room only/i, /standard/i, /flex/i];
const BAR_EXCLUDE_PATTERNS = [
  /member/i,
  /package/i,
  /promo/i,
  /corporate/i,
  /opaque/i,
  /coupon/i,
  /breakfast/i,
  /meal/i,
];

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function median(values = []) {
  const clean = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const mid = Math.floor(clean.length / 2);
  if (clean.length % 2 === 1) return clean[mid];
  return (clean[mid - 1] + clean[mid]) / 2;
}

function normalizeCancellation(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (/non.?ref/i.test(normalized)) return 'non_refundable';
  if (/free|flex/i.test(normalized)) return 'free_cancellation';
  return normalized.replace(/\s+/g, '_');
}

function isComparableBar(rateTypeRaw = '') {
  const rateType = String(rateTypeRaw || '').trim();
  if (!rateType) return true;
  if (BAR_EXCLUDE_PATTERNS.some((pattern) => pattern.test(rateType))) return false;
  if (BAR_INCLUDE_PATTERNS.some((pattern) => pattern.test(rateType))) return true;
  return false;
}

function removeTaxIfIncluded(rateObj, rawRate) {
  const rate = Number(rawRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  const includesTax = Boolean(
    rateObj?.tax_included ?? rateObj?.includes_tax ?? rateObj?.is_tax_included ?? false,
  );

  if (!includesTax) return rate;

  const taxAmount = Number(rateObj?.tax_amount);
  if (Number.isFinite(taxAmount) && taxAmount >= 0 && taxAmount < rate) {
    return rate - taxAmount;
  }

  const taxPercent = Number(rateObj?.tax_percent);
  if (Number.isFinite(taxPercent) && taxPercent > 0 && taxPercent < 60) {
    return rate / (1 + taxPercent / 100);
  }

  return rate;
}

function flattenRates(rawRow) {
  const items = toArray(rawRow?.list_of_rates);
  const hotel = String(rawRow?.hotel_name || '').trim();
  const date = String(rawRow?.date || '').trim();
  const roomType = String(rawRow?.room_category || '').trim() || 'Unknown';
  const rowCancellation = normalizeCancellation(rawRow?.cancellation_type);
  const rowSource = String(rawRow?.source || '').trim() || 'unknown';

  return items
    .map((item) => {
      if (typeof item === 'number') {
        return {
          hotel,
          date,
          roomType,
          source: rowSource,
          cancellation: rowCancellation,
          rateType: 'BAR',
          baseRate: removeTaxIfIncluded({}, item),
        };
      }

      const priceRaw =
        item?.rate ??
        item?.price ??
        item?.amount ??
        item?.value ??
        null;
      const baseRate = removeTaxIfIncluded(item, Number(priceRaw));
      const cancellation = normalizeCancellation(item?.cancellation_type || rowCancellation);
      const rateType = String(item?.rate_type || item?.fence || 'BAR');
      const source = String(item?.source || rowSource || 'unknown');

      return {
        hotel,
        date,
        roomType,
        source,
        cancellation,
        rateType,
        baseRate,
      };
    })
    .filter((row) => row.hotel && row.date && row.roomType && Number.isFinite(row.baseRate) && row.baseRate > 0);
}

function mode(values = []) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best || 'unknown';
}

/**
 * Normalize raw competitor rate payload into median BAR-like rates per hotel/date/room.
 * @param {Array<{hotel_name:string,date:string,room_category:string,list_of_rates:Array<any>,cancellation_type?:string,source?:string}>} rows
 * @returns {Array<{hotel:string,date:string,room_type:string,normalized_rate:number,source_count:number,outlier_flag:boolean}>}
 */
export function normalizeCompetitorRates(rows = []) {
  const flattened = rows.flatMap(flattenRates);
  const groups = new Map();

  for (const row of flattened) {
    const key = `${row.hotel}::${row.date}::${row.roomType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const output = [];
  for (const [key, entries] of groups.entries()) {
    const [hotel, date, roomType] = key.split('::');
    let comparable = entries.filter((entry) => isComparableBar(entry.rateType));
    if (!comparable.length) comparable = entries;

    const dominantCancellation = mode(comparable.map((entry) => entry.cancellation));
    let aligned = comparable.filter(
      (entry) =>
        entry.cancellation === dominantCancellation ||
        entry.cancellation === 'unknown' ||
        dominantCancellation === 'unknown',
    );
    if (!aligned.length) aligned = comparable;

    const groupMedian = median(aligned.map((entry) => entry.baseRate));
    const withFlags = aligned.map((entry) => {
      const deviationPct = groupMedian > 0 ? ((entry.baseRate - groupMedian) / groupMedian) * 100 : 0;
      return {
        ...entry,
        outlier: Math.abs(deviationPct) > 30,
      };
    });

    const inliers = withFlags.filter((entry) => !entry.outlier);
    const usable = inliers.length ? inliers : withFlags;
    const normalizedRate = round(median(usable.map((entry) => entry.baseRate)), 0);
    const sourceCount = new Set(usable.map((entry) => entry.source)).size;
    const outlierFlag = withFlags.some((entry) => entry.outlier);

    output.push({
      hotel,
      date,
      room_type: roomType,
      normalized_rate: normalizedRate,
      source_count: sourceCount,
      outlier_flag: outlierFlag,
    });
  }

  return output.sort((a, b) => {
    const hotelSort = a.hotel.localeCompare(b.hotel);
    if (hotelSort !== 0) return hotelSort;
    const dateSort = a.date.localeCompare(b.date);
    if (dateSort !== 0) return dateSort;
    return a.room_type.localeCompare(b.room_type);
  });
}

export function consistencyFromNormalizedRows(rows = []) {
  if (!rows.length) return 0;
  const values = rows.map((row) => Number(row.normalized_rate || 0)).filter((n) => Number.isFinite(n) && n > 0);
  if (!values.length) return 0;
  const med = median(values);
  if (med <= 0) return 0;
  const avgDeviationPct =
    values.reduce((sum, value) => sum + Math.abs(((value - med) / med) * 100), 0) / values.length;
  return round(clamp(100 - avgDeviationPct * 2.5, 0, 100), 2);
}
