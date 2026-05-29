import express from 'express';
import couponRoutes from '../../src/routes/coupons.js';
import redemptionRoutes from '../../src/routes/redemptions.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/coupons', couponRoutes);
  app.use('/', redemptionRoutes);
  app.use(errorHandler);
  return app;
}
