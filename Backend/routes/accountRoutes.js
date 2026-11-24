const express = require('express');
const c = require('../controllers/accountController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

router.get('/notifications', c.getNotifications);
router.post('/notifications/read-all', c.markAllRead);
router.post('/notifications/:id/read', c.markNotificationRead);
router.get('/loyalty', c.getLoyalty);
router.put('/consent', c.updateConsent);

module.exports = router;
