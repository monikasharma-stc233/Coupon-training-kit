import { Coupon } from '../models/Coupon.js';
import { Redemption } from '../models/Redemption.js';
import { UserCouponCounter } from '../models/UserCouponCounter.js';
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

function makeCounterId(couponId, userId) {
  return `${couponId}_${userId}`;
}

// Atomically claims one slot for (couponId, userId) if count < maxPerUser.
async function reserveUserSlot(couponId, userId, maxPerUser) {
  const counterId = makeCounterId(couponId, userId);
  try {
    await UserCouponCounter.findOneAndUpdate(
      { _id: counterId, count: { $lt: maxPerUser } },
      { $setOnInsert: { couponId, userId }, $inc: { count: 1 } },
      { upsert: true },
    );
  } catch (err) {
    if (err?.code === 11000) {
      const result = await UserCouponCounter.findOneAndUpdate(
        { _id: counterId, count: { $lt: maxPerUser } },
        { $inc: { count: 1 } },
      );
      if (!result) {
        throw Errors.COUPON_LIMIT_REACHED_FOR_USER();
      }
      return;
    }
    throw err;
  }
}

// Decrements the per-user counter after a failed or reverted redemption.
// The { count: { $gt: 0 } } guard makes this a safe no-op when the document
// does not exist (e.g. coupons without a per-user limit).
async function releaseUserSlot(couponId, userId) {
  const counterId = makeCounterId(couponId, userId);
  await UserCouponCounter.updateOne(
    { _id: counterId, count: { $gt: 0 } },
    { $inc: { count: -1 } },
  );
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

  if (coupon.maxRedemptionsPerUser !== null) {
    await reserveUserSlot(coupon._id, userId, coupon.maxRedemptionsPerUser);
  }
  const discountAmount = computeDiscount(coupon.discountType, coupon.discountValue, orderTotal);

  const updatedCoupon = await Coupon.findOneAndUpdate(
    buildAtomicCouponFilter(code),
    { $inc: { redemptionCount: 1 }, $set: { updatedAt: new Date() } },
    { new: true },
  );

  if (!updatedCoupon) {
    if (coupon.maxRedemptionsPerUser !== null) {
      await releaseUserSlot(coupon._id, userId);
    }
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

    if (coupon.maxRedemptionsPerUser !== null) {
      await releaseUserSlot(coupon._id, userId);
    }
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

  await releaseUserSlot(redemption.couponId, redemption.userId);
  return formatRevertResponse(redemption, redemptionIdParam);
}
