import { Errors } from './errors.js';

export const CODE_REGEX = /^[^\s]{3,50}$/;
export const VALID_DISCOUNT_TYPES = ['PERCENTAGE', 'FLAT'];
export const VALID_STATUSES = ['ACTIVE', 'INACTIVE'];

export function normalizeCouponCode(code) {
  return String(code).trim().toUpperCase();
}

export function parsePositiveLimit(val, field) {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  if (isNaN(num) || num <= 0) {
    throw Errors.INVALID_LIMIT(field);
  }
  return num;
}

export function isValidDate(d) {
  return !isNaN(new Date(d).getTime());
}

export function parseValidityDates(validFrom, validUntil) {
  let from = null;
  let until = null;

  if (validFrom !== undefined && validFrom !== null) {
    if (!isValidDate(validFrom)) throw Errors.INVALID_DATE('validFrom');
    from = new Date(validFrom);
  }

  if (validUntil !== undefined && validUntil !== null) {
    if (!isValidDate(validUntil)) throw Errors.INVALID_DATE('validUntil');
    until = new Date(validUntil);
  }

  if (from && until && from >= until) {
    throw Errors.INVALID_DATE_RANGE();
  }

  return { validFrom: from, validUntil: until };
}

export function validateDiscountTypeAndValue(discountType, discountValue) {
  const type = String(discountType).trim().toUpperCase();
  const value = Number(discountValue);

  if (!VALID_DISCOUNT_TYPES.includes(type)) {
    throw Errors.INVALID_DISCOUNT_TYPE();
  }

  if (isNaN(value)) {
    throw Errors.INVALID_DISCOUNT_VALUE();
  }

  if (type === 'PERCENTAGE' && (value <= 0 || value >= 100)) {
    throw Errors.INVALID_DISCOUNT_VALUE();
  }

  if (type === 'FLAT' && value <= 0) {
    throw Errors.INVALID_DISCOUNT_VALUE();
  }

  return { discountType: type, discountValue: value };
}

export function buildCreateCouponPayload(body) {
  const {
    code,
    discountType,
    discountValue,
    maxRedemptions,
    maxRedemptionsPerUser,
    validFrom,
    validUntil,
  } = body;

  if (!code) throw Errors.MISSING_REQUIRED_FIELD('code');
  if (!discountType) throw Errors.MISSING_REQUIRED_FIELD('discountType');
  if (discountValue === undefined || discountValue === null) {
    throw Errors.MISSING_REQUIRED_FIELD('discountValue');
  }

  const normalizedCode = normalizeCouponCode(code);

  if (!CODE_REGEX.test(normalizedCode)) {
    throw Errors.INVALID_CODE_FORMAT();
  }

  const { discountType: type, discountValue: value } = validateDiscountTypeAndValue(
    discountType,
    discountValue,
  );

  const maxR = parsePositiveLimit(maxRedemptions, 'maxRedemptions');
  const maxRPU = parsePositiveLimit(maxRedemptionsPerUser, 'maxRedemptionsPerUser');
  const { validFrom: from, validUntil: until } = parseValidityDates(validFrom, validUntil);

  const now = new Date();

  return {
    code: normalizedCode,
    discountType: type,
    discountValue: value,
    maxRedemptions: maxR,
    maxRedemptionsPerUser: maxRPU,
    validFrom: from,
    validUntil: until,
    status: 'ACTIVE',
    redemptionCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function isDuplicateCouponCodeError(err) {
  return Boolean(
    err.code === 11000 &&
    err.keyPattern?.code
  );
}

// PATCH /coupons/:code ────────────────────────────────────────────────────

export const IMMUTABLE_AFTER_REDEMPTION = ['code', 'discountType', 'discountValue', 'validFrom'];

export const RECOGNISED_PATCH_FIELDS = [
  ...IMMUTABLE_AFTER_REDEMPTION,
  'status',
  'validUntil',
  'maxRedemptions',
  'maxRedemptionsPerUser',
];

export function getRecognisedPatchFields(body) {
  return Object.keys(body).filter((k) => RECOGNISED_PATCH_FIELDS.includes(k));
}

export function buildPatchCouponUpdate(existingCoupon, body) {
  const providedFields = getRecognisedPatchFields(body);
  if (providedFields.length === 0) {
    throw Errors.NO_UPDATABLE_FIELDS();
  }

  if (existingCoupon.redemptionCount > 0) {
    const lockedFields = providedFields.filter((f) => IMMUTABLE_AFTER_REDEMPTION.includes(f));
    if (lockedFields.length > 0) {
      throw Errors.FIELD_IMMUTABLE_AFTER_REDEMPTION(lockedFields);
    }
  }

  const update = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      throw Errors.INVALID_STATUS();
    }
    update.status = body.status;
  }

  if (body.validUntil !== undefined) {
    if (!isValidDate(body.validUntil)) {
      throw Errors.INVALID_DATE('validUntil');
    }
    const parsed = new Date(body.validUntil);
    if (parsed <= new Date()) {
      throw Errors.INVALID_DATE('validUntil');
    }
    update.validUntil = parsed;
  }

  if (body.maxRedemptions !== undefined) {
    const n = parsePositiveLimit(body.maxRedemptions, 'maxRedemptions');
    if (n !== null && n < existingCoupon.redemptionCount) {
      throw Errors.LIMIT_BELOW_CURRENT_COUNT();
    }
    update.maxRedemptions = n;
  }

  if (body.maxRedemptionsPerUser !== undefined) {
    update.maxRedemptionsPerUser = parsePositiveLimit(
      body.maxRedemptionsPerUser,
      'maxRedemptionsPerUser',
    );
  }

  if (body.code !== undefined) {
    const newCode = normalizeCouponCode(body.code);
    if (!CODE_REGEX.test(newCode)) {
      throw Errors.INVALID_CODE_FORMAT();
    }
    update.code = newCode;
  }

  if (body.discountType !== undefined) {
    const dt = String(body.discountType).trim().toUpperCase();
    if (!VALID_DISCOUNT_TYPES.includes(dt)) {
      throw Errors.INVALID_DISCOUNT_TYPE();
    }
    update.discountType = dt;
  }

  if (body.discountValue !== undefined) {
    const dv = Number(body.discountValue);
    const typeToCheck = update.discountType ?? existingCoupon.discountType;
    if (isNaN(dv)) {
      throw Errors.INVALID_DISCOUNT_VALUE();
    }
    if (typeToCheck === 'PERCENTAGE' && (dv <= 0 || dv >= 100)) {
      throw Errors.INVALID_DISCOUNT_VALUE();
    }
    if (typeToCheck === 'FLAT' && dv <= 0) {
      throw Errors.INVALID_DISCOUNT_VALUE();
    }
    update.discountValue = dv;
  }

  if (body.validFrom !== undefined) {
    if (body.validFrom === null) {
      update.validFrom = null;
    } else {
      if (!isValidDate(body.validFrom)) {
        throw Errors.INVALID_DATE('validFrom');
      }
      update.validFrom = new Date(body.validFrom);
    }
  }

  return update;
}
