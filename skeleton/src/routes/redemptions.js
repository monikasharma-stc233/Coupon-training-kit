import { Router } from 'express';
import { redeemCoupon , revertRedemption } from '../controllers/redemptionController.js';

const router = Router();

router.post('/redeem', redeemCoupon);
router.post('/redemptions/:id/revert', revertRedemption);


export default router;
