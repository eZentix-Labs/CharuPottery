const express = require('express');
const router = express.Router();
const { stripeWebhook } = require('../controllers/webhookController');

// Raw body parsing for this route is handled in server.js (must come before express.json())
router.post('/stripe', stripeWebhook);

module.exports = router;
