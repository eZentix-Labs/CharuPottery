const express = require('express');
const c = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect, authorize('admin')); // every admin endpoint is server-side protected

router.get('/dashboard', c.getDashboard);

router.get('/customers', c.listCustomers);
router.get('/customers/:id', c.getCustomer);
router.patch('/customers/:id/status', c.setCustomerStatus);

router.get('/inventory/items', c.listInventoryItems);
router.post('/inventory/items', c.createInventoryItem);
router.put('/inventory/items/:id', c.updateInventoryItem);
router.post('/inventory/items/:id/adjust', c.adjustInventoryItem);
router.get('/inventory/movements', c.listMovements);

router.get('/coupons', c.listCoupons);
router.post('/coupons', c.createCoupon);
router.put('/coupons/:id', c.updateCoupon);
router.get('/coupons/:id/redemptions', c.getCouponRedemptions);

router.get('/notifications', c.listNotifications);
router.post('/notifications', c.createNotification);
router.delete('/notifications/:id', c.deleteNotification);

router.get('/campaigns', c.listCampaigns);
router.get('/campaigns/whatsapp/status', c.whatsappStatus);
router.post('/campaigns/whatsapp', c.createWhatsappCampaign);

router.get('/audit', c.listAudit);

module.exports = router;
