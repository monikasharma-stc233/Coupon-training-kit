import { createCoupon, getCouponByCode, updateCoupon } from '../../src/services/couponService.js';
import { Coupon } from '../../src/models/Coupon.js';

jest.mock('../../src/models/Coupon.js', () => ({
  Coupon: {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

function makeMockCoupon(overrides = {}) {
  const data = {
    _id: 'coupon-id-1',
    code: 'SAVE10',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    maxRedemptions: null,
    maxRedemptionsPerUser: null,
    validFrom: null,
    validUntil: null,
    status: 'ACTIVE',
    redemptionCount: 0,
    __v: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  return { ...data, toJSON: jest.fn().mockReturnValue(data) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── createCoupon ─────────────────────────────────────────────────────────

describe('createCoupon', () => {
  const validBody = {
    code: 'SAVE10',
    discountType: 'PERCENTAGE',
    discountValue: 10,
  };

  it('calls Coupon.create with the built payload and returns toJSON result', async () => {
    const mockCoupon = makeMockCoupon();
    Coupon.create.mockResolvedValue(mockCoupon);

    const result = await createCoupon(validBody);

    expect(Coupon.create).toHaveBeenCalledTimes(1);
    expect(result.code).toBe('SAVE10');
    expect(result.discountType).toBe('PERCENTAGE');
  });

  it('normalizes the coupon code to uppercase before saving', async () => {
    const mockCoupon = makeMockCoupon({ code: 'SAVE10' });
    Coupon.create.mockResolvedValue(mockCoupon);

    await createCoupon({ ...validBody, code: 'save10' });

    const callArg = Coupon.create.mock.calls[0][0];
    expect(callArg.code).toBe('SAVE10');
  });

  it('throws COUPON_CODE_EXISTS for a MongoDB 11000 duplicate code error', async () => {
    const dupError = { code: 11000, keyPattern: { code: 1 } };
    Coupon.create.mockRejectedValue(dupError);

    await expect(createCoupon(validBody)).rejects.toMatchObject({
      code: 'COUPON_CODE_EXISTS',
      statusCode: 409,
    });
  });

  it('re-throws unknown database errors', async () => {
    const dbError = new Error('DB is down');
    Coupon.create.mockRejectedValue(dbError);

    await expect(createCoupon(validBody)).rejects.toThrow('DB is down');
  });

  it('throws validation errors from buildCreateCouponPayload before hitting DB', async () => {
    await expect(createCoupon({ discountType: 'FLAT', discountValue: 50 })).rejects.toMatchObject({
      code: 'MISSING_REQUIRED_FIELD',
    });
    expect(Coupon.create).not.toHaveBeenCalled();
  });
});

// ─── getCouponByCode ──────────────────────────────────────────────────────

describe('getCouponByCode', () => {
  it('returns the coupon JSON when found', async () => {
    const mockCoupon = makeMockCoupon();
    Coupon.findOne.mockResolvedValue(mockCoupon);

    const result = await getCouponByCode('SAVE10');

    expect(Coupon.findOne).toHaveBeenCalledWith({ code: 'SAVE10' });
    expect(result.code).toBe('SAVE10');
  });

  it('normalizes the code to uppercase before querying', async () => {
    const mockCoupon = makeMockCoupon();
    Coupon.findOne.mockResolvedValue(mockCoupon);

    await getCouponByCode('save10');

    expect(Coupon.findOne).toHaveBeenCalledWith({ code: 'SAVE10' });
  });

  it('throws COUPON_NOT_FOUND when no document is returned', async () => {
    Coupon.findOne.mockResolvedValue(null);

    await expect(getCouponByCode('UNKNOWN')).rejects.toMatchObject({
      code: 'COUPON_NOT_FOUND',
      statusCode: 404,
    });
  });
});

// ─── updateCoupon ─────────────────────────────────────────────────────────

describe('updateCoupon', () => {
  it('throws COUPON_NOT_FOUND when the coupon does not exist', async () => {
    Coupon.findOne.mockResolvedValue(null);

    await expect(updateCoupon('NONEXISTENT', { status: 'INACTIVE' })).rejects.toMatchObject({
      code: 'COUPON_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('returns the updated coupon on success', async () => {
    const existingCoupon = makeMockCoupon();
    const updatedCoupon = makeMockCoupon({ status: 'INACTIVE' });

    Coupon.findOne.mockResolvedValue(existingCoupon);
    Coupon.findOneAndUpdate.mockResolvedValue(updatedCoupon);

    const result = await updateCoupon('SAVE10', { status: 'INACTIVE', __v: 0 });

    expect(result.status).toBe('INACTIVE');
  });

  it('throws VERSION_CONFLICT when findOneAndUpdate returns null', async () => {
    const existingCoupon = makeMockCoupon();
    Coupon.findOne.mockResolvedValue(existingCoupon);
    Coupon.findOneAndUpdate.mockResolvedValue(null);

    await expect(updateCoupon('SAVE10', { status: 'INACTIVE', __v: 99 })).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      statusCode: 409,
    });
  });

  it('throws COUPON_CODE_EXISTS on duplicate code during rename', async () => {
    const existingCoupon = makeMockCoupon();
    const dupError = { code: 11000, keyPattern: { code: 1 } };

    Coupon.findOne.mockResolvedValue(existingCoupon);
    Coupon.findOneAndUpdate.mockRejectedValue(dupError);

    await expect(
      updateCoupon('SAVE10', { code: 'EXISTING_CODE', __v: 0 }),
    ).rejects.toMatchObject({
      code: 'COUPON_CODE_EXISTS',
      statusCode: 409,
    });
  });

  it('throws NO_UPDATABLE_FIELDS when body has no recognised patch fields', async () => {
    const existingCoupon = makeMockCoupon();
    Coupon.findOne.mockResolvedValue(existingCoupon);

    await expect(updateCoupon('SAVE10', { unknownField: 'x' })).rejects.toMatchObject({
      code: 'NO_UPDATABLE_FIELDS',
    });
  });

  it('throws FIELD_IMMUTABLE_AFTER_REDEMPTION when changing code after redemptions', async () => {
    const usedCoupon = makeMockCoupon({ redemptionCount: 1 });
    Coupon.findOne.mockResolvedValue(usedCoupon);

    await expect(
      updateCoupon('SAVE10', { code: 'NEWCODE', __v: 0 }),
    ).rejects.toMatchObject({
      code: 'FIELD_IMMUTABLE_AFTER_REDEMPTION',
    });
  });
});
