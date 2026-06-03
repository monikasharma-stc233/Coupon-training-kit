import * as redemptionService from '../services/redemptionService.js';
import { catchAsync } from '../utils/helpers.js';
import { parseUserId } from '../utils/redemptionHelpers.js';

export const redeemCoupon = catchAsync(async (req, res) => {
  const userId = parseUserId(req.headers['x-user-id']);
  const result = await redemptionService.redeemCoupon(userId, req.body);
  return res.status(200).json(result);
});

export const revertRedemption = catchAsync(async (req, res) => {
  const result = await redemptionService.revertRedemption(req.params.id);
  return res.status(200).json(result);
});
