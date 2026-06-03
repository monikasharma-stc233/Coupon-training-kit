import { Router } from 'express';
import { createCoupon, getCoupon, updateCoupon } from '../controllers/couponController.js';

const router = Router();

router.post('/', createCoupon);
router.get('/:code', getCoupon);
router.patch('/:code', updateCoupon);

export default router;
