const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Ensure SECRET_KEY is set in production
let SECRET_KEY;
if (!process.env.SECRET_KEY) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SECRET_KEY environment variable must be set in production for secure HMAC signature generation.'
    );
  } else {
    console.warn(
      'WARNING: Using default secret key for HMAC signature generation. ' +
      'Set the SECRET_KEY environment variable to a strong value in production.'
    );
    SECRET_KEY = 'default-secret-key-change-in-production';
  }
} else {
  SECRET_KEY = process.env.SECRET_KEY;
}

/**
 * Generate a unique impression ID with HMAC signature for fraud prevention
 * Format: imp_uuid_signature (signature is first 8 chars of HMAC)
 */
function generateImpressionId() {
  const uuid = uuidv4();

  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(uuid)
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
  const providedSignature = parts[2];

  // UUID format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    return false;
  }

  // Signature length and format check (must be valid hex)
  if (providedSignature.length !== 8 || !/^[0-9a-f]{8}$/i.test(providedSignature)) {
    return false;
  }

  // Recompute HMAC signature and verify
  // Note: We only use UUID for signature since timestamp is not in the final ID format
  const expectedSignature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(uuid)
    .digest('hex')
    .substring(0, 8);

  // Use timing-safe comparison to prevent timing attacks
  try {
    const providedBuffer = Buffer.from(providedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
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
