import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../setup/testApp.js';

let mongod;
let app;

// ─── Setup / Teardown ─────────────────────────────────────────────────────

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ─── GET /health ──────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with { ok: true }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ─── POST /coupons ────────────────────────────────────────────────────────

describe('POST /coupons', () => {
  const validBody = {
    code: 'TESTCOUPON',
    discountType: 'PERCENTAGE',
    discountValue: 15,
  };

  it('creates a coupon and returns 201 with the coupon data', async () => {
    const res = await request(app).post('/coupons').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('TESTCOUPON');
    expect(res.body.discountType).toBe('PERCENTAGE');
    expect(res.body.discountValue).toBe(15);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.redemptionCount).toBe(0);
  });

  it('normalizes code to uppercase', async () => {
    const res = await request(app)
      .post('/coupons')
      .send({ ...validBody, code: 'lowercase10' });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('LOWERCASE10');
  });

  it('creates a FLAT coupon with maxRedemptions and validity dates', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const nextWeek = new Date(Date.now() + 86400000 * 7).toISOString();
    const res = await request(app).post('/coupons').send({
      code: 'FLATDEAL',
      discountType: 'FLAT',
      discountValue: 50,
      maxRedemptions: 100,
      validFrom: tomorrow,
      validUntil: nextWeek,
    });
    expect(res.status).toBe(201);
    expect(res.body.maxRedemptions).toBe(100);
  });

  it('returns 400 when code is missing', async () => {
    const res = await request(app)
      .post('/coupons')
      .send({ discountType: 'FLAT', discountValue: 50 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_REQUIRED_FIELD');
  });

  it('returns 400 for an invalid discountType', async () => {
    const res = await request(app)
      .post('/coupons')
      .send({ code: 'X99', discountType: 'UNKNOWN', discountValue: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DISCOUNT_TYPE');
  });

  it('returns 400 for PERCENTAGE discountValue = 0', async () => {
    const res = await request(app)
      .post('/coupons')
      .send({ code: 'ZERO', discountType: 'PERCENTAGE', discountValue: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DISCOUNT_VALUE');
  });

  it('returns 400 for a code shorter than 3 characters', async () => {
    const res = await request(app)
      .post('/coupons')
      .send({ code: 'AB', discountType: 'FLAT', discountValue: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CODE_FORMAT');
  });

  it('returns 409 when the same code is created twice', async () => {
    await request(app).post('/coupons').send(validBody);
    const res = await request(app).post('/coupons').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COUPON_CODE_EXISTS');
  });

  it('returns 400 for malformed JSON body', async () => {
    const res = await request(app)
      .post('/coupons')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

// ─── GET /coupons/:code ───────────────────────────────────────────────────

describe('GET /coupons/:code', () => {
  beforeEach(async () => {
    await request(app).post('/coupons').send({
      code: 'GETME',
      discountType: 'FLAT',
      discountValue: 20,
    });
  });

  it('returns the coupon for a valid code', async () => {
    const res = await request(app).get('/coupons/GETME');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('GETME');
  });

  it('normalizes the code in the URL to uppercase', async () => {
    const res = await request(app).get('/coupons/getme');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('GETME');
  });

  it('returns 404 for an unknown coupon code', async () => {
    const res = await request(app).get('/coupons/DOESNOTEXIST');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('COUPON_NOT_FOUND');
  });
});

// ─── PATCH /coupons/:code ─────────────────────────────────────────────────

describe('PATCH /coupons/:code', () => {
  let couponVersion;

  beforeEach(async () => {
    const res = await request(app).post('/coupons').send({
      code: 'PATCHME',
      discountType: 'PERCENTAGE',
      discountValue: 10,
    });
    couponVersion = res.body.__v;
  });

  it('updates the coupon status to INACTIVE', async () => {
    const res = await request(app)
      .patch('/coupons/PATCHME')
      .send({ status: 'INACTIVE', __v: couponVersion });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('INACTIVE');
  });

  it('updates maxRedemptions', async () => {
    const res = await request(app)
      .patch('/coupons/PATCHME')
      .send({ maxRedemptions: 50, __v: couponVersion });
    expect(res.status).toBe(200);
    expect(res.body.maxRedemptions).toBe(50);
  });

  it('returns 400 when no updatable fields are provided', async () => {
    const res = await request(app)
      .patch('/coupons/PATCHME')
      .send({ unknownField: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_UPDATABLE_FIELDS');
  });

  it('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .patch('/coupons/PATCHME')
      .send({ status: 'BANNED', __v: couponVersion });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STATUS');
  });

  it('returns 404 for non-existent coupon', async () => {
    const res = await request(app)
      .patch('/coupons/GHOST')
      .send({ status: 'INACTIVE' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('COUPON_NOT_FOUND');
  });

  it('returns 409 VERSION_CONFLICT when __v does not match', async () => {
    const res = await request(app)
      .patch('/coupons/PATCHME')
      .send({ status: 'INACTIVE', __v: 999 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });
});

// ─── POST /redeem ─────────────────────────────────────────────────────────

describe('POST /redeem', () => {
  beforeEach(async () => {
    await request(app).post('/coupons').send({
      code: 'REDEEM10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
    });
  });

  const validRedeemBody = {
    couponCode: 'REDEEM10',
    orderId: 'order-abc-1',
    orderTotal: 500,
  };

  it('redeems a coupon and returns discount info', async () => {
    const res = await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-1')
      .send(validRedeemBody);

    expect(res.status).toBe(200);
    expect(res.body.couponCode).toBe('REDEEM10');
    expect(res.body.discountAmount).toBe(50);
    expect(res.body.orderId).toBe('order-abc-1');
    expect(res.body.redemptionId).toBeDefined();
  });

  it('returns 400 when x-user-id header is missing', async () => {
    const res = await request(app).post('/redeem').send(validRedeemBody);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_USER_ID');
  });

  it('returns 400 when couponCode is missing', async () => {
    const res = await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-1')
      .send({ orderId: 'order-1', orderTotal: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_REQUIRED_FIELD');
  });

  it('returns 400 for invalid orderTotal', async () => {
    const res = await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-1')
      .send({ couponCode: 'REDEEM10', orderId: 'order-1', orderTotal: -50 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ORDER_TOTAL');
  });

  it('returns 404 for a non-existent coupon code', async () => {
    const res = await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-1')
      .send({ couponCode: 'GHOST', orderId: 'order-1', orderTotal: 100 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('COUPON_NOT_FOUND');
  });

  it('returns 422 for an inactive coupon', async () => {
    await request(app).post('/coupons').send({
      code: 'INACTIVE_C',
      discountType: 'FLAT',
      discountValue: 10,
    });
    const getCoupon = await request(app).get('/coupons/INACTIVE_C');
    await request(app)
      .patch('/coupons/INACTIVE_C')
      .send({ status: 'INACTIVE', __v: getCoupon.body.__v });

    const res = await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-1')
      .send({ couponCode: 'INACTIVE_C', orderId: 'order-99', orderTotal: 100 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_INACTIVE');
  });

  it('returns 422 for an exhausted coupon (maxRedemptions = 1 after first use)', async () => {
    await request(app).post('/coupons').send({
      code: 'LIMITED1',
      discountType: 'FLAT',
      discountValue: 5,
      maxRedemptions: 1,
    });

    await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-1')
      .send({ couponCode: 'LIMITED1', orderId: 'order-first', orderTotal: 100 });

    const res = await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-2')
      .send({ couponCode: 'LIMITED1', orderId: 'order-second', orderTotal: 100 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_EXHAUSTED');
  });

  it('returns 422 when per-user limit is reached', async () => {
    await request(app).post('/coupons').send({
      code: 'USERLIMIT',
      discountType: 'FLAT',
      discountValue: 5,
      maxRedemptionsPerUser: 1,
    });

    await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-1')
      .send({ couponCode: 'USERLIMIT', orderId: 'order-u1', orderTotal: 100 });

    const res = await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-1')
      .send({ couponCode: 'USERLIMIT', orderId: 'order-u2', orderTotal: 100 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_LIMIT_REACHED_FOR_USER');
  });

  it('returns idempotent result for same user + coupon + order', async () => {
    const first = await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-1')
      .send(validRedeemBody);

    const second = await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-1')
      .send(validRedeemBody);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.redemptionId).toEqual(second.body.redemptionId);
  });

  it('returns 422 when a different coupon is redeemed for the same order', async () => {
    await request(app).post('/coupons').send({
      code: 'COUPON_B',
      discountType: 'FLAT',
      discountValue: 10,
    });

    await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-1')
      .send(validRedeemBody);

    const res = await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-2')
      .send({ couponCode: 'COUPON_B', orderId: 'order-abc-1', orderTotal: 200 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ORDER_ALREADY_HAS_REDEMPTION');
  });
});

// ─── POST /redemptions/:id/revert ─────────────────────────────────────────

describe('POST /redemptions/:id/revert', () => {
  let redemptionId;

  beforeEach(async () => {
    await request(app).post('/coupons').send({
      code: 'REVERTME',
      discountType: 'FLAT',
      discountValue: 25,
    });

    const redeemRes = await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-rev-1')
      .send({ couponCode: 'REVERTME', orderId: 'order-rev-1', orderTotal: 300 });

    redemptionId = redeemRes.body.redemptionId;
  });

  it('reverts an active redemption and returns REVERTED status', async () => {
    const res = await request(app).post(`/redemptions/${redemptionId}/revert`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REVERTED');
    expect(res.body.redemptionId).toBeDefined();
    expect(res.body.revertedAt).toBeDefined();
  });

  it('decrements the coupon redemptionCount on revert', async () => {
    const beforeRevert = await request(app).get('/coupons/REVERTME');
    expect(beforeRevert.body.redemptionCount).toBe(1);

    await request(app).post(`/redemptions/${redemptionId}/revert`);

    const afterRevert = await request(app).get('/coupons/REVERTME');
    expect(afterRevert.body.redemptionCount).toBe(0);
  });

  it('returns 409 ALREADY_REVERTED when reverting a second time', async () => {
    await request(app).post(`/redemptions/${redemptionId}/revert`);
    const res = await request(app).post(`/redemptions/${redemptionId}/revert`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_REVERTED');
  });

  it('returns 404 for a non-existent redemption id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).post(`/redemptions/${fakeId}/revert`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('REDEMPTION_NOT_FOUND');
  });

  it('returns 400 INVALID_ID for a malformed redemption id', async () => {
    const res = await request(app).post('/redemptions/not-a-valid-id/revert');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  it('allows re-redeeming after revert', async () => {
    await request(app).post(`/redemptions/${redemptionId}/revert`);

    const redeemRes = await request(app)
      .post('/redeem')
      .set('x-user-id', 'user-rev-1')
      .send({ couponCode: 'REVERTME', orderId: 'order-rev-2', orderTotal: 300 });

    expect(redeemRes.status).toBe(200);
  });
});
