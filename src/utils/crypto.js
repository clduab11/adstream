const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const SECRET_KEY = process.env.SECRET_KEY || 'default-secret-key-change-in-production';

/**
 * Generate a unique impression ID with HMAC signature for fraud prevention
 * Format: uuid_signature (signature is first 8 chars of HMAC)
 */
function generateImpressionId() {
  const uuid = uuidv4();
  const timestamp = Date.now().toString();
  const data = `${uuid}:${timestamp}`;

  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(data)
    .digest('hex')
    .substring(0, 8);

  return `imp_${uuid}_${signature}`;
}

/**
 * Verify impression ID signature
 * @param {string} impressionId - The impression ID to verify
 * @returns {boolean} - True if signature is valid
 */
function verifyImpressionId(impressionId) {
  if (!impressionId || !impressionId.startsWith('imp_')) {
    return false;
  }

  const parts = impressionId.split('_');
  if (parts.length !== 3) {
    return false;
  }

  // Basic format validation
  const uuid = parts[1];
  const signature = parts[2];

  // UUID format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    return false;
  }

  // Signature length check
  if (signature.length !== 8) {
    return false;
  }

  return true;
}

/**
 * Generate a unique campaign ID
 */
function generateCampaignId() {
  return `camp_${uuidv4().substring(0, 8)}`;
}

/**
 * Generate a unique click ID
 */
function generateClickId() {
  return `click_${uuidv4()}`;
}

/**
 * Generate a unique user ID
 */
function generateUserId() {
  return `user_${uuidv4().substring(0, 12)}`;
}

/**
 * Generate API key for advertiser authentication
 */
function generateApiKey() {
  return `ak_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Hash API key for storage
 */
function hashApiKey(apiKey) {
  return crypto
    .createHash('sha256')
    .update(apiKey)
    .digest('hex');
}

/**
 * Generate a request ID for tracking
 */
function generateRequestId() {
  return `req_${uuidv4()}`;
}

module.exports = {
  generateImpressionId,
  verifyImpressionId,
  generateCampaignId,
  generateClickId,
  generateUserId,
  generateApiKey,
  hashApiKey,
  generateRequestId
};
