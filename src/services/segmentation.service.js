const { query } = require('../config/database');
const { SEGMENTS, SEGMENTATION_RULES } = require('../config/constants');

/**
 * Segmentation Service - Calculates and manages user segments
 */
class SegmentationService {
  /**
   * Calculate the primary segment for a user based on their data
   */
  static calculateSegment(user) {
    const now = new Date();

    // Check for frequent buyers (10+ purchases in last 90 days)
    if (user.total_purchases >= SEGMENTATION_RULES.FREQUENT_BUYERS_MIN_PURCHASES) {
      const lastPurchase = user.last_purchase_date ? new Date(user.last_purchase_date) : null;
      if (lastPurchase) {
        const daysSinceLastPurchase = (now - lastPurchase) / (1000 * 60 * 60 * 24);
        if (daysSinceLastPurchase <= SEGMENTATION_RULES.FREQUENT_BUYERS_DAYS) {
          return SEGMENTS.FREQUENT_BUYERS;
        }
      }
    }

    // Check for high LTV (average order value > $150)
    if (user.average_order_value >= SEGMENTATION_RULES.HIGH_LTV_MIN_AOV) {
      return SEGMENTS.HIGH_LTV;
    }

    // Check for churned users (no activity in 90+ days)
    const createdAt = new Date(user.created_at);
    const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24);

    if (user.last_purchase_date) {
      const lastPurchase = new Date(user.last_purchase_date);
      const daysSinceLastPurchase = (now - lastPurchase) / (1000 * 60 * 60 * 24);

      if (daysSinceLastPurchase >= SEGMENTATION_RULES.CHURNED_MIN_DAYS) {
        return SEGMENTS.CHURNED_USERS;
      }

      if (daysSinceLastPurchase >= SEGMENTATION_RULES.AT_RISK_MIN_DAYS &&
          daysSinceLastPurchase < SEGMENTATION_RULES.AT_RISK_MAX_DAYS) {
        return SEGMENTS.AT_RISK_USERS;
      }
    }

    // Check for new customers (registered within 30 days, <3 purchases)
    if (daysSinceCreation <= SEGMENTATION_RULES.NEW_CUSTOMER_DAYS &&
        user.total_purchases < SEGMENTATION_RULES.NEW_CUSTOMER_MAX_PURCHASES) {
      return SEGMENTS.NEW_CUSTOMERS;
    }

    // Default to active users
    return SEGMENTS.ACTIVE_USERS;
  }

  /**
   * Update all user segments based on current data
   */
  static async recalculateAllSegments() {
    const users = query('SELECT * FROM users');
    let updated = 0;

    for (const user of users) {
      const newSegment = this.calculateSegment(user);
      if (newSegment !== user.segment) {
        query(
          'UPDATE users SET segment = $1 WHERE user_id = $2',
          [newSegment, user.user_id]
        );
        updated++;
      }
    }

    return { total_users: users.length, updated };
  }

  /**
   * Get all available segments with user counts
   */
  static getAvailableSegments(minSize = 0) {
    const sql = `
      SELECT
        segment,
        COUNT(*) as user_count,
        AVG(average_order_value) as avg_order_value,
        AVG(total_purchases) as avg_purchases
      FROM users
      GROUP BY segment
      HAVING COUNT(*) >= $1
      ORDER BY user_count DESC
    `;

    const results = query(sql, [minSize]);

    return results.map(row => ({
      segment: row.segment,
      user_count: row.user_count,
      avg_order_value: parseFloat(row.avg_order_value?.toFixed(2) || 0),
      avg_purchases: parseFloat(row.avg_purchases?.toFixed(2) || 0),
      description: this.getSegmentDescription(row.segment)
    }));
  }

  /**
   * Get human-readable description for a segment
   */
  static getSegmentDescription(segment) {
    const descriptions = {
      [SEGMENTS.FREQUENT_BUYERS]: 'Users with 10+ purchases in the last 90 days',
      [SEGMENTS.HIGH_LTV]: 'Users with average order value over $150',
      [SEGMENTS.CART_ABANDONERS]: 'Users who abandoned their cart in the last 24 hours',
      [SEGMENTS.NEW_CUSTOMERS]: 'Users registered in the last 30 days with fewer than 3 purchases',
      [SEGMENTS.SEASONAL_SHOPPERS]: 'Users who primarily purchase during specific periods',
      [SEGMENTS.ACTIVE_USERS]: 'Users who visited in the last 7 days',
      [SEGMENTS.AT_RISK_USERS]: 'Users with no activity in 30-60 days',
      [SEGMENTS.CHURNED_USERS]: 'Users with no activity in 90+ days'
    };

    return descriptions[segment] || 'Unknown segment';
  }

  /**
   * Get users matching multiple segment criteria
   */
  static getUsersByMultipleSegments(segments) {
    if (!segments || segments.length === 0) {
      return [];
    }

    const placeholders = segments.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `
      SELECT * FROM users
      WHERE segment IN (${placeholders})
      ORDER BY total_purchases DESC
    `;

    return query(sql, segments);
  }

  /**
   * Check if a user belongs to any of the specified segments
   */
  static userMatchesSegments(user, targetSegments) {
    if (!targetSegments || targetSegments.length === 0) {
      return true; // No targeting = all users match
    }

    return targetSegments.includes(user.segment);
  }

  /**
   * Get segment performance metrics
   */
  static getSegmentPerformance() {
    const sql = `
      SELECT
        u.segment,
        COUNT(DISTINCT u.user_id) as users,
        COUNT(i.impression_id) as impressions,
        COUNT(c.click_id) as clicks,
        CASE
          WHEN COUNT(i.impression_id) > 0
          THEN CAST(COUNT(c.click_id) AS FLOAT) / COUNT(i.impression_id) * 100
          ELSE 0
        END as ctr
      FROM users u
      LEFT JOIN impressions i ON u.user_id = i.user_id
      LEFT JOIN clicks c ON i.impression_id = c.impression_id
      GROUP BY u.segment
      ORDER BY ctr DESC
    `;

    const results = query(sql);

    return results.map(row => ({
      ...row,
      ctr: parseFloat(row.ctr?.toFixed(2) || 0)
    }));
  }

  /**
   * Predict segment for a new user based on initial data
   */
  static predictInitialSegment(userData) {
    // New users with high initial purchase get special treatment
    if (userData.average_order_value >= SEGMENTATION_RULES.HIGH_LTV_MIN_AOV) {
      return SEGMENTS.HIGH_LTV;
    }

    return SEGMENTS.NEW_CUSTOMERS;
  }
}

module.exports = SegmentationService;
