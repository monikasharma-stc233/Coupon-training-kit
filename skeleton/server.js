import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import couponRoutes from './src/routes/coupons.js';
import redemptionRoutes from './src/routes/redemptions.js';   
import { errorHandler } from './src/middleware/errorHandler.js';

const MONGO_URI = process.env.MONGO_URI ;
const PORT = process.env.PORT;

const app = express();
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/coupons', couponRoutes);
app.use('/', redemptionRoutes);
app.use(errorHandler);

async function start() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');
  
  await mongoose.connection.syncIndexes();
  console.log('Indexes synced');

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Startup failed:', err.message || err);
  process.exit(1);
});
