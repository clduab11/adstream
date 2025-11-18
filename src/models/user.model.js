const { query, queryOne } = require('../config/database');
const { generateUserId } = require('../utils/crypto');

/**
 * User Model - Handles user data access and management
 */
class UserModel {
  /**
   * Create a new user
   */
  static create(userData) {
    const userId = userData.user_id || generateUserId();
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO users (
        user_id, username, email, segment, total_purchases,
        average_order_value, last_purchase_date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    const params = [
      userId,
      userData.username,
      userData.email || null,
      userData.segment || 'new_customers',
      userData.total_purchases || 0,
      userData.average_order_value || 0,
      userData.last_purchase_date || null,
      now
    ];

    query(sql, params);
    return this.findById(userId);
  }

  /**
   * Find user by ID
   */
  static findById(userId) {
    const sql = 'SELECT * FROM users WHERE user_id = $1';
    return queryOne(sql, [userId]);
  }

  /**
   * Find user by username
   */
  static findByUsername(username) {
    const sql = 'SELECT * FROM users WHERE username = $1';
    return queryOne(sql, [username]);
  }

  /**
   * Update user data
   */
  static update(userId, updates) {
    const allowedFields = [
      'username', 'email', 'segment', 'total_purchases',
      'average_order_value', 'last_purchase_date'
    ];

    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        params.push(updates[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return this.findById(userId);
    }

    params.push(userId);
    const sql = `
      UPDATE users SET ${setClauses.join(', ')}
      WHERE user_id = $${paramIndex}
    `;

    query(sql, params);
    return this.findById(userId);
  }

  /**
   * Get users by segment
   */
  static findBySegment(segment, limit = 100) {
    const sql = `
      SELECT * FROM users
      WHERE segment = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    return query(sql, [segment, limit]);
  }

  /**
   * Get all users with pagination
   */
  static findAll(offset = 0, limit = 100) {
    const sql = `
      SELECT * FROM users
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    return query(sql, [limit, offset]);
  }

  /**
   * Count users by segment
   */
  static countBySegment() {
    const sql = `
      SELECT segment, COUNT(*) as count
      FROM users
      GROUP BY segment
      ORDER BY count DESC
    `;
    return query(sql);
  }

  /**
   * Delete user
   */
  static delete(userId) {
    const sql = 'DELETE FROM users WHERE user_id = $1';
    return query(sql, [userId]);
  }

  /**
   * Check if user exists
   */
  static exists(userId) {
    const sql = 'SELECT 1 FROM users WHERE user_id = $1';
    const result = queryOne(sql, [userId]);
    return !!result;
  }

  /**
   * Get user purchase statistics
   */
  static getPurchaseStats(userId) {
    const sql = `
      SELECT
        total_purchases,
        average_order_value,
        last_purchase_date,
        CAST(total_purchases * average_order_value AS DECIMAL(10,2)) as lifetime_value
      FROM users
      WHERE user_id = $1
    `;
    return queryOne(sql, [userId]);
  }
}

module.exports = UserModel;
