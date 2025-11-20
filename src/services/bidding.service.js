const CampaignModel = require('../models/campaign.model');
const TrackingModel = require('../models/tracking.model');
const { DEFAULT_HOUSE_AD, PERFORMANCE } = require('../config/constants');

/**
 * Bidding Service - Handles campaign selection and RTB logic
 */
class BiddingService {
  /**
   * Select the winning campaign for an ad request
   * Uses simplified second-price auction model
   */
  static async selectWinningCampaign(user, placement, deviceType) {
    // Get all active campaigns targeting user's segment
    const eligibleCampaigns = await this.getEligibleCampaigns(user, placement);

    if (eligibleCampaigns.length === 0) {
      return {
        campaign: DEFAULT_HOUSE_AD,
        isHouseAd: true,
        bid_price: 0
      };
    }

    // Calculate effective CPM for each campaign
    const scoredCampaigns = await Promise.all(eligibleCampaigns.map(async campaign => {
      const eCPM = this.calculateEffectiveCPM(campaign, user.segment);
      const qualityScore = await this.getQualityScore(campaign);

      return {
        campaign,
        eCPM,
        qualityScore,
        finalScore: eCPM * qualityScore
      };
    }));

    // Sort by final score (descending)
    scoredCampaigns.sort((a, b) => b.finalScore - a.finalScore);

    // Second-price auction: winner pays second-highest bid + 0.01
    const winner = scoredCampaigns[0];
    const secondPrice = scoredCampaigns.length > 1
      ? scoredCampaigns[1].finalScore
      : winner.finalScore * 0.5;

    return {
      campaign: winner.campaign,
      isHouseAd: false,
      bid_price: Math.max(secondPrice + 0.01, 0.01),
      eCPM: winner.eCPM,
      quality_score: winner.qualityScore
    };
  }

  /**
   * Get campaigns eligible for the current request
   * Fixed N+1 query by fetching all impression counts in a single query
   */
  static async getEligibleCampaigns(user, placement) {
    // Get active campaigns for user's segment
    const campaigns = await CampaignModel.findActiveBySegment(user.segment);

    if (campaigns.length === 0) {
      return [];
    }

    // Fetch all impression counts in a single query to avoid N+1
    const cutoffTime = new Date(Date.now() - PERFORMANCE.MAX_FREQUENCY_CAP_HOURS * 60 * 60 * 1000).toISOString();
    const { query } = require('../config/database');
    
    const campaignIds = campaigns.map(c => c.campaign_id);
    const placeholders = campaignIds.map((_, i) => `$${i + 2}`).join(', ');
    
    const impressionCountsResult = await query(
      `SELECT campaign_id, COUNT(*) as count
       FROM impressions
       WHERE user_id = $1
       AND campaign_id IN (${placeholders})
       AND timestamp >= $${campaignIds.length + 2}
       GROUP BY campaign_id`,
      [user.user_id, ...campaignIds, cutoffTime]
    );

    const impressionCounts = new Map();
    const rows = impressionCountsResult.rows || impressionCountsResult;
    rows.forEach(row => {
      impressionCounts.set(row.campaign_id, Number(row.count));
    });

    // Filter by frequency cap and other criteria
    return campaigns.filter(campaign => {
      // Check frequency cap using the fetched counts
      const impressionCount = impressionCounts.get(campaign.campaign_id) || 0;
      const frequencyCap = campaign.frequency_cap || PERFORMANCE.DEFAULT_FREQUENCY_CAP;

      if (impressionCount >= frequencyCap) {
        return false;
      }

      // Check minimum budget (at least one impression worth)
      const minBudget = campaign.bid_amount / 1000; // CPM to per-impression
      if (campaign.budget_remaining < minBudget) {
        return false;
      }

      return true;
    });
  }

  /**
   * Calculate effective CPM for a campaign
   * Considers historical performance and targeting match
   */
  static calculateEffectiveCPM(campaign, userSegment) {
    let eCPM = campaign.bid_amount;

    // Apply targeting bonus if campaign specifically targets this segment
    if (campaign.target_segments && campaign.target_segments.includes(userSegment)) {
      eCPM *= 1.1; // 10% bonus for exact segment match
    }

    return eCPM;
  }

  /**
   * Get quality score for a campaign based on historical CTR
   */
  static async getQualityScore(campaign) {
    // Get campaign metrics
    const stats = await CampaignModel.getStats(campaign.campaign_id);

    if (!stats || stats.impressions < 100) {
      // Not enough data, use default score
      return 1.0;
    }

    const ctr = stats.clicks / stats.impressions;

    // Normalize CTR to quality score (0.5 to 1.5 range)
    // Average CTR is assumed to be around 2%
    const averageCTR = 0.02;
    const qualityScore = 0.5 + (ctr / averageCTR);

    return Math.min(Math.max(qualityScore, 0.5), 1.5);
  }

  /**
   * Process bid deduction after impression is served
   */
  static async processBidDeduction(campaignId, bidPrice) {
    // Convert CPM to per-impression cost
    const impressionCost = bidPrice / 1000;

    return CampaignModel.deductBudget(campaignId, impressionCost);
  }

  /**
   * Get bid landscape for reporting
   */
  static async getBidLandscape(segment) {
    const campaigns = await CampaignModel.findActiveBySegment(segment);

    return Promise.all(campaigns.map(async campaign => ({
      campaign_id: campaign.campaign_id,
      advertiser: campaign.advertiser_name,
      bid_amount: campaign.bid_amount,
      quality_score: await this.getQualityScore(campaign),
      budget_remaining: campaign.budget_remaining
    }))).then(results => results.sort((a, b) => b.bid_amount - a.bid_amount));
  }

  /**
   * Estimate winning bid for a segment
   */
  static estimateWinningBid(segment) {
    const landscape = this.getBidLandscape(segment);

    if (landscape.length === 0) {
      return { estimated_bid: 0, competition_level: 'none' };
    }

    const avgBid = landscape.reduce((sum, c) => sum + c.bid_amount, 0) / landscape.length;
    const maxBid = Math.max(...landscape.map(c => c.bid_amount));

    let competitionLevel = 'low';
    if (landscape.length > 5) competitionLevel = 'medium';
    if (landscape.length > 10) competitionLevel = 'high';

    return {
      estimated_bid: parseFloat(avgBid.toFixed(2)),
      max_bid: maxBid,
      active_campaigns: landscape.length,
      competition_level: competitionLevel
    };
  }

  /**
   * Optimize bid recommendation for an advertiser
   */
  static getRecommendedBid(targetSegments, targetCTR = 0.02) {
    let totalBid = 0;
    let count = 0;

    for (const segment of targetSegments) {
      const estimate = this.estimateWinningBid(segment);
      if (estimate.active_campaigns > 0) {
        totalBid += estimate.max_bid * 1.1; // Recommend 10% above max to win
        count++;
      }
    }

    if (count === 0) {
      return { recommended_bid: 1.0, note: 'No competition data available' };
    }

    return {
      recommended_bid: parseFloat((totalBid / count).toFixed(2)),
      note: 'Based on current competition levels'
    };
  }
}

module.exports = BiddingService;
