const logger = require('../utils/logger');
const { API_ERRORS } = require('../config/constants');

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Validation error handler
 */
function handleValidationError(err, req, res) {
  logger.warn('Validation error', {
    path: req.path,
    method: req.method,
    error: err.message,
    details: err.details
  });

  return res.status(400).json({
    error: 'VALIDATION_ERROR',
    message: err.message,
    details: err.details
  });
}

/**
 * Database error handler
 */
function handleDatabaseError(err, req, res) {
  logger.error('Database error', {
    path: req.path,
    method: req.method,
    error: err.message,
    code: err.code
  });

  // SQLite busy or PostgreSQL deadlock
  if (err.code === 'SQLITE_BUSY' || err.code === '40P01') {
    return res.status(API_ERRORS.SERVICE_UNAVAILABLE.status).json({
      error: API_ERRORS.SERVICE_UNAVAILABLE.code,
      message: 'Database temporarily unavailable',
      retry_after: 5
    });
  }

  // SQLite constraint violation
  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.status(400).json({
      error: 'CONSTRAINT_VIOLATION',
      message: 'Data constraint violation'
    });
  }

  return res.status(500).json({
    error: API_ERRORS.INTERNAL_ERROR.code,
    message: 'Database error occurred'
  });
}

/**
 * Main error handler middleware
 */
function errorHandler(err, req, res, _next) {
  // Log all errors
  logger.error({
    message: err.message,
    stack: err.stack,
    endpoint: req.path,
    method: req.method,
    request_id: req.id
  });

  // Handle known API errors
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.code,
      message: err.message,
      details: err.details,
      request_id: req.id
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError' || err.type === 'validation') {
    return handleValidationError(err, req, res);
  }

  // Handle database errors
  if (err.code && typeof err.code === 'string' && (err.code.startsWith('SQLITE_') || err.code.match(/^\d{5}$/))) {
    return handleDatabaseError(err, req, res);
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'INVALID_JSON',
      message: 'Invalid JSON in request body'
    });
  }

  // Handle timeout errors
  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    return res.status(504).json({
      error: 'TIMEOUT',
      message: 'Request timed out'
    });
  }

  // Default error response
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const exposeErrors = process.env.EXPOSE_ERRORS === 'true';
  const shouldExposeStack = isDevelopment || exposeErrors;

  res.status(500).json({
    error: API_ERRORS.INTERNAL_ERROR.code,
    message: shouldExposeStack ? err.message : API_ERRORS.INTERNAL_ERROR.message,
    request_id: req.id,
    ...(shouldExposeStack && { stack: err.stack })
  });
}

/**
 * Not found handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: API_ERRORS.NOT_FOUND.code,
    message: `Route ${req.method} ${req.path} not found`
  });
}

/**
 * Request ID middleware
 */
function requestIdMiddleware(req, res, next) {
  const { generateRequestId } = require('../utils/crypto');
  req.id = generateRequestId();
  res.setHeader('X-Request-ID', req.id);
  next();
}

module.exports = {
  ApiError,
  errorHandler,
  notFoundHandler,
  requestIdMiddleware
};
