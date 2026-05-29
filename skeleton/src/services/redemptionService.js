import { Coupon } from '../models/Coupon.js';
import { Redemption } from '../models/Redemption.js';
import { Errors } from '../utils/errors.js';
import {
  assertCouponRedeemable,
  buildAtomicCouponFilter,
  buildRedemptionInsertPayload,
  computeDiscount,
  formatRedemptionResponse,
  formatRevertResponse,
  isDuplicateRedemptionError,
  parseRedeemBody,
  parseRedemptionId,
  throwAtomicRedeemFailure,
} from '../utils/redemptionHelpers.js';

async function decrementCouponRedemptionCount(code) {
  await Coupon.findOneAndUpdate({ code }, { $inc: { redemptionCount: -1 }, $set: { updatedAt: new Date() } });
}

export async function redeemCoupon(userId, body) {
  const { code, orderId, orderTotal } = parseRedeemBody(body);

  const coupon = await Coupon.findOne({ code });
  if (!coupon) {
    throw Errors.COUPON_NOT_FOUND();
  }

  const now = new Date();
  assertCouponRedeemable(coupon, now);

  if (coupon.maxRedemptionsPerUser !== null) {
    const userCount = await Redemption.countDocuments({
      couponId: coupon._id,
      userId,
      status: 'ACTIVE',
    });
    if (userCount >= coupon.maxRedemptionsPerUser) {
      throw Errors.COUPON_LIMIT_REACHED_FOR_USER();
    }
  }

  const existingRedemption = await Redemption.findOne({ orderId, status: 'ACTIVE' });
  if (existingRedemption) {
    if (existingRedemption.couponId.equals(coupon._id) && existingRedemption.userId === userId) {
      return formatRedemptionResponse(existingRedemption);
    }
    throw Errors.ORDER_ALREADY_HAS_REDEMPTION();
  }

  const discountAmount = computeDiscount(coupon.discountType, coupon.discountValue, orderTotal);

  const updatedCoupon = await Coupon.findOneAndUpdate(
    buildAtomicCouponFilter(code),
    { $inc: { redemptionCount: 1 }, $set: { updatedAt: new Date() } },
    { new: true },
  );

  if (!updatedCoupon) {
    const latestCoupon = await Coupon.findOne({ code });
    throwAtomicRedeemFailure(latestCoupon, code, now, Errors);
  }

  const ts = new Date();
  try {
    const redemption = await Redemption.create(
      buildRedemptionInsertPayload({
        coupon,
        code,
        userId,
        orderId,
        orderTotal,
        discountAmount,
        timestamp: ts,
      }),
    );

    return formatRedemptionResponse(redemption);
  } catch (insertErr) {
    await decrementCouponRedemptionCount(code);

    if (isDuplicateRedemptionError(insertErr)) {
      throw Errors.ORDER_ALREADY_HAS_REDEMPTION();
    }
    throw insertErr;
  }
}

export async function revertRedemption(redemptionIdParam) {
  const redemptionId = parseRedemptionId(redemptionIdParam);
  const now = new Date();

  const redemption = await Redemption.findOneAndUpdate(
    { _id: redemptionId, status: 'ACTIVE' },
    { $set: { status: 'REVERTED', revertedAt: now, updatedAt: now } },
    { new: true },
  );

  if (!redemption) {
    const existing = await Redemption.findById(redemptionId);
    if (!existing) {
      throw Errors.REDEMPTION_NOT_FOUND();
    }
    throw Errors.ALREADY_REVERTED();
  }

  const couponResult = await Coupon.updateOne(
    { _id: redemption.couponId, redemptionCount: { $gt: 0 } },
    { $inc: { redemptionCount: -1 }, $set: { updatedAt: now } },
  );

  if (couponResult.modifiedCount === 0) {
    await Redemption.findOneAndUpdate(
      { _id: redemptionId, status: 'REVERTED' },
      { $set: { status: 'ACTIVE', updatedAt: now }, $unset: { revertedAt: '' } },
    );
    throw Errors.INVALID_REDEMPTION_COUNT();
  }

  return formatRevertResponse(redemption, redemptionIdParam);
}
