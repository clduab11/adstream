const { query, queryOne } = require('../config/database');
const { generateCampaignId } = require('../utils/crypto');
const { CAMPAIGN_STATUS } = require('../config/constants');

/**
 * Campaign Model - Handles campaign data access and management
 */
class CampaignModel {
  /**
   * Create a new campaign
   */
  static create(campaignData) {
    const campaignId = campaignData.campaign_id || generateCampaignId();

    const sql = `
      INSERT INTO campaigns (
        campaign_id, advertiser_name, target_segments, ad_creative_url,
        redirect_url, bid_amount, budget_total, budget_remaining,
        start_date, end_date, status, frequency_cap, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;

    const targetSegments = Array.isArray(campaignData.target_segments)
      ? JSON.stringify(campaignData.target_segments)
      : campaignData.target_segments;

    const params = [
      campaignId,
      campaignData.advertiser_name,
      targetSegments,
      campaignData.ad_creative_url,
      campaignData.redirect_url || null,
      campaignData.bid_amount,
      campaignData.budget_total || campaignData.budget_remaining,
      campaignData.budget_remaining,
      campaignData.start_date,
      campaignData.end_date,
      campaignData.status || CAMPAIGN_STATUS.ACTIVE,
      campaignData.frequency_cap || 3,
      new Date().toISOString()
    ];

    query(sql, params);
    return this.findById(campaignId);
  }

  /**
   * Find campaign by ID
   */
  static findById(campaignId) {
    const sql = 'SELECT * FROM campaigns WHERE campaign_id = $1';
    const campaign = queryOne(sql, [campaignId]);

    if (campaign && typeof campaign.target_segments === 'string') {
      campaign.target_segments = JSON.parse(campaign.target_segments);
    }

    return campaign;
  }

  /**
   * Find active campaigns targeting a specific segment
   */
  static findActiveBySegment(segment) {
    const now = new Date().toISOString();

    const sql = `
      SELECT * FROM campaigns
      WHERE status = $1
        AND budget_remaining > 0
        AND start_date <= $2
        AND end_date >= $2
        AND (
          target_segments LIKE $3
          OR target_segments LIKE $4
          OR target_segments LIKE $5
        )
      ORDER BY bid_amount DESC
    `;

    const campaigns = query(sql, [
      CAMPAIGN_STATUS.ACTIVE,
      now,
      `%"${segment}"%`,
      `%'${segment}'%`,
      `%${segment}%`
    ]);

    return campaigns.map(campaign => {
      if (typeof campaign.target_segments === 'string') {
        campaign.target_segments = JSON.parse(campaign.target_segments);
      }
      return campaign;
    });
  }

  /**
   * Get all active campaigns
   */
  static findAllActive() {
    const now = new Date().toISOString();

    const sql = `
      SELECT * FROM campaigns
      WHERE status = $1
        AND budget_remaining > 0
        AND start_date <= $2
        AND end_date >= $2
      ORDER BY bid_amount DESC
    `;

    const campaigns = query(sql, [CAMPAIGN_STATUS.ACTIVE, now]);

    return campaigns.map(campaign => {
      if (typeof campaign.target_segments === 'string') {
        campaign.target_segments = JSON.parse(campaign.target_segments);
      }
      return campaign;
    });
  }

  /**
   * Update campaign
   */
  static update(campaignId, updates) {
    const allowedFields = [
      'advertiser_name', 'target_segments', 'ad_creative_url',
      'redirect_url', 'bid_amount', 'budget_remaining',
      'start_date', 'end_date', 'status', 'frequency_cap'
    ];

    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        let value = updates[field];
        if (field === 'target_segments' && Array.isArray(value)) {
          value = JSON.stringify(value);
        }
        setClauses.push(`${field} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return this.findById(campaignId);
    }

    params.push(campaignId);
    const sql = `
      UPDATE campaigns SET ${setClauses.join(', ')}
      WHERE campaign_id = $${paramIndex}
    `;

    query(sql, params);
    return this.findById(campaignId);
  }

  /**
   * Deduct from campaign budget
   */
  static deductBudget(campaignId, amount) {
    const sql = `
      UPDATE campaigns
      SET budget_remaining = budget_remaining - $1
      WHERE campaign_id = $2 AND budget_remaining >= $1
    `;

    const result = query(sql, [amount, campaignId]);
    return result.changes > 0;
  }

  /**
   * Get campaign statistics
   */
  static getStats(campaignId) {
    const sql = `
      SELECT
        c.campaign_id,
        c.advertiser_name,
        c.budget_total,
        c.budget_remaining,
        c.bid_amount,
        c.status,
        COALESCE(imp.impression_count, 0) as impressions,
        COALESCE(clk.click_count, 0) as clicks
      FROM campaigns c
      LEFT JOIN (
        SELECT campaign_id, COUNT(*) as impression_count
        FROM impressions
        WHERE campaign_id = $1
        GROUP BY campaign_id
      ) imp ON c.campaign_id = imp.campaign_id
      LEFT JOIN (
        SELECT campaign_id, COUNT(*) as click_count
        FROM clicks
        WHERE campaign_id = $1
        GROUP BY campaign_id
      ) clk ON c.campaign_id = clk.campaign_id
      WHERE c.campaign_id = $1
    `;

    return queryOne(sql, [campaignId]);
  }

  /**
   * Get all campaigns with pagination
   */
  static findAll(offset = 0, limit = 100) {
    const sql = `
      SELECT * FROM campaigns
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const campaigns = query(sql, [limit, offset]);

    return campaigns.map(campaign => {
      if (typeof campaign.target_segments === 'string') {
        campaign.target_segments = JSON.parse(campaign.target_segments);
      }
      return campaign;
    });
  }

  /**
   * Delete campaign
   */
  static delete(campaignId) {
    const sql = 'DELETE FROM campaigns WHERE campaign_id = $1';
    return query(sql, [campaignId]);
  }
}

module.exports = CampaignModel;
