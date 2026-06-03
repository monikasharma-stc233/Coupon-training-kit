import * as couponService from '../services/couponService.js';
import { catchAsync } from '../utils/helpers.js';

export const createCoupon = catchAsync(async (req, res) => {
  const coupon = await couponService.createCoupon(req.body);
  return res.status(201).json(coupon);
});

export const getCoupon = catchAsync(async (req, res) => {
  const coupon = await couponService.getCouponByCode(req.params.code);
  return res.status(200).json(coupon);
});

export const updateCoupon = catchAsync(async (req, res) => {
  const coupon = await couponService.updateCoupon(req.params.code, req.body);
  return res.status(200).json(coupon);
});
