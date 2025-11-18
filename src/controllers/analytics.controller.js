const CampaignModel = require('../models/campaign.model');
const TrackingModel = require('../models/tracking.model');
const UserModel = require('../models/user.model');
const SegmentationService = require('../services/segmentation.service');
const BiddingService = require('../services/bidding.service');
const { ApiError } = require('../middleware/errorHandler.middleware');
const logger = require('../utils/logger');

/**
 * Analytics Controller - Handles metrics and reporting endpoints
 */
class AnalyticsController {
  /**
   * GET /api/v1/campaigns/:campaign_id/metrics
   * Get campaign performance metrics
   */
  static async getCampaignMetrics(req, res, next) {
    try {
      const { campaign_id } = req.params;
      const { start_date, end_date } = req.query;

      // Validate campaign exists
      const campaign = CampaignModel.findById(campaign_id);
      if (!campaign) {
        throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign does not exist');
      }

      // Default date range: last 30 days
      const endDate = end_date || new Date().toISOString().split('T')[0];
      const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

      // Get metrics from tracking model
      const metrics = TrackingModel.getCampaignMetrics(
        campaign_id,
        startDate + 'T00:00:00.000Z',
        endDate + 'T23:59:59.999Z'
      );

      // Calculate cost based on CPM
      const cost = (metrics.impressions / 1000) * campaign.bid_amount;

      // Estimate conversions (simulated - would be tracked separately in production)
      const conversionRate = 0.0366; // 3.66% conversion rate
      const conversions = Math.round(metrics.clicks * conversionRate);

      const response = {
        campaign_id,
        date_range: {
          start: startDate,
          end: endDate
        },
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        ctr: metrics.ctr,
        cost: parseFloat(cost.toFixed(2)),
        conversions,
        conversion_rate: metrics.clicks > 0
          ? parseFloat(((conversions / metrics.clicks) * 100).toFixed(2))
          : 0,
        by_segment: metrics.by_segment,
        by_device: metrics.by_device,
        by_placement: metrics.by_placement
      };

      logger.info('Campaign metrics retrieved', {
        campaign_id,
        start_date: startDate,
        end_date: endDate
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/campaigns
   * List all campaigns with basic stats
   */
  static async listCampaigns(req, res, next) {
    try {
      const { offset = 0, limit = 50, status } = req.query;

      let campaigns = CampaignModel.findAll(
        parseInt(offset),
        parseInt(limit)
      );

      // Filter by status if specified
      if (status) {
        campaigns = campaigns.filter(c => c.status === status);
      }

      // Add basic stats to each campaign
      const campaignsWithStats = campaigns.map(campaign => {
        const stats = CampaignModel.getStats(campaign.campaign_id);
        return {
          ...campaign,
          impressions: stats?.impressions || 0,
          clicks: stats?.clicks || 0,
          ctr: stats?.impressions > 0
            ? parseFloat(((stats.clicks / stats.impressions) * 100).toFixed(2))
            : 0
        };
      });

      res.json({
        campaigns: campaignsWithStats,
        pagination: {
          offset: parseInt(offset),
          limit: parseInt(limit),
          total: campaignsWithStats.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/campaigns/:campaign_id
   * Get campaign details
   */
  static async getCampaign(req, res, next) {
    try {
      const { campaign_id } = req.params;

      const campaign = CampaignModel.findById(campaign_id);
      if (!campaign) {
        throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign does not exist');
      }

      const stats = CampaignModel.getStats(campaign_id);

      res.json({
        ...campaign,
        stats: {
          impressions: stats?.impressions || 0,
          clicks: stats?.clicks || 0,
          ctr: stats?.impressions > 0
            ? parseFloat(((stats.clicks / stats.impressions) * 100).toFixed(2))
            : 0
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/campaigns
   * Create a new campaign
   */
  static async createCampaign(req, res, next) {
    try {
      const {
        advertiser_name,
        target_segments,
        ad_creative_url,
        redirect_url,
        bid_amount,
        budget_remaining,
        start_date,
        end_date,
        frequency_cap
      } = req.body;

      // Validate required fields
      if (!advertiser_name || !ad_creative_url || !bid_amount || !budget_remaining) {
        throw new ApiError(400, 'MISSING_FIELDS', 'Required fields: advertiser_name, ad_creative_url, bid_amount, budget_remaining');
      }

      const campaign = CampaignModel.create({
        advertiser_name,
        target_segments: target_segments || [],
        ad_creative_url,
        redirect_url,
        bid_amount,
        budget_remaining,
        start_date: start_date || new Date().toISOString(),
        end_date: end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        frequency_cap
      });

      logger.info('Campaign created', { campaign_id: campaign.campaign_id });

      res.status(201).json(campaign);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/campaigns/:campaign_id
   * Update a campaign
   */
  static async updateCampaign(req, res, next) {
    try {
      const { campaign_id } = req.params;

      const campaign = CampaignModel.findById(campaign_id);
      if (!campaign) {
        throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign does not exist');
      }

      const updated = CampaignModel.update(campaign_id, req.body);

      logger.info('Campaign updated', { campaign_id });

      res.json(updated);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/segments
   * Get available user segments
   */
  static async getSegments(req, res, next) {
    try {
      const { min_size = 0 } = req.query;

      const segments = SegmentationService.getAvailableSegments(parseInt(min_size));

      res.json({
        segments,
        total: segments.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/segments/:segment/performance
   * Get performance metrics for a specific segment
   */
  static async getSegmentPerformance(req, res, next) {
    try {
      const performance = SegmentationService.getSegmentPerformance();

      res.json({
        segments: performance
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/bid-landscape/:segment
   * Get bid landscape for a segment
   */
  static async getBidLandscape(req, res, next) {
    try {
      const { segment } = req.params;

      const landscape = BiddingService.getBidLandscape(segment);
      const estimate = BiddingService.estimateWinningBid(segment);

      res.json({
        segment,
        ...estimate,
        campaigns: landscape
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/platform/stats
   * Get overall platform statistics
   */
  static async getPlatformStats(req, res, next) {
    try {
      const stats = TrackingModel.getPlatformStats();
      const userCount = UserModel.countBySegment();

      res.json({
        ...stats,
        users_by_segment: userCount
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AnalyticsController;
