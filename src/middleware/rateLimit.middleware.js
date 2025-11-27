const rateLimit = require('express-rate-limit');
const { API_ERRORS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Create rate limiter with custom configuration
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 3600000; // 1 hour
  const max = options.max || parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use API key as rate limit key, fallback to IP
      return req.headers['x-api-key'] || req.ip;
    },
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        key: req.headers['x-api-key'] || req.ip,
        path: req.path
      });

      res.status(API_ERRORS.RATE_LIMITED.status).json({
        error: API_ERRORS.RATE_LIMITED.code,
        message: API_ERRORS.RATE_LIMITED.message,
        retry_after: Math.ceil(windowMs / 1000)
      });
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/api/health';
    }
  });
}

// Default rate limiter for general API endpoints
const generalLimiter = createRateLimiter();

// Stricter rate limiter for ad requests (higher volume expected)
const adRequestLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  max: 100 // 100 requests per minute
});

// Relaxed rate limiter for analytics endpoints
const analyticsLimiter = createRateLimiter({
  windowMs: 3600000, // 1 hour
  max: 500
});

module.exports = {
  createRateLimiter,
  generalLimiter,
  adRequestLimiter,
  analyticsLimiter
};
