import mongoose from 'mongoose';

const { Schema } = mongoose;

const userCouponCounterSchema = new Schema(
  {
    _id: { type: String },
    couponId: {
      type: Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    count: {
      type: Number,
      default: 0,
    },
  },
  { versionKey: false },
);

export const UserCouponCounter = mongoose.model(
  'UserCouponCounter',
  userCouponCounterSchema,
  'user_coupon_counters',
);
