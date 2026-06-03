import mongoose from 'mongoose';

const { Schema } = mongoose;

const couponSchema = new Schema(
  {
    code: {
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
    maxRedemptions: {
      type: Number,
      default: null,
    },
    maxRedemptionsPerUser: {
      type: Number,
      default: null,
    },
    validFrom: {
      type: Date,
      default: null,
    },
    validUntil: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
    redemptionCount: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
    },
    updatedAt: {
      type: Date,
    },
  },
);

couponSchema.index({ code: 1 }, { unique: true, name: 'unique_code' });

export const Coupon = mongoose.model('Coupon', couponSchema, 'coupons');
