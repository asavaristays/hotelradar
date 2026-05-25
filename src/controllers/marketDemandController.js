import { getMarketDemand } from '../services/marketDemandService.js';

export async function getMarketDemandController(req, res, next) {
  try {
    const city = String(req.query?.city || 'Goa').trim();
    const horizonDays = Number(req.query?.horizonDays || 30);
    const payload = await getMarketDemand(city, { horizonDays });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}
