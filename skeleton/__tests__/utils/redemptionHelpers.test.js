import mongoose from 'mongoose';
import {
  computeDiscount,
  parseUserId,
  parseRedeemBody,
  assertCouponRedeemable,
  buildAtomicCouponFilter,
  buildRedemptionInsertPayload,
  formatRedemptionResponse,
  formatRevertResponse,
  isDuplicateRedemptionError,
  parseRedemptionId,
} from '../../src/utils/redemptionHelpers.js';

// ─── computeDiscount ──────────────────────────────────────────────────────

describe('computeDiscount', () => {
  it('computes PERCENTAGE discount correctly', () => {
    expect(computeDiscount('PERCENTAGE', 10, 200)).toBe(20);
  });

  it('rounds PERCENTAGE discount to 2 decimal places', () => {
    expect(computeDiscount('PERCENTAGE', 15, 33.33)).toBeCloseTo(4.999, 2);
  });

  it('computes FLAT discount correctly', () => {
    expect(computeDiscount('FLAT', 50, 200)).toBe(50);
  });

  it('caps FLAT discount at the order total', () => {
    expect(computeDiscount('FLAT', 300, 100)).toBe(100);
  });

  it('returns 0 for FLAT discount of 0', () => {
    expect(computeDiscount('FLAT', 0, 100)).toBe(0);
  });
});

// ─── parseUserId ──────────────────────────────────────────────────────────

describe('parseUserId', () => {
  it('returns trimmed user id for a valid header', () => {
    expect(parseUserId('  user123  ')).toBe('user123');
  });

  it('throws MISSING_USER_ID for an empty string', () => {
    expect(() => parseUserId('')).toThrow();
  });

  it('throws MISSING_USER_ID for a whitespace-only string', () => {
    expect(() => parseUserId('   ')).toThrow();
  });

  it('throws MISSING_USER_ID for null', () => {
    expect(() => parseUserId(null)).toThrow();
  });

  it('throws MISSING_USER_ID for undefined', () => {
    expect(() => parseUserId(undefined)).toThrow();
  });
});

// ─── parseRedeemBody ──────────────────────────────────────────────────────

describe('parseRedeemBody', () => {
  const validBody = {
    couponCode: 'SAVE10',
    orderId: 'order-001',
    orderTotal: 500,
  };

  it('returns parsed fields for a valid body', () => {
    const result = parseRedeemBody(validBody);
    expect(result.code).toBe('SAVE10');
    expect(result.orderId).toBe('order-001');
    expect(result.orderTotal).toBe(500);
  });

  it('normalizes couponCode to uppercase', () => {
    const result = parseRedeemBody({ ...validBody, couponCode: 'save10' });
    expect(result.code).toBe('SAVE10');
  });

  it('throws MISSING_REQUIRED_FIELD when couponCode is absent', () => {
    expect(() => parseRedeemBody({ orderId: 'order-001', orderTotal: 100 })).toThrow();
  });

  it('throws MISSING_REQUIRED_FIELD when orderId is absent', () => {
    expect(() => parseRedeemBody({ couponCode: 'SAVE10', orderTotal: 100 })).toThrow();
  });

  it('throws MISSING_REQUIRED_FIELD when orderTotal is absent', () => {
    expect(() => parseRedeemBody({ couponCode: 'SAVE10', orderId: 'order-001' })).toThrow();
  });

  it('throws INVALID_ORDER_TOTAL for orderTotal = 0', () => {
    expect(() => parseRedeemBody({ ...validBody, orderTotal: 0 })).toThrow();
  });

  it('throws INVALID_ORDER_TOTAL for negative orderTotal', () => {
    expect(() => parseRedeemBody({ ...validBody, orderTotal: -100 })).toThrow();
  });

  it('throws INVALID_ORDER_TOTAL for non-numeric orderTotal', () => {
    expect(() => parseRedeemBody({ ...validBody, orderTotal: 'free' })).toThrow();
  });
});

// ─── assertCouponRedeemable ───────────────────────────────────────────────

describe('assertCouponRedeemable', () => {
  const now = new Date('2025-06-01T12:00:00Z');

  const activeCoupon = {
    status: 'ACTIVE',
    validFrom: null,
    validUntil: null,
    maxRedemptions: null,
    redemptionCount: 0,
  };

  it('does not throw for a valid, unlimited, active coupon', () => {
    expect(() => assertCouponRedeemable(activeCoupon, now)).not.toThrow();
  });

  it('throws COUPON_INACTIVE when status is INACTIVE', () => {
    expect(() =>
      assertCouponRedeemable({ ...activeCoupon, status: 'INACTIVE' }, now),
    ).toThrow();
  });

  it('throws COUPON_NOT_YET_VALID when now is before validFrom', () => {
    const future = new Date('2025-07-01T00:00:00Z');
    expect(() =>
      assertCouponRedeemable({ ...activeCoupon, validFrom: future }, now),
    ).toThrow();
  });

  it('does not throw when now is exactly at or after validFrom', () => {
    const past = new Date('2025-05-01T00:00:00Z');
    expect(() =>
      assertCouponRedeemable({ ...activeCoupon, validFrom: past }, now),
    ).not.toThrow();
  });

  it('throws COUPON_EXPIRED when now is at or after validUntil', () => {
    const past = new Date('2025-05-01T00:00:00Z');
    expect(() =>
      assertCouponRedeemable({ ...activeCoupon, validUntil: past }, now),
    ).toThrow();
  });

  it('does not throw when now is strictly before validUntil', () => {
    const future = new Date('2025-12-31T00:00:00Z');
    expect(() =>
      assertCouponRedeemable({ ...activeCoupon, validUntil: future }, now),
    ).not.toThrow();
  });

  it('throws COUPON_EXHAUSTED when redemptionCount >= maxRedemptions', () => {
    expect(() =>
      assertCouponRedeemable({ ...activeCoupon, maxRedemptions: 5, redemptionCount: 5 }, now),
    ).toThrow();
  });

  it('does not throw when redemptionCount < maxRedemptions', () => {
    expect(() =>
      assertCouponRedeemable({ ...activeCoupon, maxRedemptions: 5, redemptionCount: 4 }, now),
    ).not.toThrow();
  });
});

// ─── buildAtomicCouponFilter ──────────────────────────────────────────────

describe('buildAtomicCouponFilter', () => {
  it('includes the code and ACTIVE status', () => {
    const filter = buildAtomicCouponFilter('SAVE10');
    expect(filter.code).toBe('SAVE10');
    expect(filter.status).toBe('ACTIVE');
  });

  it('includes $and with redemption and validity conditions', () => {
    const filter = buildAtomicCouponFilter('SAVE10');
    expect(filter.$and).toHaveLength(2);
  });
});

// ─── buildRedemptionInsertPayload ─────────────────────────────────────────

describe('buildRedemptionInsertPayload', () => {
  const coupon = {
    _id: new mongoose.Types.ObjectId(),
    discountType: 'PERCENTAGE',
    discountValue: 10,
  };

  it('builds a payload with all required fields', () => {
    const payload = buildRedemptionInsertPayload({
      coupon,
      code: 'SAVE10',
      userId: 'user-1',
      orderId: 'order-1',
      orderTotal: 100,
      discountAmount: 10,
    });

    expect(payload.couponId).toEqual(coupon._id);
    expect(payload.couponCode).toBe('SAVE10');
    expect(payload.userId).toBe('user-1');
    expect(payload.orderId).toBe('order-1');
    expect(payload.orderTotal).toBe(100);
    expect(payload.discountAmount).toBe(10);
    expect(payload.discountType).toBe('PERCENTAGE');
    expect(payload.discountValue).toBe(10);
    expect(payload.status).toBe('ACTIVE');
    expect(payload.revertedAt).toBeNull();
  });
});

// ─── formatRedemptionResponse ─────────────────────────────────────────────

describe('formatRedemptionResponse', () => {
  it('maps redemption document to response shape', () => {
    const mockRedemption = {
      toJSON: () => ({
        id: 'redemp-1',
        couponCode: 'SAVE10',
        orderId: 'order-1',
        discountType: 'FLAT',
        discountValue: 50,
        discountAmount: 50,
        orderTotal: 200,
        createdAt: new Date('2025-01-01'),
      }),
    };

    const response = formatRedemptionResponse(mockRedemption);
    expect(response.redemptionId).toBe('redemp-1');
    expect(response.couponCode).toBe('SAVE10');
    expect(response.orderId).toBe('order-1');
    expect(response.discountType).toBe('FLAT');
    expect(response.discountValue).toBe(50);
    expect(response.discountAmount).toBe(50);
    expect(response.orderTotal).toBe(200);
  });

  it('uses _id as fallback when id is absent', () => {
    const mockRedemption = {
      toJSON: () => ({
        _id: 'redemp-id-fallback',
        couponCode: 'X',
        orderId: 'o',
        discountType: 'FLAT',
        discountValue: 1,
        discountAmount: 1,
        orderTotal: 10,
        createdAt: new Date(),
      }),
    };

    const response = formatRedemptionResponse(mockRedemption);
    expect(response.redemptionId).toBe('redemp-id-fallback');
  });
});

// ─── formatRevertResponse ─────────────────────────────────────────────────

describe('formatRevertResponse', () => {
  it('returns redemptionId, REVERTED status, and revertedAt', () => {
    const revertedAt = new Date();
    const mockRedemption = {
      toJSON: () => ({ id: 'redemp-1', revertedAt }),
    };

    const response = formatRevertResponse(mockRedemption, 'fallback-id');
    expect(response.redemptionId).toBe('redemp-1');
    expect(response.status).toBe('REVERTED');
    expect(response.revertedAt).toBe(revertedAt);
  });
});

// ─── isDuplicateRedemptionError ───────────────────────────────────────────

describe('isDuplicateRedemptionError', () => {
  it('returns true for MongoDB 11000 error', () => {
    expect(isDuplicateRedemptionError({ code: 11000 })).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isDuplicateRedemptionError({ code: 500 })).toBe(false);
    expect(isDuplicateRedemptionError(null)).toBeFalsy();
    expect(isDuplicateRedemptionError(undefined)).toBeFalsy();
  });
});

// ─── parseRedemptionId ────────────────────────────────────────────────────

describe('parseRedemptionId', () => {
  it('returns an ObjectId for a valid 24-char hex id', () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const result = parseRedemptionId(validId);
    expect(result).toBeInstanceOf(mongoose.Types.ObjectId);
  });

  it('throws INVALID_REDEMPTION_ID for a non-hex string', () => {
    expect(() => parseRedemptionId('not-an-objectid')).toThrow();
  });

  it('throws INVALID_REDEMPTION_ID for null', () => {
    expect(() => parseRedemptionId(null)).toThrow();
  });

  it('throws INVALID_REDEMPTION_ID for undefined', () => {
    expect(() => parseRedemptionId(undefined)).toThrow();
  });
});
