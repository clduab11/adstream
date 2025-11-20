const UserModel = require('../models/user.model');
const CampaignModel = require('../models/campaign.model');
const TrackingModel = require('../models/tracking.model');
const BiddingService = require('../services/bidding.service');
const FraudDetectionService = require('../services/fraud-detection.service');
const { generateImpressionId } = require('../utils/crypto');
const { DEFAULT_HOUSE_AD, PERFORMANCE } = require('../config/constants');
const { ApiError } = require('../middleware/errorHandler.middleware');
const logger = require('../utils/logger');

/**
 * Ads Controller - Handles ad serving and tracking endpoints
 */
class AdsController {
  /**
   * POST /api/v1/ads/request
   * Main ad request endpoint
   */
  static async requestAd(req, res, next) {
    const startTime = Date.now();

    try {
      const { user_id, placement, device_type } = req.body;

      // Validate required fields
      if (!user_id) {
        throw new ApiError(400, 'MISSING_FIELD', 'user_id is required');
      }

      // Get user profile
      let user = UserModel.findById(user_id);

      // Create user if not found (for demo purposes)
      if (!user) {
        user = UserModel.create({
          user_id,
          username: `user_${user_id}`,
          segment: 'new_customers'
        });
      }

      // Select winning campaign using bidding service
      const bidResult = BiddingService.selectWinningCampaign(
        user,
        placement || 'homepage_banner',
        device_type || 'desktop'
      );

      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed > PERFORMANCE.AD_REQUEST_TIMEOUT_MS) {
        logger.warn('Ad request timeout, serving house ad', {
          user_id,
          elapsed_ms: elapsed
        });

        return res.json({
          ad: {
            campaign_id: DEFAULT_HOUSE_AD.campaign_id,
            creative_url: DEFAULT_HOUSE_AD.creative_url,
            redirect_url: DEFAULT_HOUSE_AD.redirect_url,
            impression_id: null
          },
          tracking: null,
          meta: {
            served_in_ms: elapsed,
            is_house_ad: true
          }
        });
      }

      // Generate impression ID if not a house ad
      let impressionId = null;
      if (!bidResult.isHouseAd) {
        impressionId = generateImpressionId();

        // Record impression
        TrackingModel.createImpression({
          impression_id: impressionId,
          campaign_id: bidResult.campaign.campaign_id,
          user_id: user.user_id,
          device_type: device_type || 'desktop',
          placement: placement || 'homepage_banner'
        });

        // Cache impression for fraud detection
        FraudDetectionService.cacheImpression(impressionId);

        // Process bid deduction
        BiddingService.processBidDeduction(
          bidResult.campaign.campaign_id,
          bidResult.bid_price
        );
      }

      const response = {
        ad: {
          campaign_id: bidResult.campaign.campaign_id,
          creative_url: bidResult.campaign.ad_creative_url || bidResult.campaign.creative_url,
          redirect_url: bidResult.campaign.redirect_url,
          impression_id: impressionId
        },
        tracking: impressionId ? {
          impression_url: `/api/v1/ads/impression/${impressionId}`,
          click_url: `/api/v1/ads/click/${impressionId}`
        } : null,
        meta: {
          served_in_ms: Date.now() - startTime,
          is_house_ad: bidResult.isHouseAd
        }
      };

      logger.info('Ad served', {
        user_id,
        campaign_id: bidResult.campaign.campaign_id,
        impression_id: impressionId,
        elapsed_ms: response.meta.served_in_ms
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/ads/impression/:impression_id
   * Record/verify impression
   */
  static async recordImpression(req, res, next) {
    try {
      const { impression_id } = req.params;

      // Validate impression
      const validation = FraudDetectionService.validateImpression(impression_id);

      if (!validation.valid) {
        logger.warn('Invalid impression attempt', {
          impression_id,
          reason: validation.reason
        });

        return res.status(400).json({
          error: validation.reason,
          message: validation.message
        });
      }

      // Check if impression exists in database
      if (!TrackingModel.impressionExists(impression_id)) {
        return res.status(404).json({
          error: 'IMPRESSION_NOT_FOUND',
          message: 'Impression does not exist'
        });
      }

      // Return success
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/ads/click/:impression_id
   * Record click event
   */
  static async recordClick(req, res, next) {
    try {
      const { impression_id } = req.params;
      const { user_id } = req.body;

      // Validate click
      const validation = FraudDetectionService.validateClick(impression_id, user_id);

      if (!validation.valid) {
        logger.warn('Invalid click attempt', {
          impression_id,
          user_id,
          reason: validation.reason
        });

        return res.status(400).json({
          error: validation.reason,
          message: validation.message
        });
      }

      // Get impression details
      const impression = validation.impression;

      // Get campaign for redirect URL
      const campaign = CampaignModel.findById(impression.campaign_id);

      // Record click
      const clickResult = TrackingModel.createClick({
        impression_id,
        campaign_id: impression.campaign_id,
        user_id: impression.user_id,
        redirect_url: campaign?.redirect_url
      });

      // Cache click for deduplication
      FraudDetectionService.cacheClick(impression_id);

      logger.info('Click recorded', {
        click_id: clickResult.click_id,
        impression_id,
        campaign_id: impression.campaign_id
      });

      res.json({
        success: true,
        click_id: clickResult.click_id,
        redirect_url: campaign?.redirect_url
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/ads/preview/:campaign_id
   * Preview ad creative for a campaign
   */
  static async previewAd(req, res, next) {
    try {
      const { campaign_id } = req.params;

      const campaign = CampaignModel.findById(campaign_id);

      if (!campaign) {
        throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign does not exist');
      }

      res.json({
        campaign_id: campaign.campaign_id,
        advertiser: campaign.advertiser_name,
        creative_url: campaign.ad_creative_url,
        redirect_url: campaign.redirect_url,
        target_segments: campaign.target_segments
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdsController;
