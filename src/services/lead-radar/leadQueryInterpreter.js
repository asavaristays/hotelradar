/**
 * Normalize natural-language and structured LeadRADAR input into
 * deterministic criteria that downstream collectors can consume.
 */

const SUPPORTED_CITIES = ['Goa', 'Jaipur', 'Mumbai', 'Delhi', 'Gurugram'];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function normalizeCity(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return undefined;
  return SUPPORTED_CITIES.find((city) => city.toLowerCase() === raw);
}

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function normalizeReviewVolume(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === 'high') return 'high';
  return undefined;
}

export async function interpretPrompt(prompt, filters = {}) {
  const rawPrompt = String(prompt || '').trim();
  const normalizedPrompt = rawPrompt.toLowerCase();
  const interpreted = {
    city: undefined,
    chatbotMissing: undefined,
    ratingBelow: undefined,
    reviewVolume: undefined,
    limit: normalizeLimit(filters?.limit),
  };

  for (const city of SUPPORTED_CITIES) {
    if (normalizedPrompt.includes(city.toLowerCase())) {
      interpreted.city = city;
      break;
    }
  }

  if (
    normalizedPrompt.includes('without chatbot') ||
    normalizedPrompt.includes('chatbot missing') ||
    normalizedPrompt.includes('no chatbot')
  ) {
    interpreted.chatbotMissing = true;
  }

  const ratingMatch = normalizedPrompt.match(/rating\s+below\s+(\d+(?:\.\d+)?)/i);
  if (ratingMatch) {
    interpreted.ratingBelow = Number(ratingMatch[1]);
  }

  if (
    normalizedPrompt.includes('many reviews') ||
    normalizedPrompt.includes('high review volume') ||
    normalizedPrompt.includes('lots of reviews')
  ) {
    interpreted.reviewVolume = 'high';
  }

  return normalizeLeadFilters({
    ...filters,
    ...interpreted,
  });
}

export async function normalizeLeadFilters(filters = {}) {
  const normalized = {
    city: normalizeCity(filters?.city),
    limit: normalizeLimit(filters?.limit),
  };

  if (filters?.ratingBelow !== undefined && filters?.ratingBelow !== null && filters?.ratingBelow !== '') {
    const ratingBelow = Number(filters.ratingBelow);
    normalized.ratingBelow = Number.isFinite(ratingBelow) ? ratingBelow : undefined;
  }

  if (filters?.chatbotMissing !== undefined) {
    normalized.chatbotMissing = Boolean(filters.chatbotMissing);
  }

  normalized.reviewVolume = normalizeReviewVolume(filters?.reviewVolume);

  if (filters?.minLeadScore !== undefined && filters?.minLeadScore !== null && filters?.minLeadScore !== '') {
    const minLeadScore = Number(filters.minLeadScore);
    normalized.minLeadScore = Number.isFinite(minLeadScore) ? minLeadScore : undefined;
  }

  return normalized;
}
