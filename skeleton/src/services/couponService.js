import { Coupon } from '../models/Coupon.js';
import { Errors } from '../utils/errors.js';
import {
  buildCreateCouponPayload,
  buildPatchCouponUpdate,
  isDuplicateCouponCodeError,
  normalizeCouponCode,
} from '../utils/couponHelpers.js';

export async function createCoupon(body) {
  const payload = buildCreateCouponPayload(body);

  try {
    const coupon = await Coupon.create(payload);
    return coupon.toJSON();
  } catch (err) {
    if (isDuplicateCouponCodeError(err)) {
      throw Errors.COUPON_CODE_EXISTS();
    }
    throw err;
  }
}

export async function getCouponByCode(rawCode) {
  const code = normalizeCouponCode(rawCode);
  const coupon = await Coupon.findOne({ code });
  if (!coupon) {
    throw Errors.COUPON_NOT_FOUND();
  }
  return coupon.toJSON();
}

export async function updateCoupon(rawCode, body) {
  const code = normalizeCouponCode(rawCode);

  const existingCoupon = await Coupon.findOne({ code });
  if (!existingCoupon) {
    throw Errors.COUPON_NOT_FOUND();
  }

  const update = buildPatchCouponUpdate(existingCoupon, body);
  const now = new Date();

  try {
    const updated = await Coupon.findOneAndUpdate(
      { code , __v: body.__v },
      { $set: { ...update, updatedAt: now } , $inc: { __v: 1 } },
      { new: true },
    );
    if (!updated) {
      throw Errors.VERSION_CONFLICT();
    }
    return updated.toJSON();
  } catch (err) {
    if (isDuplicateCouponCodeError(err)) {
      throw Errors.COUPON_CODE_EXISTS();
    }
    throw err;
  }
}
