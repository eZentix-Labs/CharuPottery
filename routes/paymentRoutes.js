const express = require('express');
const { getMethods } = require('../controllers/paymentController');

const router = express.Router();
// The PhonePe callback is mounted in app.js (needs the raw body, no rate limit).
router.get('/methods', getMethods);

module.exports = router;
