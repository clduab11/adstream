const winston = require('winston');
const path = require('path');

const logLevel = process.env.LOG_LEVEL || 'info';

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// JSON format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Create transports array
const transports = [
  new winston.transports.Console({
    format: consoleFormat
  })
];

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  const fs = require('fs');
  const logsDir = path.join(process.cwd(), 'logs');

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat
    })
  );
}

const logger = winston.createLogger({
  level: logLevel,
  transports
});

// Create child logger for specific modules
logger.child = (metadata) => {
  return winston.createLogger({
    level: logLevel,
    defaultMeta: metadata,
    transports
  });
};

module.exports = logger;
