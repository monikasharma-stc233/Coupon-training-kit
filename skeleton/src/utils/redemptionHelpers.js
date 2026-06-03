import mongoose from 'mongoose';
import { Errors } from './errors.js';
import { normalizeCouponCode } from './couponHelpers.js';

export function formatRedemptionResponse(redemption) {
  const r = redemption.toJSON ? redemption.toJSON() : redemption;
  return {
    redemptionId: r.id ?? r._id,
    couponCode: r.couponCode,
    orderId: r.orderId,
    discountType: r.discountType,
    discountValue: r.discountValue,
    discountAmount: r.discountAmount,
    orderTotal: r.orderTotal,
    createdAt: r.createdAt,
  };
}

export function computeDiscount(discountType, discountValue, orderTotal) {
  if (discountType === 'PERCENTAGE') {
    return Number((orderTotal * (discountValue / 100)).toFixed(2));
  }
  return Math.max(0, Math.min(discountValue, orderTotal));
}

export function parseUserId(headerValue) {
  if (!headerValue || String(headerValue).trim() === '') {
    throw Errors.MISSING_USER_ID();
  }
  return String(headerValue).trim();
}

export function parseRedeemBody(body) {
  const { couponCode, orderId, orderTotal } = body;

  if (!couponCode || String(couponCode).trim() === '') {
    throw Errors.MISSING_REQUIRED_FIELD('couponCode');
  }
  if (!orderId || String(orderId).trim() === '') {
    throw Errors.MISSING_REQUIRED_FIELD('orderId');
  }
  if (orderTotal === undefined || orderTotal === null) {
    throw Errors.MISSING_REQUIRED_FIELD('orderTotal');
  }

  const parsedOrderTotal = Number(orderTotal);
  if (isNaN(parsedOrderTotal) || parsedOrderTotal <= 0) {
    throw Errors.INVALID_ORDER_TOTAL();
  }

  return {
    code: normalizeCouponCode(couponCode),
    orderId: String(orderId).trim(),
    orderTotal: parsedOrderTotal,
  };
}

export function assertCouponRedeemable(coupon, now = new Date()) {
  if (coupon.status !== 'ACTIVE') {
    throw Errors.COUPON_INACTIVE();
  }

  if (coupon.validFrom !== null && now < coupon.validFrom) {
    throw Errors.COUPON_NOT_YET_VALID();
  }

  if (coupon.validUntil !== null && now >= coupon.validUntil) {
    throw Errors.COUPON_EXPIRED();
  }

  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
    throw Errors.COUPON_EXHAUSTED();
  }
}

export function buildAtomicCouponFilter(code) {
  return {
    code,
    status: 'ACTIVE',
    $and: [
      { $or: [{ maxRedemptions: null }, 
        {
          $expr: { 
            $lt: ['$redemptionCount', '$maxRedemptions'], 
          },
        },
      ] 
    },
      { $or: [{ validUntil: null }, { validUntil: { $gt: new Date() } }] },
    ],
  };
}

export function buildRedemptionInsertPayload({
  coupon,
  code,
  userId,
  orderId,
  orderTotal,
  discountAmount,
  timestamp = new Date(),
}) {
  return {
    couponId: coupon._id,
    couponCode: code,
    userId,
    orderId,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount,
    orderTotal,
    status: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    revertedAt: null,
  };
}

export function throwAtomicRedeemFailure(latestCoupon, code, now, Errors) {

  if (!latestCoupon) {
    console.log(`[ATOMIC_FAILURE] COUPON_NOT_FOUND code=${code}`);
    throw Errors.COUPON_NOT_FOUND();
  }

  if (latestCoupon.status !== 'ACTIVE') {
    console.log(`[ATOMIC_FAILURE] COUPON_INACTIVE code=${code}`);
    throw Errors.COUPON_INACTIVE();
  }

  if (
    latestCoupon.maxRedemptions !== null &&
    latestCoupon.redemptionCount >= latestCoupon.maxRedemptions
  ) {
    console.log(`[ATOMIC_FAILURE] COUPON_EXHAUSTED code=${code}`);
    throw Errors.COUPON_EXHAUSTED();
  }

  if (
    latestCoupon.validUntil &&
    latestCoupon.validUntil < now
  ) {
    console.log(`[ATOMIC_FAILURE] COUPON_EXPIRED code=${code}`);
    throw Errors.COUPON_EXPIRED();
  }

  console.log(`[ATOMIC_FAILURE] UNKNOWN_REASON code=${code}`);

  throw Errors.COUPON_EXHAUSTED();
}

export function isDuplicateRedemptionError(err) {
  return err?.code === 11000;
}

export function parseRedemptionId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw Errors.INVALID_REDEMPTION_ID();
  }
  return new mongoose.Types.ObjectId(id);
}

export function formatRevertResponse(redemption, idFallback) {
  const r = redemption.toJSON ? redemption.toJSON() : redemption;
  return {
    redemptionId: r.id ?? r._id ?? idFallback,
    status: 'REVERTED',
    revertedAt: r.revertedAt,
  };
}
