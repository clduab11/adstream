const express = require('express');
const router = express.Router();

const adsRoutes = require('./ads.routes');
const campaignsRoutes = require('./campaigns.routes');

/**
 * API Routes Index
 * Combines all route modules
 */

// Mount routes
router.use('/ads', adsRoutes);
router.use('/', campaignsRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'ADSTREAM API',
    version: '1.0.0',
    description: 'Retail Media Network Ad Server',
    endpoints: {
      ads: {
        'POST /api/v1/ads/request': 'Request an ad for a user',
        'POST /api/v1/ads/impression/:id': 'Record impression',
        'POST /api/v1/ads/click/:id': 'Record click',
        'GET /api/v1/ads/preview/:campaign_id': 'Preview ad creative'
      },
      campaigns: {
        'GET /api/v1/campaigns': 'List all campaigns',
        'POST /api/v1/campaigns': 'Create a campaign',
        'GET /api/v1/campaigns/:id': 'Get campaign details',
        'PUT /api/v1/campaigns/:id': 'Update campaign',
        'GET /api/v1/campaigns/:id/metrics': 'Get campaign metrics'
      },
      segments: {
        'GET /api/v1/segments': 'Get available segments',
        'GET /api/v1/segments/performance': 'Get segment performance'
      },
      analytics: {
        'GET /api/v1/bid-landscape/:segment': 'Get bid landscape',
        'GET /api/v1/platform/stats': 'Get platform statistics'
      }
    }
  });
});

module.exports = router;
