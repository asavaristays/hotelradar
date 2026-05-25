import {
  getHotelLeadSignals,
  getHotels as getHotelsService,
  getOpportunities as getOpportunitiesService,
  getSummary as getSummaryService,
  refreshLeadData as refreshLeadDataService,
  runPromptQuery,
} from '../services/lead-radar/leadRadarService.js';

export async function queryPrompt(req, res, next) {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    const filters = req.body?.filters || req.body?.scope || {};
    const result = await runPromptQuery(prompt, filters);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getHotels(req, res, next) {
  try {
    const result = await getHotelsService(req.query || {});
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getOpportunities(req, res, next) {
  try {
    const result = await getOpportunitiesService(req.query || {});
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getSummary(req, res, next) {
  try {
    const result = await getSummaryService({
      city: req.query?.city,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getHotel(req, res, next) {
  try {
    const hotelId = String(req.params.hotelId || '').trim();
    const result = await getHotelLeadSignals(hotelId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function refreshLeadData(req, res, next) {
  try {
    const city = String(req.body?.city || '').trim();
    const result = await refreshLeadDataService(city);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
