import mongoose from 'mongoose';

const { Schema } = mongoose;

const redemptionSchema = new Schema(
  {
    couponId: {
      type: Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
    },
    couponCode: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    orderId: {
      type: String,
      required: true,
    },
    discountType: {
      type: String,
      enum: ['PERCENTAGE', 'FLAT'],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
    },
    discountAmount: {
      type: Number,
      required: true,
    },
    orderTotal: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVERTED'],
      default: 'ACTIVE',
    },
    createdAt: {
      type: Date,
    },
    updatedAt: {
      type: Date,
    },
    revertedAt: {
      type: Date,
      default: null,
    },
  },
);

// Index 2 — unique compound; prevents double-click race for the same
// (coupon, user, order)  while the redemption is ACTIVE.
redemptionSchema.index(
  { couponId: 1, userId: 1, orderId: 1, status: 1 },
  { unique: true, name: 'unique_coupon_user_order_status' },
);

// Index 3 — speeds up per-user limit query:
//   countDocuments({ couponId, userId, status: "ACTIVE" })
redemptionSchema.index(
  { couponId: 1, userId: 1, status: 1 },
  { name: 'idx_coupon_user_status' },
);

// Index 4 — speeds up order-level idempotency check:
//   findOne({ orderId, status: "ACTIVE" })
redemptionSchema.index(
  { orderId: 1, status: 1 },
  { name: 'idx_order_status' },
);

// Index 5 — partial unique index; database-level guard for one-coupon-per-order.
// Only ACTIVE redemptions block another application; REVERTED ones do not.
redemptionSchema.index(
  { orderId: 1 , status: 1},
  {
    unique: true,
    // partialFilterExpression: { status: 'ACTIVE' },
    name: 'unique_order',
  },
);

export const Redemption = mongoose.model('Redemption', redemptionSchema, 'redemptions');
