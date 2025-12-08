const winston = require('winston');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output with colors and emojis
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    let emoji = '📝';
    if (level.includes('error')) emoji = '❌';
    else if (level.includes('warn')) emoji = '⚠️';
    else if (level.includes('info')) emoji = 'ℹ️';
    else if (level.includes('debug')) emoji = '🔍';
    
    let msg = `${timestamp} [${service}] ${emoji} ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    
    return msg;
  })
);

// File format (JSON for parsing)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'data-processor' },
  transports: [
    // Error logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Combined logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Processing stats log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'stats.log'),
      level: 'info',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 3,
    }),
  ],
});

// Console output (always enabled, even in production for monitoring)
logger.add(new winston.transports.Console({
  format: consoleFormat,
  level: process.env.LOG_LEVEL || 'info'
}));

// Helper methods for structured logging
logger.logProcessing = (platform, message, data = {}) => {
  logger.info(message, { platform, ...data });
};

logger.logStats = (stats) => {
  logger.info('Processing Statistics', stats);
};

logger.logError = (context, error, data = {}) => {
  logger.error(`${context}: ${error.message}`, {
    error: error.stack,
    ...data
  });
};

module.exports = logger;