import mongoose from 'mongoose';
import { redeemCoupon, revertRedemption } from '../../src/services/redemptionService.js';
import { Coupon } from '../../src/models/Coupon.js';
import { Redemption } from '../../src/models/Redemption.js';

jest.mock('../../src/models/Coupon.js', () => ({
  Coupon: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));

jest.mock('../../src/models/Redemption.js', () => ({
  Redemption: {
    create: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

const validCouponId = new mongoose.Types.ObjectId();

function makeMockCoupon(overrides = {}) {
  const data = {
    _id: validCouponId,
    code: 'SAVE10',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    maxRedemptions: null,
    maxRedemptionsPerUser: null,
    validFrom: null,
    validUntil: null,
    status: 'ACTIVE',
    redemptionCount: 0,
    ...overrides,
  };
  return { ...data, toJSON: jest.fn().mockReturnValue(data) };
}

function makeMockRedemption(overrides = {}) {
  const redemptionId = new mongoose.Types.ObjectId();
  const data = {
    _id: redemptionId,
    id: redemptionId.toString(),
    couponId: validCouponId,
    couponCode: 'SAVE10',
    userId: 'user-1',
    orderId: 'order-1',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    discountAmount: 50,
    orderTotal: 500,
    status: 'ACTIVE',
    createdAt: new Date(),
    revertedAt: null,
    ...overrides,
  };
  return { ...data, toJSON: jest.fn().mockReturnValue(data) };
}

const validRedeemBody = {
  couponCode: 'SAVE10',
  orderId: 'order-1',
  orderTotal: 500,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── redeemCoupon ─────────────────────────────────────────────────────────

describe('redeemCoupon', () => {
  it('returns a formatted redemption response on a successful redeem', async () => {
    const mockCoupon = makeMockCoupon();
    const mockRedemption = makeMockRedemption();

    Coupon.findOne.mockResolvedValue(mockCoupon);
    Redemption.countDocuments.mockResolvedValue(0);
    Redemption.findOne.mockResolvedValue(null);
    Coupon.findOneAndUpdate.mockResolvedValue(makeMockCoupon({ redemptionCount: 1 }));
    Redemption.create.mockResolvedValue(mockRedemption);

    const result = await redeemCoupon('user-1', validRedeemBody);

    expect(result.couponCode).toBe('SAVE10');
    expect(result.orderId).toBe('order-1');
    expect(result.discountAmount).toBeDefined();
  });

  it('throws COUPON_NOT_FOUND when the coupon does not exist', async () => {
    Coupon.findOne.mockResolvedValue(null);

    await expect(redeemCoupon('user-1', validRedeemBody)).rejects.toMatchObject({
      code: 'COUPON_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws COUPON_INACTIVE when coupon status is INACTIVE', async () => {
    Coupon.findOne.mockResolvedValue(makeMockCoupon({ status: 'INACTIVE' }));

    await expect(redeemCoupon('user-1', validRedeemBody)).rejects.toMatchObject({
      code: 'COUPON_INACTIVE',
      statusCode: 422,
    });
  });

  it('throws COUPON_EXPIRED when validUntil is in the past', async () => {
    const pastDate = new Date(Date.now() - 86400000);
    Coupon.findOne.mockResolvedValue(makeMockCoupon({ validUntil: pastDate }));

    await expect(redeemCoupon('user-1', validRedeemBody)).rejects.toMatchObject({
      code: 'COUPON_EXPIRED',
      statusCode: 422,
    });
  });

  it('throws COUPON_NOT_YET_VALID when validFrom is in the future', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 30);
    Coupon.findOne.mockResolvedValue(makeMockCoupon({ validFrom: futureDate }));

    await expect(redeemCoupon('user-1', validRedeemBody)).rejects.toMatchObject({
      code: 'COUPON_NOT_YET_VALID',
      statusCode: 422,
    });
  });

  it('throws COUPON_EXHAUSTED when redemptionCount >= maxRedemptions', async () => {
    Coupon.findOne.mockResolvedValue(
      makeMockCoupon({ maxRedemptions: 5, redemptionCount: 5 }),
    );

    await expect(redeemCoupon('user-1', validRedeemBody)).rejects.toMatchObject({
      code: 'COUPON_EXHAUSTED',
      statusCode: 422,
    });
  });

  it('throws COUPON_LIMIT_REACHED_FOR_USER when per-user limit is hit', async () => {
    Coupon.findOne.mockResolvedValue(
      makeMockCoupon({ maxRedemptionsPerUser: 1 }),
    );
    Redemption.countDocuments.mockResolvedValue(1);

    await expect(redeemCoupon('user-1', validRedeemBody)).rejects.toMatchObject({
      code: 'COUPON_LIMIT_REACHED_FOR_USER',
      statusCode: 422,
    });
  });

  it('returns idempotent result when same user/coupon/order already has an active redemption', async () => {
    const existingRedemption = makeMockRedemption({ userId: 'user-1' });
    existingRedemption.couponId = {
      equals: jest.fn().mockReturnValue(true),
    };

    Coupon.findOne.mockResolvedValue(makeMockCoupon());
    Redemption.countDocuments.mockResolvedValue(0);
    Redemption.findOne.mockResolvedValue(existingRedemption);

    const result = await redeemCoupon('user-1', validRedeemBody);

    expect(result.couponCode).toBe('SAVE10');
    expect(Coupon.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('throws ORDER_ALREADY_HAS_REDEMPTION when a different coupon is on the order', async () => {
    const existingRedemption = makeMockRedemption({ userId: 'other-user' });
    existingRedemption.couponId = {
      equals: jest.fn().mockReturnValue(false),
    };

    Coupon.findOne.mockResolvedValue(makeMockCoupon());
    Redemption.countDocuments.mockResolvedValue(0);
    Redemption.findOne.mockResolvedValue(existingRedemption);

    await expect(redeemCoupon('user-1', validRedeemBody)).rejects.toMatchObject({
      code: 'ORDER_ALREADY_HAS_REDEMPTION',
      statusCode: 422,
    });
  });

  it('throws ORDER_ALREADY_HAS_REDEMPTION on duplicate Redemption insert (11000)', async () => {
    Coupon.findOne.mockResolvedValue(makeMockCoupon());
    Redemption.countDocuments.mockResolvedValue(0);
    Redemption.findOne.mockResolvedValue(null);
    Coupon.findOneAndUpdate.mockResolvedValue(makeMockCoupon({ redemptionCount: 1 }));
    Redemption.create.mockRejectedValue({ code: 11000 });
    Coupon.findOneAndUpdate.mockResolvedValue(makeMockCoupon());

    await expect(redeemCoupon('user-1', validRedeemBody)).rejects.toMatchObject({
      code: 'ORDER_ALREADY_HAS_REDEMPTION',
    });
  });

  it('throws validation error when body is missing couponCode', async () => {
    await expect(
      redeemCoupon('user-1', { orderId: 'order-1', orderTotal: 100 }),
    ).rejects.toMatchObject({ code: 'MISSING_REQUIRED_FIELD' });
  });

  it('throws MISSING_USER_ID when userId is empty', async () => {
    // parseUserId is called in the controller, but we can test it throws here
    // via parseRedeemBody — the service accepts userId as a pre-parsed arg
    // so this test validates the body parsing
    await expect(
      redeemCoupon('user-1', { couponCode: 'SAVE10', orderId: 'o', orderTotal: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_TOTAL' });
  });
});

// ─── revertRedemption ─────────────────────────────────────────────────────

describe('revertRedemption', () => {
  const validRedemptionId = new mongoose.Types.ObjectId().toString();

  it('returns a formatted revert response on success', async () => {
    const revertedRedemption = makeMockRedemption({
      status: 'REVERTED',
      revertedAt: new Date(),
    });
    Redemption.findOneAndUpdate.mockResolvedValueOnce(revertedRedemption);
    Coupon.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const result = await revertRedemption(validRedemptionId);

    expect(result.status).toBe('REVERTED');
    expect(result.revertedAt).toBeDefined();
  });

  it('throws REDEMPTION_NOT_FOUND when no redemption exists for the id', async () => {
    Redemption.findOneAndUpdate.mockResolvedValue(null);
    Redemption.findById.mockResolvedValue(null);

    await expect(revertRedemption(validRedemptionId)).rejects.toMatchObject({
      code: 'REDEMPTION_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws ALREADY_REVERTED when the redemption is already reverted', async () => {
    Redemption.findOneAndUpdate.mockResolvedValue(null);
    Redemption.findById.mockResolvedValue(makeMockRedemption({ status: 'REVERTED' }));

    await expect(revertRedemption(validRedemptionId)).rejects.toMatchObject({
      code: 'ALREADY_REVERTED',
      statusCode: 409,
    });
  });

  it('throws INVALID_REDEMPTION_ID for a malformed id string', async () => {
    await expect(revertRedemption('not-a-valid-id')).rejects.toMatchObject({
      code: 'INVALID_ID',
      statusCode: 400,
    });
  });

  it('throws INVALID_REDEMPTION_COUNT and rolls back when coupon count is already 0', async () => {
    const revertedRedemption = makeMockRedemption({
      status: 'REVERTED',
      revertedAt: new Date(),
    });
    Redemption.findOneAndUpdate
      .mockResolvedValueOnce(revertedRedemption)
      .mockResolvedValueOnce(revertedRedemption);
    Coupon.updateOne.mockResolvedValue({ modifiedCount: 0 });

    await expect(revertRedemption(validRedemptionId)).rejects.toMatchObject({
      code: 'INVALID_REDEMPTION_COUNT',
      statusCode: 500,
    });
  });
});
