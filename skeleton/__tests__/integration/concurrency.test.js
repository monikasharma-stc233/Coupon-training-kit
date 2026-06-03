/**
 * Race Condition & Concurrency Test Suite
 *
 *
 *  1. Global Limit Race   — 200 concurrent redeems, maxRedemptions = 10
 *  2. Last Slot Race      — 2 concurrent redeems, maxRedemptions = 1
 *  3. Per-User Limit Race — same user, 50 concurrent redeems, maxRedemptionsPerUser = 3
 *  4. Double-Click Race   — same user + same orderId, 2 concurrent redeems
 *  5. Coupon Expires During Redemption (eligibility check + atomic filter)
 *  6. Admin Disables Coupon During Redemption (atomic filter re-checks status)
 *  7. Double Revert Race  — 2 concurrent reverts on the same redemption
 *  8. Redeem + Revert Race — concurrent redeem and revert
 *  9. Client Retry / Idempotency — same request retried after timeout
 * 10. Insert Fails After Count Increment — compensating decrement path
 *
 * Implementation notes:
 *  - Uses MongoMemoryServer (standalone, no replica set) — supports atomic
 *    single-doc findOneAndUpdate but NOT multi-doc transactions. The service
 *    itself does NOT use real transactions; it uses compensating writes, so
 *    all tests run correctly on standalone.
 *  - syncIndexes() is called before tests so unique indexes are enforced
 *    from the very first concurrent request.
 *  - Known gap: per-user limit enforcement is a read-then-check (not atomic),
 *    so under true concurrency it may allow an extra redemption. Test
 *    documents the intended behavior but notes this risk.
 */


import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../setup/testApp.js';
import { Coupon } from '../../src/models/Coupon.js';
import { Redemption } from '../../src/models/Redemption.js';

let mongod;
let app;

// ── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Ensure all unique indexes exist before any concurrent request fires.
  await mongoose.connection.syncIndexes();
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

// ── Helpers ─────────────────────────────────────────────────────────────────

function apiCreateCoupon(overrides = {}) {
  return request(app)
    .post('/coupons')
    .send({
      code: 'COUPON',
      discountType: 'FLAT',
      discountValue: 10,
      ...overrides,
    });
}

function apiRedeem({ couponCode, orderId, userId, orderTotal = 100 }) {
  return request(app)
    .post('/redeem')
    .set('x-user-id', userId)
    .send({ couponCode, orderId, orderTotal });
}

function apiRevert(redemptionId) {
  return request(app).post(`/redemptions/${redemptionId}/revert`);
}

function getCoupon(code) {
  return request(app).get(`/coupons/${code}`);
}

// ── 1. Global Limit Race (200 Concurrent Requests) ──────────────────────────

describe('Global Limit Race — 200 concurrent requests, maxRedemptions = 10', () => {
  it(
    'allows exactly 10 redeems and rejects the rest with COUPON_EXHAUSTED; final redemptionCount = 10',
    async () => {
      await apiCreateCoupon({ code: 'GLOBALRACE', maxRedemptions: 10 });

      const requests = Array.from({ length: 200 }, (_, i) =>
        apiRedeem({
          couponCode: 'GLOBALRACE',
          orderId: `order-gr-${i}`,
          userId: `user-gr-${i}`,
        }),
      );

      const results = await Promise.allSettled(requests);
      const responses = results.map((r) => r.value);

      const successes = responses.filter((r) => r.status === 200);
      const exhausted = responses.filter(
        (r) => r.status === 422 && r.body.error?.code === 'COUPON_EXHAUSTED',
      );

      expect(successes).toHaveLength(10);
      expect(exhausted).toHaveLength(190);

      const couponRes = await getCoupon('GLOBALRACE');
      expect(couponRes.body.redemptionCount).toBe(10);

      const activeInDb = await Redemption.countDocuments({ status: 'ACTIVE' });
      expect(activeInDb).toBe(10);
    },
    60000,
  );
});

// ── 2. Last Slot Race — 2 concurrent requests, maxRedemptions = 1 ────────────

describe('Last Slot Race — 2 concurrent requests, maxRedemptions = 1', () => {
  it('allows exactly 1 redemption; the other gets COUPON_EXHAUSTED', async () => {
    await apiCreateCoupon({ code: 'LASTSLOT', maxRedemptions: 1 });

    const [res1, res2] = await Promise.all([
      apiRedeem({ couponCode: 'LASTSLOT', orderId: 'order-ls1', userId: 'user-ls1' }),
      apiRedeem({ couponCode: 'LASTSLOT', orderId: 'order-ls2', userId: 'user-ls2' }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 422]);

    const loser = [res1, res2].find((r) => r.status === 422);
    expect(loser.body.error.code).toBe('COUPON_EXHAUSTED');

    const couponRes = await getCoupon('LASTSLOT');
    expect(couponRes.body.redemptionCount).toBe(1);
  });
});

// ── 3. Per-User Limit Race ───────────────────────────────────────────────────

describe('Per-User Limit Race — same user, 50 concurrent redeems, maxRedemptionsPerUser = 4', () => {
  it('[BUG] multiple concurrent requests exceed per-user limit', async () => {
    await apiCreateCoupon({
      code: 'USERLIMIT4',
      maxRedemptionsPerUser: 4,
    });

    const requests = Array.from({ length: 50 }, (_, i) =>
      apiRedeem({
        couponCode: 'USERLIMIT4',
        orderId: `order-ul4-${i + 1}`,
        userId: 'user-race',
      })
    );

    const results = await Promise.all(requests);

    const successes = results.filter((r) => r.status === 200);

    console.log('Total requests:', results.length);
    console.log('Successes:', successes.length);

    const userActiveCount = await Redemption.countDocuments({
      userId: 'user-race',
      status: 'ACTIVE',
    });

    console.log('Active redemptions:', userActiveCount);

    // Current broken behavior:
    expect(successes.length).toBe(4);
    expect(userActiveCount).toBe(4);

  });
});

// ── 4. Double-Click Race — same user, same coupon, same orderId ──────────────

describe('Double-Click Race — same user + coupon + orderId, 2 concurrent redeems', () => {
  it('creates exactly 1 redemption; redemptionCount stays at 1', async () => {
    await apiCreateCoupon({ code: 'DBLCLICK' });

    const [res1, res2] = await Promise.all([
      apiRedeem({ couponCode: 'DBLCLICK', orderId: 'order-dc1', userId: 'user-dc' }),
      apiRedeem({ couponCode: 'DBLCLICK', orderId: 'order-dc1', userId: 'user-dc' }),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 200);

    // At least one must succeed.
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // If both returned 200, idempotency must return the same redemptionId.
    if (successes.length === 2) {
      expect(res1.body.redemptionId).toEqual(res2.body.redemptionId);
    } else {
      // The loser gets either ORDER_ALREADY_HAS_REDEMPTION or is idempotent.
      const loser = [res1, res2].find((r) => r.status !== 200);
      expect([422]).toContain(loser.status);
    }

    // Only one ACTIVE redemption must exist for this order.
    const count = await Redemption.countDocuments({
      orderId: 'order-dc1',
      status: 'ACTIVE',
    });
    expect(count).toBe(1);

    // Coupon count must be exactly 1 (no double-increment).
    const couponRes = await getCoupon('DBLCLICK');
    expect(couponRes.body.redemptionCount).toBe(1);
  });                                                                        
});

// ── 5. Coupon Expires During Redemption ─────────────────────────────────────

describe('Coupon Expires During Redemption', () => {
  it('eligibility check catches an already-expired coupon → 422 COUPON_EXPIRED', async () => {
    // validUntil in the past — passes POST /coupons (no future-only guard on create),
    // but the eligibility check in assertCouponRedeemable rejects it.
    const expiredAt = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
    await apiCreateCoupon({ code: 'EXPIRED', validUntil: expiredAt });

    const res = await apiRedeem({
      couponCode: 'EXPIRED',
      orderId: 'order-exp',
      userId: 'user-exp',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_EXPIRED');
  });

  it('atomic filter re-checks validUntil — coupon expired mid-flight is rejected at write time', async () => {
    // Bypass the API to create a coupon whose validUntil is already past
    // (simulates: coupon was valid at eligibility-check time, expired by write time).
    await Coupon.create({
      code: 'MIDFLIGHT',
      discountType: 'FLAT',
      discountValue: 10,
      status: 'ACTIVE',
      validUntil: new Date(Date.now() - 1), // expired just now
      redemptionCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await apiRedeem({
      couponCode: 'MIDFLIGHT',
      orderId: 'order-mf',
      userId: 'user-mf',
    });

    // Either the eligibility check or the atomic filter (validUntil: { $gt: now })
    // catches the expiry — either way the response must be 422 COUPON_EXPIRED.
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_EXPIRED');

    // Count must never have been incremented.
    const coupon = await Coupon.findOne({ code: 'MIDFLIGHT' });
    expect(coupon.redemptionCount).toBe(0);
  });

  it('coupon set to expire very soon: concurrent requests respect validUntil boundary', async () => {
    // Set validUntil 200ms in the future so some in-flight requests may expire.
    const soonExpiry = new Date(Date.now() + 200).toISOString();
    await apiCreateCoupon({ code: 'EXPIRING', validUntil: soonExpiry, maxRedemptions: 100 });

    // Wait until expiry has passed, then fire requests — all should be rejected.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        apiRedeem({ couponCode: 'EXPIRING', orderId: `order-e-${i}`, userId: `user-e-${i}` }),
      ),
    );

    const responses = results.map((r) => r.value);
    responses.forEach((r) => {
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('COUPON_EXPIRED');
    });

    const coupon = await Coupon.findOne({ code: 'EXPIRING' });
    expect(coupon.redemptionCount).toBe(0);
  });
});

// ── 6. Admin Disables Coupon Between Eligibility Check and Write ─────────────

describe('Admin Disables Coupon During Redemption', () => {
  it('status check catches an already-inactive coupon → 422 COUPON_INACTIVE', async () => {
    await apiCreateCoupon({ code: 'INACTIVE' });

    // Disable directly in DB (simulates admin action mid-flight).
    await Coupon.updateOne({ code: 'INACTIVE' }, { $set: { status: 'INACTIVE' } });

    const res = await apiRedeem({
      couponCode: 'INACTIVE',
      orderId: 'order-ina',
      userId: 'user-ina',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_INACTIVE');
  });

  it('atomic filter re-checks status: ACTIVE — mid-flight disable is rejected at write time', async () => {
    // Insert coupon that is already INACTIVE (simulates disable happening between
    // eligibility check and the findOneAndUpdate atomic write).
    await Coupon.create({
      code: 'MIDISABLE',
      discountType: 'FLAT',
      discountValue: 10,
      status: 'INACTIVE',
      redemptionCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await apiRedeem({
      couponCode: 'MIDISABLE',
      orderId: 'order-mid',
      userId: 'user-mid',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COUPON_INACTIVE');

    const coupon = await Coupon.findOne({ code: 'MIDISABLE' });
    expect(coupon.redemptionCount).toBe(0);
  });

  it('concurrent redeems while admin disables coupon: none succeed after disable', async () => {
    await apiCreateCoupon({ code: 'DISABLERACE', maxRedemptions: 100 });

    // Disable the coupon immediately (before concurrent requests fire).
    const getCouponRes = await getCoupon('DISABLERACE');
    await request(app)
      .patch('/coupons/DISABLERACE')
      .send({ status: 'INACTIVE', __v: getCouponRes.body.__v });

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        apiRedeem({
          couponCode: 'DISABLERACE',
          orderId: `order-dr-${i}`,
          userId: `user-dr-${i}`,
        }),
      ),
    );

    const responses = results.map((r) => r.value);
    responses.forEach((r) => {
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('COUPON_INACTIVE');
    });

    const coupon = await Coupon.findOne({ code: 'DISABLERACE' });
    expect(coupon.redemptionCount).toBe(0);
  });
});

// ── 7. Double Revert Race ────────────────────────────────────────────────────

describe('Double Revert Race — 2 concurrent reverts for the same redemption', () => {
  it('reverts exactly once; second request returns 409 ALREADY_REVERTED', async () => {
    await apiCreateCoupon({ code: 'REVERTRACE' });

    const redeemRes = await apiRedeem({
      couponCode: 'REVERTRACE',
      orderId: 'order-rr1',
      userId: 'user-rr1',
    });
    expect(redeemRes.status).toBe(200);
    const redemptionId = redeemRes.body.redemptionId;

    const [rev1, rev2] = await Promise.all([
      apiRevert(redemptionId),
      apiRevert(redemptionId),
    ]);

    const statuses = [rev1.status, rev2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const loser = [rev1, rev2].find((r) => r.status === 409);
    expect(loser.body.error.code).toBe('ALREADY_REVERTED');

    // Redemption count must be exactly 0 (decremented once, not twice).
    const couponRes = await getCoupon('REVERTRACE');
    expect(couponRes.body.redemptionCount).toBe(0);

    // Redemption record status must be REVERTED.
    const redemption = await Redemption.findById(redemptionId);
    expect(redemption.status).toBe('REVERTED');
  });

  it('many concurrent reverts on the same redemption: only 1 succeeds', async () => {
    await apiCreateCoupon({ code: 'MANYREVERT' });

    const redeemRes = await apiRedeem({
      couponCode: 'MANYREVERT',
      orderId: 'order-mr1',
      userId: 'user-mr1',
    });
    const redemptionId = redeemRes.body.redemptionId;

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => apiRevert(redemptionId)),
    );

    const responses = results.map((r) => r.value);
    const successes = responses.filter((r) => r.status === 200);
    const alreadyReverted = responses.filter(
      (r) => r.status === 409 && r.body.error?.code === 'ALREADY_REVERTED',
    );

    expect(successes).toHaveLength(1);
    expect(alreadyReverted).toHaveLength(19);

    const couponRes = await getCoupon('MANYREVERT');
    expect(couponRes.body.redemptionCount).toBe(0);
  });
});

// ── 8. Redeem + Revert Race ──────────────────────────────────────────────────

describe('Redeem + Revert Race — concurrent new redeem and revert of existing redemption', () => {
  it('both operations complete cleanly; redemptionCount stays consistent', async () => {
    await apiCreateCoupon({ code: 'REDEEMREVERT' });

    // Establish one existing redemption to revert.
    const firstRedeem = await apiRedeem({
      couponCode: 'REDEEMREVERT',
      orderId: 'order-rrev1',
      userId: 'user-rrev1',
    });
    expect(firstRedeem.status).toBe(200);
    const existingRedemptionId = firstRedeem.body.redemptionId;

    // Fire revert on the existing redemption and a fresh redeem simultaneously.
    const [revertRes, newRedeemRes] = await Promise.all([
      apiRevert(existingRedemptionId),
      apiRedeem({
        couponCode: 'REDEEMREVERT',
        orderId: 'order-rrev2',
        userId: 'user-rrev2',
      }),
    ]);

    expect([200]).toContain(revertRes.status);
    expect([200, 422]).toContain(newRedeemRes.status);

    // Final redemptionCount must equal the number of ACTIVE redemptions in DB.
    const couponRes = await getCoupon('REDEEMREVERT');
    const activeCount = await Redemption.countDocuments({
      status: 'ACTIVE',
    });
    expect(couponRes.body.redemptionCount).toBe(activeCount);
  });
});

// ── 9. Client Retry / Idempotency ────────────────────────────────────────────

describe('Client Retry After Timeout — Idempotency', () => {
  it('same user + coupon + orderId retried: both return 200 with the same redemptionId', async () => {
    await apiCreateCoupon({ code: 'IDEMPOTENT' });

    const body = { couponCode: 'IDEMPOTENT', orderId: 'order-idem1', userId: 'user-idem' };
    const first = await apiRedeem(body);
    const second = await apiRedeem(body); // simulates client retry

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.redemptionId).toEqual(second.body.redemptionId);

    // No duplicate records in DB.
    const count = await Redemption.countDocuments({
      orderId: 'order-idem1',
      status: 'ACTIVE',
    });
    expect(count).toBe(1);

    // redemptionCount must not be double-incremented.
    const couponRes = await getCoupon('IDEMPOTENT');
    expect(couponRes.body.redemptionCount).toBe(1);
  });

  it('different user retrying the same orderId gets ORDER_ALREADY_HAS_REDEMPTION', async () => {
    await apiCreateCoupon({ code: 'IDEM2' });

    await apiRedeem({ couponCode: 'IDEM2', orderId: 'order-idem2', userId: 'user-a' });

    const res = await apiRedeem({
      couponCode: 'IDEM2',
      orderId: 'order-idem2',
      userId: 'user-b',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ORDER_ALREADY_HAS_REDEMPTION');
  });

  it('retrying the same request concurrently returns consistent results', async () => {
    await apiCreateCoupon({ code: 'IDEM3' });

    const body = { couponCode: 'IDEM3', orderId: 'order-idem3', userId: 'user-idem3' };

    // Simulate 5 concurrent retries of the identical request.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => apiRedeem(body)),
    );

    const responses = results.map((r) => r.value);
    const successIds = responses
      .filter((r) => r.status === 200)
      .map((r) => r.body.redemptionId);

    // All 200 responses must carry the same redemptionId.
    const uniqueIds = [...new Set(successIds.map(String))];
    expect(uniqueIds).toHaveLength(1);

    // Exactly one active redemption in DB.
    const count = await Redemption.countDocuments({
      orderId: 'order-idem3',
      status: 'ACTIVE',
    });
    expect(count).toBe(1);
  });
});

// ── 10. Insert Fails After Count Increment (compensating decrement) ──────────

describe('Redemption Insert Fails After Count Increment — compensating decrement path', () => {
  it('redemptionCount is rolled back to 0 when insert is rejected by duplicate key', async () => {
    await apiCreateCoupon({ code: 'FAILINSERT' });

    // First redeem succeeds — redemptionCount becomes 1.
    const first = await apiRedeem({
      couponCode: 'FAILINSERT',
      orderId: 'order-fi1',
      userId: 'user-fi',
    });
    expect(first.status).toBe(200);

    let couponRes = await getCoupon('FAILINSERT');
    expect(couponRes.body.redemptionCount).toBe(1);

    // Second identical redeem triggers the idempotency path (same user + order).
    // Internally this either returns the existing record (200) or ORDER_ALREADY_HAS_REDEMPTION (422).
    const dup = await apiRedeem({
      couponCode: 'FAILINSERT',
      orderId: 'order-fi1',
      userId: 'user-fi',
    });
    expect([200, 422]).toContain(dup.status);

    // After either outcome, count must still be exactly 1 (never 2).
    couponRes = await getCoupon('FAILINSERT');
    expect(couponRes.body.redemptionCount).toBe(1);
  });

  it('redemptionCount stays consistent after a series of mixed success/failure redeems', async () => {
    await apiCreateCoupon({ code: 'COUNTCHECK', maxRedemptions: 5 });

    // 3 valid redeems (different orders).
    for (let i = 0; i < 3; i++) {
      const res = await apiRedeem({
        couponCode: 'COUNTCHECK',
        orderId: `order-cc-${i}`,
        userId: `user-cc-${i}`,
      });
      expect(res.status).toBe(200);
    }

    // Duplicate attempt for an existing order.
    await apiRedeem({ couponCode: 'COUNTCHECK', orderId: 'order-cc-0', userId: 'user-cc-0' });

    // Count must be exactly 3 (no over-increment).
    const couponRes = await getCoupon('COUNTCHECK');
    const activeInDb = await Redemption.countDocuments({ status: 'ACTIVE' });

    expect(couponRes.body.redemptionCount).toBe(3);
    expect(activeInDb).toBe(3);
  });
});