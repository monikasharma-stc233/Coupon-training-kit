import {
  normalizeCouponCode,
  parsePositiveLimit,
  isValidDate,
  parseValidityDates,
  validateDiscountTypeAndValue,
  buildCreateCouponPayload,
  isDuplicateCouponCodeError,
  getRecognisedPatchFields,
  buildPatchCouponUpdate,
  CODE_REGEX,
  IMMUTABLE_AFTER_REDEMPTION,
} from '../../src/utils/couponHelpers.js';

// ─── normalizeCouponCode ───────────────────────────────────────────────────

describe('normalizeCouponCode', () => {
  it('converts to uppercase', () => {
    expect(normalizeCouponCode('holi10')).toBe('HOLI10');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeCouponCode('  SAVE20  ')).toBe('SAVE20');
  });

  it('handles mixed case with spaces', () => {
    expect(normalizeCouponCode('  summer Sale  ')).toBe('SUMMER SALE');
  });
});

// ─── parsePositiveLimit ────────────────────────────────────────────────────

describe('parsePositiveLimit', () => {
  it('returns null for undefined', () => {
    expect(parsePositiveLimit(undefined, 'maxRedemptions')).toBeNull();
  });

  it('returns null for null', () => {
    expect(parsePositiveLimit(null, 'maxRedemptions')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parsePositiveLimit('', 'maxRedemptions')).toBeNull();
  });

  it('returns numeric value for a valid positive integer', () => {
    expect(parsePositiveLimit(10, 'maxRedemptions')).toBe(10);
  });

  it('parses a numeric string', () => {
    expect(parsePositiveLimit('5', 'maxRedemptions')).toBe(5);
  });

  it('throws INVALID_LIMIT for zero', () => {
    expect(() => parsePositiveLimit(0, 'maxRedemptions')).toThrow();
  });

  it('throws INVALID_LIMIT for negative numbers', () => {
    expect(() => parsePositiveLimit(-1, 'maxRedemptions')).toThrow();
  });

  it('throws INVALID_LIMIT for non-numeric strings', () => {
    expect(() => parsePositiveLimit('abc', 'maxRedemptions')).toThrow();
  });
});

// ─── isValidDate ──────────────────────────────────────────────────────────

describe('isValidDate', () => {
  it('returns true for a valid ISO date string', () => {
    expect(isValidDate('2025-01-01T00:00:00.000Z')).toBe(true);
  });

  it('returns true for a Date object', () => {
    expect(isValidDate(new Date())).toBe(true);
  });

  it('returns false for an invalid date string', () => {
    expect(isValidDate('not-a-date')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidDate('')).toBe(false);
  });
});

// ─── parseValidityDates ───────────────────────────────────────────────────

describe('parseValidityDates', () => {
  const futureDate = new Date(Date.now() + 86400000 * 2).toISOString();
  const farFutureDate = new Date(Date.now() + 86400000 * 10).toISOString();

  it('returns null for both when both are undefined', () => {
    const result = parseValidityDates(undefined, undefined);
    expect(result.validFrom).toBeNull();
    expect(result.validUntil).toBeNull();
  });

  it('parses validFrom when provided', () => {
    const result = parseValidityDates(futureDate, undefined);
    expect(result.validFrom).toBeInstanceOf(Date);
    expect(result.validUntil).toBeNull();
  });

  it('parses validUntil when provided', () => {
    const result = parseValidityDates(undefined, farFutureDate);
    expect(result.validFrom).toBeNull();
    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('parses both when validFrom is strictly before validUntil', () => {
    const result = parseValidityDates(futureDate, farFutureDate);
    expect(result.validFrom).toBeInstanceOf(Date);
    expect(result.validUntil).toBeInstanceOf(Date);
    expect(result.validFrom < result.validUntil).toBe(true);
  });

  it('throws INVALID_DATE_RANGE when validFrom >= validUntil', () => {
    expect(() => parseValidityDates(farFutureDate, futureDate)).toThrow();
  });

  it('throws INVALID_DATE when validFrom is not a valid date', () => {
    expect(() => parseValidityDates('bad-date', undefined)).toThrow();
  });

  it('throws INVALID_DATE when validUntil is not a valid date', () => {
    expect(() => parseValidityDates(undefined, 'bad-date')).toThrow();
  });
});

// ─── validateDiscountTypeAndValue ─────────────────────────────────────────

describe('validateDiscountTypeAndValue', () => {
  it('accepts PERCENTAGE with value between 0 and 100 exclusive', () => {
    const result = validateDiscountTypeAndValue('PERCENTAGE', 10);
    expect(result.discountType).toBe('PERCENTAGE');
    expect(result.discountValue).toBe(10);
  });

  it('normalizes lowercase percentage to uppercase', () => {
    const result = validateDiscountTypeAndValue('percentage', 50);
    expect(result.discountType).toBe('PERCENTAGE');
  });

  it('accepts FLAT with positive value', () => {
    const result = validateDiscountTypeAndValue('FLAT', 100);
    expect(result.discountType).toBe('FLAT');
    expect(result.discountValue).toBe(100);
  });

  it('throws INVALID_DISCOUNT_TYPE for unknown type', () => {
    expect(() => validateDiscountTypeAndValue('UNKNOWN', 10)).toThrow();
  });

  it('throws INVALID_DISCOUNT_VALUE for PERCENTAGE = 0', () => {
    expect(() => validateDiscountTypeAndValue('PERCENTAGE', 0)).toThrow();
  });

  it('throws INVALID_DISCOUNT_VALUE for PERCENTAGE = 100', () => {
    expect(() => validateDiscountTypeAndValue('PERCENTAGE', 100)).toThrow();
  });

  it('throws INVALID_DISCOUNT_VALUE for PERCENTAGE > 100', () => {
    expect(() => validateDiscountTypeAndValue('PERCENTAGE', 150)).toThrow();
  });

  it('throws INVALID_DISCOUNT_VALUE for FLAT <= 0', () => {
    expect(() => validateDiscountTypeAndValue('FLAT', 0)).toThrow();
    expect(() => validateDiscountTypeAndValue('FLAT', -5)).toThrow();
  });

  it('throws INVALID_DISCOUNT_VALUE for non-numeric discountValue', () => {
    expect(() => validateDiscountTypeAndValue('FLAT', 'abc')).toThrow();
  });
});

// ─── buildCreateCouponPayload ──────────────────────────────────────────────

describe('buildCreateCouponPayload', () => {
  const validBody = {
    code: 'SAVE10',
    discountType: 'PERCENTAGE',
    discountValue: 10,
  };

  it('returns a complete payload for a valid body', () => {
    const payload = buildCreateCouponPayload(validBody);
    expect(payload.code).toBe('SAVE10');
    expect(payload.discountType).toBe('PERCENTAGE');
    expect(payload.discountValue).toBe(10);
    expect(payload.status).toBe('ACTIVE');
    expect(payload.redemptionCount).toBe(0);
    expect(payload.createdAt).toBeInstanceOf(Date);
    expect(payload.updatedAt).toBeInstanceOf(Date);
  });

  it('normalizes coupon code to uppercase', () => {
    const payload = buildCreateCouponPayload({ ...validBody, code: 'save10' });
    expect(payload.code).toBe('SAVE10');
  });

  it('throws MISSING_REQUIRED_FIELD when code is absent', () => {
    expect(() => buildCreateCouponPayload({ discountType: 'FLAT', discountValue: 50 })).toThrow();
  });

  it('throws MISSING_REQUIRED_FIELD when discountType is absent', () => {
    expect(() => buildCreateCouponPayload({ code: 'TEST', discountValue: 50 })).toThrow();
  });

  it('throws MISSING_REQUIRED_FIELD when discountValue is absent', () => {
    expect(() => buildCreateCouponPayload({ code: 'TEST', discountType: 'FLAT' })).toThrow();
  });

  it('throws INVALID_CODE_FORMAT for code shorter than 3 chars', () => {
    expect(() => buildCreateCouponPayload({ ...validBody, code: 'AB' })).toThrow();
  });

  it('throws INVALID_CODE_FORMAT for code with whitespace', () => {
    expect(() => buildCreateCouponPayload({ ...validBody, code: 'AB CD' })).toThrow();
  });

  it('includes maxRedemptions and maxRedemptionsPerUser when provided', () => {
    const payload = buildCreateCouponPayload({
      ...validBody,
      maxRedemptions: 100,
      maxRedemptionsPerUser: 2,
    });
    expect(payload.maxRedemptions).toBe(100);
    expect(payload.maxRedemptionsPerUser).toBe(2);
  });

  it('sets maxRedemptions to null when not provided', () => {
    const payload = buildCreateCouponPayload(validBody);
    expect(payload.maxRedemptions).toBeNull();
  });
});

// ─── isDuplicateCouponCodeError ────────────────────────────────────────────

describe('isDuplicateCouponCodeError', () => {
  it('returns true for a MongoDB 11000 error with code key pattern', () => {
    const err = { code: 11000, keyPattern: { code: 1 } };
    expect(isDuplicateCouponCodeError(err)).toBe(true);
  });

  it('returns false for 11000 error without code key pattern', () => {
    const err = { code: 11000, keyPattern: { userId: 1 } };
    expect(isDuplicateCouponCodeError(err)).toBe(false);
  });

  it('returns false for non-duplicate errors', () => {
    const err = { code: 500 };
    expect(isDuplicateCouponCodeError(err)).toBeFalsy();
  });
});

// ─── getRecognisedPatchFields ──────────────────────────────────────────────

describe('getRecognisedPatchFields', () => {
  it('returns only recognised field names from the body', () => {
    const fields = getRecognisedPatchFields({ status: 'INACTIVE', unknownField: 'x' });
    expect(fields).toContain('status');
    expect(fields).not.toContain('unknownField');
  });

  it('returns an empty array when no recognised fields are present', () => {
    expect(getRecognisedPatchFields({ foo: 'bar' })).toHaveLength(0);
  });
});

// ─── buildPatchCouponUpdate ────────────────────────────────────────────────

describe('buildPatchCouponUpdate', () => {
  const baseCoupon = {
    code: 'SAVE10',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    validFrom: null,
    validUntil: null,
    maxRedemptions: null,
    maxRedemptionsPerUser: null,
    status: 'ACTIVE',
    redemptionCount: 0,
  };

  it('throws NO_UPDATABLE_FIELDS when body has no recognised fields', () => {
    expect(() => buildPatchCouponUpdate(baseCoupon, { foo: 'bar' })).toThrow();
  });

  it('throws FIELD_IMMUTABLE_AFTER_REDEMPTION when changing code after redemptions', () => {
    const usedCoupon = { ...baseCoupon, redemptionCount: 1 };
    expect(() => buildPatchCouponUpdate(usedCoupon, { code: 'NEWCODE' })).toThrow();
  });

  it('allows changing status when no redemptions have occurred', () => {
    const update = buildPatchCouponUpdate(baseCoupon, { status: 'INACTIVE' });
    expect(update.status).toBe('INACTIVE');
  });

  it('throws INVALID_STATUS for an unknown status value', () => {
    expect(() => buildPatchCouponUpdate(baseCoupon, { status: 'SUSPENDED' })).toThrow();
  });

  it('allows setting a future validUntil date', () => {
    const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString();
    const update = buildPatchCouponUpdate(baseCoupon, { validUntil: tomorrow });
    expect(update.validUntil).toBeInstanceOf(Date);
  });

  it('throws INVALID_DATE for a past validUntil', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    expect(() => buildPatchCouponUpdate(baseCoupon, { validUntil: yesterday })).toThrow();
  });

  it('allows setting maxRedemptions above current redemptionCount', () => {
    const coupon = { ...baseCoupon, redemptionCount: 3 };
    const update = buildPatchCouponUpdate(coupon, { maxRedemptions: 10 });
    expect(update.maxRedemptions).toBe(10);
  });

  it('throws LIMIT_BELOW_CURRENT_COUNT when maxRedemptions < redemptionCount', () => {
    const coupon = { ...baseCoupon, redemptionCount: 5 };
    expect(() => buildPatchCouponUpdate(coupon, { maxRedemptions: 3 })).toThrow();
  });

  it('allows updating discountValue when no redemptions', () => {
    const update = buildPatchCouponUpdate(baseCoupon, { discountValue: 20 });
    expect(update.discountValue).toBe(20);
  });

  it('throws INVALID_DISCOUNT_VALUE when new PERCENTAGE value is out of range', () => {
    expect(() => buildPatchCouponUpdate(baseCoupon, { discountValue: 100 })).toThrow();
  });

  it('allows setting validFrom to null', () => {
    const update = buildPatchCouponUpdate(baseCoupon, { validFrom: null });
    expect(update.validFrom).toBeNull();
  });

  it('IMMUTABLE_AFTER_REDEMPTION contains expected fields', () => {
    expect(IMMUTABLE_AFTER_REDEMPTION).toEqual(
      expect.arrayContaining(['code', 'discountType', 'discountValue', 'validFrom']),
    );
  });
});
