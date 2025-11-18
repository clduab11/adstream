const express = require('express');
const router = express.Router();
const AdsController = require('../controllers/ads.controller');
const { adRequestLimiter } = require('../middleware/rateLimit.middleware');

/**
 * Ad Serving Routes
 * Base path: /api/v1/ads
 */

// POST /api/v1/ads/request - Main ad request endpoint
router.post('/request', adRequestLimiter, AdsController.requestAd);

// POST /api/v1/ads/impression/:impression_id - Record/verify impression
router.post('/impression/:impression_id', AdsController.recordImpression);

// POST /api/v1/ads/click/:impression_id - Record click event
router.post('/click/:impression_id', AdsController.recordClick);

// GET /api/v1/ads/preview/:campaign_id - Preview ad creative
router.get('/preview/:campaign_id', AdsController.previewAd);

module.exports = router;
