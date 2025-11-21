const { API_ERRORS } = require('../config/constants');
const logger = require('../utils/logger');
const { hashApiKey } = require('../utils/crypto');

/**
 * Get API keys from environment variables
 * Note: This is called at module load time, so API keys are loaded once at startup.
 * To reload keys from environment variables without restarting, use reloadApiKeys().
 * In production, API_KEYS environment variable must be set or startup will fail.
 */
const getValidApiKeys = () => {
  const keys = new Set();
  
  // Load from environment variable (comma-separated list of keys)
  const envKeys = process.env.API_KEYS || '';
  if (envKeys) {
    envKeys.split(',').forEach(key => {
      const trimmedKey = key.trim();
      if (trimmedKey) {
        keys.add(hashApiKey(trimmedKey));
      }
    });
  }
  
  // Add demo keys only in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    keys.add(hashApiKey('ak_demo_key_12345'));
    keys.add(hashApiKey('ak_test_advertiser_key'));
  } else if (keys.size === 0) {
    throw new Error('No API keys configured. Set API_KEYS environment variable in production.');
  }
  
  return keys;
};

// Initialize valid API keys at module load time
let validApiKeys = getValidApiKeys();

/**
 * Reload API keys from environment variables
 * Useful for runtime configuration updates without server restart
 */
function reloadApiKeys() {
  validApiKeys = getValidApiKeys();
  return validApiKeys.size;
}

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

  // Validate API key by comparing hashes
  const hashedKey = hashApiKey(apiKey);
  if (!validApiKeys.has(hashedKey)) {
    logger.warn('Authentication failed: Invalid API key', {
      path: req.path,
      ip: req.ip
    });

    return res.status(API_ERRORS.UNAUTHORIZED.status).json({
      error: API_ERRORS.UNAUTHORIZED.code,
      message: API_ERRORS.UNAUTHORIZED.message
    });
  }

  // Add API key info to request for logging (use hash for security)
  req.apiKey = hashedKey;
  next();
}

/**
 * Add a new API key (for testing/admin purposes)
 */
function addApiKey(key) {
  validApiKeys.add(hashApiKey(key));
}

/**
 * Remove an API key
 */
function removeApiKey(key) {
  validApiKeys.delete(hashApiKey(key));
}

/**
 * Check if an API key is valid
 */
function isValidApiKey(key) {
  return validApiKeys.has(hashApiKey(key));
}

module.exports = {
  authMiddleware,
  addApiKey,
  removeApiKey,
  isValidApiKey,
  reloadApiKeys
};
