import * as couponService from '../services/couponService.js';

export async function createCoupon(req, res, next) {
  try {
    const coupon = await couponService.createCoupon(req.body);
    return res.status(201).json(coupon);
  } catch (err) {
    next(err);
  }
}

export async function getCoupon(req, res, next) {
  try {
    const coupon = await couponService.getCouponByCode(req.params.code);
    return res.status(200).json(coupon);
  } catch (err) {
    next(err);
  }
}

export async function updateCoupon(req, res, next) {
  try {
    const coupon = await couponService.updateCoupon(req.params.code, req.body);
    return res.status(200).json(coupon);
  } catch (err) {
    next(err);
  }
}
