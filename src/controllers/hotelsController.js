import { listHotels, listHotelsForUser } from '../repositories/hotelRepository.js';

export async function getHotels(req, res, next) {
  try {
    const user = req.user;
    const hotels =
      user?.role === 'hotel_user'
        ? await listHotelsForUser(user.id)
        : await listHotels();
    return res.json(hotels);
  } catch (error) {
    return next(error);
  }
}
