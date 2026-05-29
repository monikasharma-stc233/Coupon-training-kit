import { AppError, Errors } from '../../src/utils/errors.js';

describe('AppError', () => {
  it('extends Error', () => {
    const err = new AppError(404, 'NOT_FOUND', 'Resource not found');
    expect(err).toBeInstanceOf(Error);
  });

  it('sets statusCode, code, message and isAppError flag', () => {
    const err = new AppError(400, 'BAD_REQUEST', 'Something is wrong');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('Something is wrong');
    expect(err.isAppError).toBe(true);
  });

  it('stores the message accessible via .message', () => {
    const err = new AppError(500, 'INTERNAL', 'Unexpected failure');
    expect(err.message).toBe('Unexpected failure');
  });
});

describe('Errors factory functions', () => {
  describe('400 Bad Request errors', () => {
    it('MISSING_REQUIRED_FIELD includes the field name', () => {
      const err = Errors.MISSING_REQUIRED_FIELD('code');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('MISSING_REQUIRED_FIELD');
      expect(err.message).toContain('code');
    });

    it('INVALID_CODE_FORMAT returns 400', () => {
      const err = Errors.INVALID_CODE_FORMAT();
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_CODE_FORMAT');
    });

    it('INVALID_DISCOUNT_TYPE returns 400', () => {
      const err = Errors.INVALID_DISCOUNT_TYPE();
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_DISCOUNT_TYPE');
    });

    it('INVALID_DISCOUNT_VALUE returns 400', () => {
      const err = Errors.INVALID_DISCOUNT_VALUE();
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_DISCOUNT_VALUE');
    });

    it('INVALID_LIMIT includes the field name', () => {
      const err = Errors.INVALID_LIMIT('maxRedemptions');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_LIMIT');
      expect(err.message).toContain('maxRedemptions');
    });

    it('INVALID_DATE includes the field name', () => {
      const err = Errors.INVALID_DATE('validFrom');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_DATE');
      expect(err.message).toContain('validFrom');
    });

    it('INVALID_DATE_RANGE returns 400', () => {
      const err = Errors.INVALID_DATE_RANGE();
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_DATE_RANGE');
    });

    it('NO_UPDATABLE_FIELDS returns 400', () => {
      const err = Errors.NO_UPDATABLE_FIELDS();
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('NO_UPDATABLE_FIELDS');
    });

    it('FIELD_IMMUTABLE_AFTER_REDEMPTION includes field names', () => {
      const err = Errors.FIELD_IMMUTABLE_AFTER_REDEMPTION(['code', 'discountType']);
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('FIELD_IMMUTABLE_AFTER_REDEMPTION');
      expect(err.message).toContain('code');
      expect(err.message).toContain('discountType');
    });

    it('INVALID_STATUS returns 400', () => {
      const err = Errors.INVALID_STATUS();
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_STATUS');
    });

    it('LIMIT_BELOW_CURRENT_COUNT returns 400', () => {
      const err = Errors.LIMIT_BELOW_CURRENT_COUNT();
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('LIMIT_BELOW_CURRENT_COUNT');
    });

    it('MISSING_USER_ID returns 400', () => {
      const err = Errors.MISSING_USER_ID();
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('MISSING_USER_ID');
    });

    it('INVALID_ORDER_TOTAL returns 400', () => {
      const err = Errors.INVALID_ORDER_TOTAL();
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_ORDER_TOTAL');
    });

    it('INVALID_REDEMPTION_ID returns 400 with code INVALID_ID', () => {
      const err = Errors.INVALID_REDEMPTION_ID();
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('INVALID_ID');
    });
  });

  describe('404 Not Found errors', () => {
    it('COUPON_NOT_FOUND returns 404', () => {
      const err = Errors.COUPON_NOT_FOUND();
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('COUPON_NOT_FOUND');
    });

    it('REDEMPTION_NOT_FOUND returns 404', () => {
      const err = Errors.REDEMPTION_NOT_FOUND();
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('REDEMPTION_NOT_FOUND');
    });
  });

  describe('409 Conflict errors', () => {
    it('COUPON_CODE_EXISTS returns 409', () => {
      const err = Errors.COUPON_CODE_EXISTS();
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('COUPON_CODE_EXISTS');
    });

    it('ALREADY_REVERTED returns 409', () => {
      const err = Errors.ALREADY_REVERTED();
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('ALREADY_REVERTED');
    });

    it('VERSION_CONFLICT returns 409', () => {
      const err = Errors.VERSION_CONFLICT();
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('VERSION_CONFLICT');
    });
  });

  describe('422 Unprocessable Entity errors', () => {
    it('COUPON_INACTIVE returns 422', () => {
      const err = Errors.COUPON_INACTIVE();
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('COUPON_INACTIVE');
    });

    it('COUPON_NOT_YET_VALID returns 422', () => {
      const err = Errors.COUPON_NOT_YET_VALID();
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('COUPON_NOT_YET_VALID');
    });

    it('COUPON_EXPIRED returns 422', () => {
      const err = Errors.COUPON_EXPIRED();
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('COUPON_EXPIRED');
    });

    it('COUPON_EXHAUSTED returns 422', () => {
      const err = Errors.COUPON_EXHAUSTED();
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('COUPON_EXHAUSTED');
    });

    it('COUPON_LIMIT_REACHED_FOR_USER returns 422', () => {
      const err = Errors.COUPON_LIMIT_REACHED_FOR_USER();
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('COUPON_LIMIT_REACHED_FOR_USER');
    });

    it('ORDER_ALREADY_HAS_REDEMPTION returns 422', () => {
      const err = Errors.ORDER_ALREADY_HAS_REDEMPTION();
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('ORDER_ALREADY_HAS_REDEMPTION');
    });
  });

  describe('500 Internal Server Error', () => {
    it('INVALID_REDEMPTION_COUNT returns 500', () => {
      const err = Errors.INVALID_REDEMPTION_COUNT();
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('INVALID_REDEMPTION_COUNT');
    });
  });

  it('all Errors return instances with isAppError = true', () => {
    const factories = [
      () => Errors.MISSING_REQUIRED_FIELD('x'),
      Errors.INVALID_CODE_FORMAT,
      Errors.INVALID_DISCOUNT_TYPE,
      Errors.INVALID_DISCOUNT_VALUE,
      () => Errors.INVALID_LIMIT('x'),
      () => Errors.INVALID_DATE('x'),
      Errors.INVALID_DATE_RANGE,
      Errors.NO_UPDATABLE_FIELDS,
      () => Errors.FIELD_IMMUTABLE_AFTER_REDEMPTION(['x']),
      Errors.INVALID_STATUS,
      Errors.LIMIT_BELOW_CURRENT_COUNT,
      Errors.MISSING_USER_ID,
      Errors.INVALID_ORDER_TOTAL,
      Errors.INVALID_REDEMPTION_ID,
      Errors.COUPON_NOT_FOUND,
      Errors.REDEMPTION_NOT_FOUND,
      Errors.COUPON_CODE_EXISTS,
      Errors.ALREADY_REVERTED,
      Errors.VERSION_CONFLICT,
      Errors.COUPON_INACTIVE,
      Errors.COUPON_NOT_YET_VALID,
      Errors.COUPON_EXPIRED,
      Errors.COUPON_EXHAUSTED,
      Errors.COUPON_LIMIT_REACHED_FOR_USER,
      Errors.ORDER_ALREADY_HAS_REDEMPTION,
      Errors.INVALID_REDEMPTION_COUNT,
    ];

    factories.forEach((fn) => {
      const err = fn();
      expect(err.isAppError).toBe(true);
      expect(err).toBeInstanceOf(AppError);
    });
  });
});
