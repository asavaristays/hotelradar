import { getHotelById } from '../repositories/hotelRepository.js';
import { getLatestDemandScore } from '../repositories/demandRepository.js';
import { getAlertsByHotel } from '../repositories/alertRepository.js';
import { recalculateHotelDemand } from '../services/recalculationService.js';

export async function getDashboard(req, res, next) {
  try {
    const { id } = req.params;
    const [hotel, demand, alerts] = await Promise.all([
      getHotelById(id),
      getLatestDemandScore(id),
      getAlertsByHotel(id, 10),
    ]);

    if (!hotel) {
      return res.status(404).json({ error: 'Hotel not found' });
    }

    return res.json({ hotel, latestDemand: demand, alerts });
  } catch (error) {
    return next(error);
  }
}

export async function getDemand(req, res, next) {
  try {
    const demand = await getLatestDemandScore(req.params.id);
    if (!demand) {
      return res.status(404).json({ error: 'No demand score found for hotel' });
    }
    return res.json(demand);
  } catch (error) {
    return next(error);
  }
}

export async function getAlerts(req, res, next) {
  try {
    const alerts = await getAlertsByHotel(req.params.id, 50);
    return res.json({ alerts });
  } catch (error) {
    return next(error);
  }
}

export async function recalculate(req, res, next) {
  try {
    const result = await recalculateHotelDemand(req.params.id);
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}
