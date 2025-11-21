const { query, queryOne } = require('../config/database');
const { generateImpressionId, generateClickId } = require('../utils/crypto');

/**
 * Tracking Model - Handles impression and click data
 */
class TrackingModel {
  /**
   * Record a new impression
   */
  static async createImpression(data) {
    const impressionId = data.impression_id || generateImpressionId();
    const timestamp = new Date().toISOString();

    const sql = `
      INSERT INTO impressions (
        impression_id, campaign_id, user_id, timestamp,
        device_type, placement
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    const params = [
      impressionId,
      data.campaign_id,
      data.user_id,
      timestamp,
      data.device_type || 'desktop',
      data.placement || 'homepage_banner'
    ];

    await query(sql, params);
    return { impression_id: impressionId, timestamp };
  }

  /**
   * Find impression by ID
   */
  static async findImpressionById(impressionId) {
    const sql = 'SELECT * FROM impressions WHERE impression_id = $1';
    return queryOne(sql, [impressionId]);
  }

  /**
   * Check if impression exists
   */
  static async impressionExists(impressionId) {
    const sql = 'SELECT 1 FROM impressions WHERE impression_id = $1';
    const result = await queryOne(sql, [impressionId]);
    return !!result;
  }

  /**
   * Record a click
   */
  static async createClick(data) {
    const clickId = generateClickId();
    const timestamp = new Date().toISOString();

    const sql = `
      INSERT INTO clicks (
        click_id, impression_id, campaign_id, user_id,
        timestamp, redirect_url
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    const params = [
      clickId,
      data.impression_id,
      data.campaign_id,
      data.user_id,
      timestamp,
      data.redirect_url || null
    ];

    await query(sql, params);
    return { click_id: clickId, timestamp };
  }

  /**
   * Check if click already recorded for impression
   */
  static async clickExistsForImpression(impressionId) {
    const sql = 'SELECT 1 FROM clicks WHERE impression_id = $1';
    const result = await queryOne(sql, [impressionId]);
    return !!result;
  }

  /**
   * Get impression count for user within time window (for frequency capping)
   */
  static async getUserImpressionCount(userId, campaignId, hoursWindow = 24) {
    const cutoffTime = new Date(Date.now() - hoursWindow * 60 * 60 * 1000).toISOString();

    const sql = `
      SELECT COUNT(*) as count
      FROM impressions
      WHERE user_id = $1 AND campaign_id = $2 AND timestamp >= $3
    `;

    const result = await queryOne(sql, [userId, campaignId, cutoffTime]);
    // Coerce COUNT(*) result to number for arithmetic operations
    return result ? Number(result.count) : 0;
  }

  /**
   * Get campaign metrics for a date range
   */
  static async getCampaignMetrics(campaignId, startDate, endDate) {
    const impressionsSql = `
      SELECT
        COUNT(*) as impressions,
        device_type,
        placement
      FROM impressions
      WHERE campaign_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
      GROUP BY device_type, placement
    `;

    const clicksSql = `
      SELECT COUNT(*) as clicks
      FROM clicks
      WHERE campaign_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
    `;

    const impressionsBySegmentSql = `
      SELECT
        u.segment,
        COUNT(i.impression_id) as impressions,
        COUNT(c.click_id) as clicks
      FROM impressions i
      LEFT JOIN users u ON i.user_id = u.user_id
      LEFT JOIN clicks c ON i.impression_id = c.impression_id
      WHERE i.campaign_id = $1
        AND i.timestamp >= $2
        AND i.timestamp <= $3
      GROUP BY u.segment
    `;

    const impressionDetailsResult = await query(impressionsSql, [campaignId, startDate, endDate]);
    const clickResult = await queryOne(clicksSql, [campaignId, startDate, endDate]);
    const segmentDataResult = await query(impressionsBySegmentSql, [campaignId, startDate, endDate]);

    const impressionDetails = impressionDetailsResult.rows || impressionDetailsResult;
    const segmentData = segmentDataResult.rows || segmentDataResult;

    // Aggregate totals
    let totalImpressions = 0;
    const byDevice = {};
    const byPlacement = {};

    for (const row of impressionDetails) {
      // Coerce COUNT(*) to number
      const impressions = Number(row.impressions);
      totalImpressions += impressions;

      if (!byDevice[row.device_type]) {
        byDevice[row.device_type] = { impressions: 0 };
      }
      byDevice[row.device_type].impressions += impressions;

      if (!byPlacement[row.placement]) {
        byPlacement[row.placement] = { impressions: 0 };
      }
      byPlacement[row.placement].impressions += impressions;
    }

    const totalClicks = clickResult ? Number(clickResult.clicks) : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    return {
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr: parseFloat(ctr.toFixed(2)),
      by_segment: segmentData.map(row => ({
        segment: row.segment,
        impressions: Number(row.impressions),
        clicks: Number(row.clicks),
        ctr: Number(row.impressions) > 0
          ? parseFloat(((Number(row.clicks) / Number(row.impressions)) * 100).toFixed(2))
          : 0
      })),
      by_device: Object.entries(byDevice).map(([device, data]) => ({
        device,
        ...data
      })),
      by_placement: Object.entries(byPlacement).map(([placement, data]) => ({
        placement,
        ...data
      }))
    };
  }

  /**
   * Get recent impressions for a campaign
   */
  static async getRecentImpressions(campaignId, limit = 100) {
    const sql = `
      SELECT * FROM impressions
      WHERE campaign_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;
    const result = await query(sql, [campaignId, limit]);
    return result.rows || result;
  }

  /**
   * Get recent clicks for a campaign
   */
  static async getRecentClicks(campaignId, limit = 100) {
    const sql = `
      SELECT * FROM clicks
      WHERE campaign_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;
    const result = await query(sql, [campaignId, limit]);
    return result.rows || result;
  }

  /**
   * Delete old tracking data (for maintenance)
   */
  static async deleteOldData(daysToKeep = 90) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

    const deleteImpressions = await query(
      'DELETE FROM impressions WHERE timestamp < $1',
      [cutoffDate]
    );

    const deleteClicks = await query(
      'DELETE FROM clicks WHERE timestamp < $1',
      [cutoffDate]
    );

    // Support both SQLite (changes) and PostgreSQL (rowCount)
    return {
      impressions_deleted: deleteImpressions.changes || deleteImpressions.rowCount || 0,
      clicks_deleted: deleteClicks.changes || deleteClicks.rowCount || 0
    };
  }

  /**
   * Get overall platform statistics
   */
  static async getPlatformStats() {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM impressions) as total_impressions,
        (SELECT COUNT(*) FROM clicks) as total_clicks,
        (SELECT COUNT(DISTINCT campaign_id) FROM impressions) as active_campaigns,
        (SELECT COUNT(DISTINCT user_id) FROM impressions) as unique_users
    `;
    return queryOne(sql);
  }
}

module.exports = TrackingModel;
