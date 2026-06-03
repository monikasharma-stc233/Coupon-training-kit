export class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isAppError = true;
  }
}

// ─── 400 Bad Request ─────────────────────────────────────────────────────────

export const Errors = {
  MISSING_REQUIRED_FIELD: (field) =>
    new AppError(400, 'MISSING_REQUIRED_FIELD', `Missing required field: ${field}`),

  INVALID_CODE_FORMAT: () =>
    new AppError(400, 'INVALID_CODE_FORMAT', 'code must be 3–50 non-whitespace characters'),

  INVALID_DISCOUNT_TYPE: () =>
    new AppError(400, 'INVALID_DISCOUNT_TYPE', 'discountType must be PERCENTAGE or FLAT'),

  INVALID_DISCOUNT_VALUE: () =>
    new AppError(
      400,
      'INVALID_DISCOUNT_VALUE',
      'PERCENTAGE discountValue must be > 0 and < 100; FLAT discountValue must be > 0',
    ),

  INVALID_LIMIT: (field) =>
    new AppError(400, 'INVALID_LIMIT', `${field} must be an integer >= 1`),

  INVALID_DATE: (field) =>
    new AppError(400, 'INVALID_DATE', `${field} must be a valid UTC datetime`),

  INVALID_DATE_RANGE: () =>
    new AppError(400, 'INVALID_DATE_RANGE', 'validFrom must be strictly before validUntil'),

  NO_UPDATABLE_FIELDS: () =>
    new AppError(400, 'NO_UPDATABLE_FIELDS', 'Request body contains no recognised updatable fields'),

  FIELD_IMMUTABLE_AFTER_REDEMPTION: (fields) =>
    new AppError(
      400,
      'FIELD_IMMUTABLE_AFTER_REDEMPTION',
      `Cannot change [${fields.join(', ')}] after the first redemption`,
    ),

  INVALID_STATUS: () =>
    new AppError(400, 'INVALID_STATUS', 'status must be ACTIVE or INACTIVE'),

  LIMIT_BELOW_CURRENT_COUNT: () =>
    new AppError(
      400,
      'LIMIT_BELOW_CURRENT_COUNT',
      'maxRedemptions cannot be set below the current redemptionCount',
    ),

  MISSING_USER_ID: () =>
    new AppError(400, 'MISSING_USER_ID', 'x-user-id header is required'),

  INVALID_ORDER_TOTAL: () =>
    new AppError(400, 'INVALID_ORDER_TOTAL', 'orderTotal must be a number greater than 0'),

  INVALID_REDEMPTION_ID: () =>
    new AppError(400, 'INVALID_ID', 'Redemption id is not a valid ObjectId'),

  // ─── 404 Not Found ────────────────────────────────────────────────────────

  COUPON_NOT_FOUND: () =>
    new AppError(404, 'COUPON_NOT_FOUND', 'No coupon found with the given code'),

  REDEMPTION_NOT_FOUND: () =>
    new AppError(404, 'REDEMPTION_NOT_FOUND', 'No redemption found with the given id'),

  // ─── 409 Conflict ─────────────────────────────────────────────────────────

  COUPON_CODE_EXISTS: () =>
    new AppError(409, 'COUPON_CODE_EXISTS', 'A coupon with this code already exists'),

  ALREADY_REVERTED: () =>
    new AppError(409, 'ALREADY_REVERTED', 'This redemption has already been reverted'),

  VERSION_CONFLICT: () =>
    new AppError(409, 'VERSION_CONFLICT', 'Version conflict: coupon version mismatch'),

  // ─── 422 Unprocessable Entity ─────────────────────────────────────────────

  COUPON_INACTIVE: () =>
    new AppError(422, 'COUPON_INACTIVE', 'This coupon is inactive'),

  COUPON_NOT_YET_VALID: () =>
    new AppError(422, 'COUPON_NOT_YET_VALID', 'This coupon is not yet valid'),

  COUPON_EXPIRED: () =>
    new AppError(422, 'COUPON_EXPIRED', 'This coupon has expired'),

  COUPON_EXHAUSTED: () =>
    new AppError(422, 'COUPON_EXHAUSTED', 'This coupon has reached its redemption limit'),

  COUPON_LIMIT_REACHED_FOR_USER: () =>
    new AppError(422, 'COUPON_LIMIT_REACHED_FOR_USER', 'You have reached the per-user limit for this coupon'),

  ORDER_ALREADY_HAS_REDEMPTION: () =>
    new AppError(422, 'ORDER_ALREADY_HAS_REDEMPTION', 'This order already has an active coupon redemption'),

  // ─── 500 Internal Server Error ────────────────────────────────────────────

  INVALID_REDEMPTION_COUNT: () =>
    new AppError(
      500,
      'INVALID_REDEMPTION_COUNT',
      'Data integrity violation: coupon redemptionCount is already 0',
    ),
};
