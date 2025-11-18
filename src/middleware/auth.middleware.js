const { API_ERRORS } = require('../config/constants');
const logger = require('../utils/logger');

// In-memory API key store (in production, use database)
const validApiKeys = new Set([
  'ak_demo_key_12345', // Demo key for testing
  'ak_test_advertiser_key'
]);

/**
 * Authentication middleware
 * Validates API key from request header
 */
function authMiddleware(req, res, next) {
  const apiKeyHeader = process.env.API_KEY_HEADER || 'x-api-key';
  const apiKey = req.headers[apiKeyHeader];

  // Skip auth for health check
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }

  // Check if API key is provided
  if (!apiKey) {
    logger.warn('Authentication failed: No API key provided', {
      path: req.path,
      ip: req.ip
    });

    return res.status(API_ERRORS.UNAUTHORIZED.status).json({
      error: API_ERRORS.UNAUTHORIZED.code,
      message: API_ERRORS.UNAUTHORIZED.message
    });
  }

  // Validate API key
  if (!validApiKeys.has(apiKey)) {
    logger.warn('Authentication failed: Invalid API key', {
      path: req.path,
      ip: req.ip
    });

    return res.status(API_ERRORS.UNAUTHORIZED.status).json({
      error: API_ERRORS.UNAUTHORIZED.code,
      message: API_ERRORS.UNAUTHORIZED.message
    });
  }

  // Add API key info to request for logging
  req.apiKey = apiKey;
  next();
}

/**
 * Add a new API key (for testing/admin purposes)
 */
function addApiKey(key) {
  validApiKeys.add(key);
}

/**
 * Remove an API key
 */
function removeApiKey(key) {
  validApiKeys.delete(key);
}

/**
 * Check if an API key is valid
 */
function isValidApiKey(key) {
  return validApiKeys.has(key);
}

module.exports = {
  authMiddleware,
  addApiKey,
  removeApiKey,
  isValidApiKey
};
