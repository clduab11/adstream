require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { initDatabase } = require('./src/config/database');
const { authMiddleware } = require('./src/middleware/auth.middleware');
const { generalLimiter } = require('./src/middleware/rateLimit.middleware');
const {
  errorHandler,
  notFoundHandler,
  requestIdMiddleware
} = require('./src/middleware/errorHandler.middleware');
const routes = require('./src/routes');
const logger = require('./src/utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
try {
  initDatabase();
  logger.info('Database initialized successfully');
} catch (error) {
  logger.error('Failed to initialize database', { error: error.message });
  process.exit(1);
}

// Security middleware
app.use(helmet());
app.use(cors());

// Request parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request ID for tracking
app.use(requestIdMiddleware);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    if (process.env.DEBUG === 'true') {
      logger.debug('Request completed', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
        request_id: req.id
      });
    }
  });

  next();
});

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Authentication
app.use('/api', authMiddleware);

// Rate limiting
app.use('/api', generalLimiter);

// API routes
app.use('/api/v1', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`ADSTREAM server started`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    db_type: process.env.DB_TYPE || 'sqlite'
  });

  const portStr = String(PORT);
  const envStr = (process.env.NODE_ENV || 'development');
  
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║                                               ║
  ║   ADSTREAM - Retail Media Network Server      ║
  ║                                               ║
  ║   Server running on port ${portStr.padEnd(19)}║
  ║   Environment: ${envStr.padEnd(28)}║
  ║                                               ║
  ║   API Docs: http://localhost:${portStr}/api/v1${' '.repeat(13 - portStr.length)}║
  ║   Health:   http://localhost:${portStr}/health${' '.repeat(15 - portStr.length)}║
  ║                                               ║
  ╚═══════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    const { closeDatabase } = require('./src/config/database');
    closeDatabase();
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    const { closeDatabase } = require('./src/config/database');
    closeDatabase();
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = app;
