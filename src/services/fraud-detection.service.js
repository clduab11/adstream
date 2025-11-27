const { queryOne } = require('../config/database');
const { verifyImpressionId } = require('../utils/crypto');
const logger = require('../utils/logger');

/**
 * Fraud Detection Service - Validates impressions and clicks
 */
class FraudDetectionService {
  // In-memory cache for recent impressions (simulates Redis)
  static impressionCache = new Map();
  static clickCache = new Map();

  // Cache TTL in milliseconds (24 hours)
  static CACHE_TTL = 24 * 60 * 60 * 1000;

  /**
   * Validate an impression ID
   * Returns validation result with reason if invalid
   */
  static validateImpression(impressionId) {
    // Check signature format
    if (!verifyImpressionId(impressionId)) {
      return {
        valid: false,
        reason: 'INVALID_SIGNATURE',
        message: 'Impression ID signature is invalid'
      };
    }

    // Check for duplicate in cache
    if (this.impressionCache.has(impressionId)) {
      return {
        valid: false,
        reason: 'DUPLICATE_IMPRESSION',
        message: 'Impression already recorded'
      };
    }

    return { valid: true };
  }

  /**
   * Validate a click event
   */
  static async validateClick(impressionId, userId) {
    // Check impression ID format
    if (!verifyImpressionId(impressionId)) {
      return {
        valid: false,
        reason: 'INVALID_IMPRESSION_ID',
        message: 'Invalid impression ID format'
      };
    }

    // Check if impression exists
    const impression = await queryOne(
      'SELECT * FROM impressions WHERE impression_id = $1',
      [impressionId]
    );

    if (!impression) {
      logger.warn('Click fraud attempt: impression not found', {
        impression_id: impressionId,
        user_id: userId
      });

      return {
        valid: false,
        reason: 'IMPRESSION_NOT_FOUND',
        message: 'Impression does not exist'
      };
    }

    // Check if impression is within valid time window (24 hours)
    const impressionTime = new Date(impression.timestamp);
    const now = new Date();
    const hoursSinceImpression = (now - impressionTime) / (1000 * 60 * 60);

    if (hoursSinceImpression > 24) {
      logger.warn('Click fraud attempt: expired impression', {
        impression_id: impressionId,
        hours_since: hoursSinceImpression
      });

      return {
        valid: false,
        reason: 'IMPRESSION_EXPIRED',
        message: 'Impression has expired (>24 hours old)'
      };
    }

    // Check if click already exists
    if (this.clickCache.has(impressionId)) {
      return {
        valid: false,
        reason: 'DUPLICATE_CLICK',
        message: 'Click already recorded for this impression'
      };
    }

    // Verify user match
    if (impression.user_id !== userId) {
      logger.warn('Click fraud attempt: user mismatch', {
        impression_id: impressionId,
        impression_user: impression.user_id,
        click_user: userId
      });

      return {
        valid: false,
        reason: 'USER_MISMATCH',
        message: 'User ID does not match impression'
      };
    }

    // Check for rapid clicking patterns
    const rapidClickCheck = await this.checkRapidClicking(userId);
    if (!rapidClickCheck.valid) {
      return rapidClickCheck;
    }

    return {
      valid: true,
      impression
    };
  }

  /**
   * Check for rapid clicking patterns (bot detection)
   */
  static async checkRapidClicking(userId, windowMinutes = 1, maxClicks = 10) {
    const cutoffTime = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    const result = await queryOne(
      `SELECT COUNT(*) as click_count
       FROM clicks
       WHERE user_id = $1 AND timestamp >= $2`,
      [userId, cutoffTime]
    );

    if (result && result.click_count >= maxClicks) {
      logger.warn('Click fraud attempt: rapid clicking detected', {
        user_id: userId,
        clicks_in_window: result.click_count,
        window_minutes: windowMinutes
      });

      return {
        valid: false,
        reason: 'RAPID_CLICKING',
        message: `Too many clicks in ${windowMinutes} minute window`
      };
    }

    return { valid: true };
  }

  /**
   * Record impression in cache
   */
  static cacheImpression(impressionId) {
    this.impressionCache.set(impressionId, Date.now());
    this.cleanupCache();
  }

  /**
   * Record click in cache
   */
  static cacheClick(impressionId) {
    this.clickCache.set(impressionId, Date.now());
    this.cleanupCache();
  }

  /**
   * Clean up expired cache entries
   */
  static cleanupCache() {
    const now = Date.now();

    // Clean impression cache
    for (const [key, timestamp] of this.impressionCache.entries()) {
      if (now - timestamp > this.CACHE_TTL) {
        this.impressionCache.delete(key);
      }
    }

    // Clean click cache
    for (const [key, timestamp] of this.clickCache.entries()) {
      if (now - timestamp > this.CACHE_TTL) {
        this.clickCache.delete(key);
      }
    }
  }

  /**
   * Get fraud metrics for reporting
   */
  static getFraudMetrics(startDate, endDate) {
    // This would typically query a fraud events log table
    // For now, return simulated metrics
    return {
      period: { start: startDate, end: endDate },
      invalid_impressions: 0,
      duplicate_clicks: 0,
      expired_clicks: 0,
      rapid_clicking_events: 0,
      user_mismatch_events: 0,
      fraud_rate: 0
    };
  }

  /**
   * Check IP-based fraud patterns
   * (Simplified - in production would use IP intelligence service)
   */
  static checkIpPattern(_ipAddress, _userId) {
    // Placeholder for IP-based fraud detection
    // Would check for:
    // - Known bot/proxy IPs
    // - Geographic anomalies
    // - Multiple users from same IP
    return { valid: true };
  }

  /**
   * Analyze user for suspicious behavior patterns
   */
  static async analyzeUserBehavior(userId) {
    // Calculate cutoff date in JavaScript (database-agnostic)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const sql = `
      SELECT
        COUNT(DISTINCT i.impression_id) as impressions,
        COUNT(DISTINCT c.click_id) as clicks,
        CASE
          WHEN COUNT(DISTINCT i.impression_id) > 0
          THEN CAST(COUNT(DISTINCT c.click_id) AS FLOAT) / COUNT(DISTINCT i.impression_id)
          ELSE 0
        END as ctr
      FROM impressions i
      LEFT JOIN clicks c ON i.impression_id = c.impression_id
      WHERE i.user_id = $1
        AND i.timestamp >= $2
    `;

    const result = await queryOne(sql, [userId, sevenDaysAgo]);

    if (!result) {
      return { suspicious: false };
    }

    // Flag if CTR is abnormally high (>50%)
    if (result.ctr > 0.5 && result.impressions > 10) {
      return {
        suspicious: true,
        reason: 'ABNORMAL_CTR',
        ctr: result.ctr,
        impressions: result.impressions,
        clicks: result.clicks
      };
    }

    return { suspicious: false };
  }

  /**
   * Clear all caches (for testing)
   */
  static clearCaches() {
    this.impressionCache.clear();
    this.clickCache.clear();
  }
}

module.exports = FraudDetectionService;
