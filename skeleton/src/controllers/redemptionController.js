import * as redemptionService from '../services/redemptionService.js';
import { parseUserId } from '../utils/redemptionHelpers.js';

export async function redeemCoupon(req, res, next) {
  try {
    const userId = parseUserId(req.headers['x-user-id']);
    const result = await redemptionService.redeemCoupon(userId, req.body);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function revertRedemption(req, res, next) {
  try {
    const result = await redemptionService.revertRedemption(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
