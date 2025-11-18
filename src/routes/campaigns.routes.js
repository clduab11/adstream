const express = require('express');
const router = express.Router();
const AnalyticsController = require('../controllers/analytics.controller');
const { analyticsLimiter } = require('../middleware/rateLimit.middleware');

/**
 * Campaign and Analytics Routes
 * Base path: /api/v1
 */

// Campaign CRUD operations
router.get('/campaigns', AnalyticsController.listCampaigns);
router.post('/campaigns', AnalyticsController.createCampaign);
router.get('/campaigns/:campaign_id', AnalyticsController.getCampaign);
router.put('/campaigns/:campaign_id', AnalyticsController.updateCampaign);

// Campaign metrics
router.get('/campaigns/:campaign_id/metrics', analyticsLimiter, AnalyticsController.getCampaignMetrics);

// Segments
router.get('/segments', AnalyticsController.getSegments);
router.get('/segments/performance', AnalyticsController.getSegmentPerformance);

// Bid landscape
router.get('/bid-landscape/:segment', AnalyticsController.getBidLandscape);

// Platform stats
router.get('/platform/stats', AnalyticsController.getPlatformStats);

module.exports = router;
