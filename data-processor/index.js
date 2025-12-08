const fs = require('fs');
const yaml = require('js-yaml');
const cron = require('node-cron');
const logger = require('./services/logger');
const db = require('./services/database');
const aiProcessor = require('./services/ai_processor');

// Import processors
const CareerVietProcessor = require('./processors/CareerVietProcessor');
const LinkedInProcessor = require('./processors/LinkedInProcessor');
const ITviecProcessor = require('./processors/ITviecProcessor');
const TopCVProcessor = require('./processors/TopCVProcessor');
const VietnamWorksProcessor = require('./processors/VietnamWorksProcessor');

class DataProcessorApp {
  constructor() {
    this.globalConfig = this.loadGlobalConfig();
    this.processors = this.initializeProcessors();
    this.isProcessing = false;
  }

  loadGlobalConfig() {
    try {
      const fileContents = fs.readFileSync('config/global.yaml', 'utf8');
      const config = yaml.load(fileContents);
      logger.info('✅ Global configuration loaded');
      return config;
    } catch (error) {
      logger.error('❌ Failed to load global config:', error.message);
      process.exit(1);
    }
  }

  initializeProcessors() {
    const processors = {};
    const processorClasses = {
      'CareerVietProcessor': CareerVietProcessor,
      'LinkedInProcessor': LinkedInProcessor,
      'ITviecProcessor': ITviecProcessor,
      'TopCVProcessor': TopCVProcessor,
      'VietnamWorksProcessor': VietnamWorksProcessor
    };

    for (const [platformKey, platformConfig] of Object.entries(this.globalConfig.platforms)) {
      if (platformConfig.enabled) {
        const ProcessorClass = processorClasses[platformConfig.processor_class];
        if (ProcessorClass) {
          processors[platformKey] = new ProcessorClass();
          logger.info(`✅ Initialized ${platformConfig.name} processor`);
        } else {
          logger.warn(`⚠️  Processor class ${platformConfig.processor_class} not found`);
        }
      }
    }

    return processors;
  }

  async start() {
    logger.info('==================================================');
    logger.info('🚀 Job Crawler Data Processor Started');
    logger.info('==================================================');

    // Test database connections
    const dbConnected = await db.testConnections();
    if (!dbConnected) {
      logger.error('Cannot start without database connection');
      process.exit(1);
    }

    // Create logs directory if it doesn't exist
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs');
    }

    const runMode = process.env.RUN_MODE || 'cron';

    if (runMode === 'once') {
      // Run once and exit
      logger.info('Running in single-run mode');
      await this.processAllPlatforms();
      await this.shutdown();
    } else {
      // Run on schedule
      const schedule = process.env.PROCESS_INTERVAL || '*/5 * * * *';
      logger.info(`Running in cron mode: ${schedule}`);
      
      // Run immediately on start
      await this.processAllPlatforms();
      
      // Schedule recurring runs
      cron.schedule(schedule, async () => {
        if (!this.isProcessing) {
          await this.processAllPlatforms();
        } else {
          logger.warn('Previous processing still running, skipping this cycle');
        }
      });

      // Reset AI daily counter at midnight
      cron.schedule('0 0 * * *', () => {
        aiProcessor.resetDailyCount();
      });

      logger.info('✅ Scheduler started. Press Ctrl+C to stop.');
    }
  }

  async processAllPlatforms() {
    if (this.isProcessing) {
      logger.warn('Processing already in progress');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();
    
    logger.info('');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🔄 Starting data processing cycle');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const batchSize = parseInt(process.env.BATCH_SIZE) || this.globalConfig.settings.batch_size || 100;
    
    // Sort platforms by priority
    const sortedPlatforms = Object.entries(this.processors)
      .sort(([keyA, procA], [keyB, procB]) => {
        const priorityA = this.globalConfig.platforms[keyA]?.priority || 999;
        const priorityB = this.globalConfig.platforms[keyB]?.priority || 999;
        return priorityA - priorityB;
      });

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const [platformKey, processor] of sortedPlatforms) {
      try {
        const platformName = this.globalConfig.platforms[platformKey].name;
        logger.info(`\n📊 Processing ${platformName}...`);

        // Get unprocessed jobs from raw database
        const rawJobs = await db.getUnprocessedJobs(platformName, batchSize);
        
        if (rawJobs.length === 0) {
          logger.info(`✓ No unprocessed jobs for ${platformName}`);
          continue;
        }

        logger.info(`Found ${rawJobs.length} unprocessed jobs`);

        // Transform jobs
        const transformedJobs = await processor.processJobs(rawJobs, this.globalConfig);

        // Insert into clean database
        let inserted = 0;
        const processedJobIds = [];

        for (const job of transformedJobs) {
          try {
            // Upsert company
            const companyId = await db.upsertCompany(job.company);

            // Insert job post
            const jobId = await db.insertJobPost({
              companyId,
              title: job.title,
              description: job.description,
              salaryPerMonth: job.salaryPerMonth,
              currencyId: job.currencyId,
              experienceLevelId: job.experienceLevelId,
              location: job.location,
              countryCode: job.countryCode,
              applicantCount: job.applicantCount,
              postedDate: job.postedDate,
              platformId: job.platformId,
              postUrl: job.postUrl,
              crawledTime: job.crawledTime
            });

            if (jobId) {
              inserted++;
              processedJobIds.push(job.rawJobId);
            }
          } catch (error) {
            logger.error(`Failed to insert job: ${job.title}`, error.message);
          }
        }

        // Mark jobs as processed in raw database
        if (processedJobIds.length > 0) {
          await db.markJobsProcessed(processedJobIds);
          logger.info(`✅ Inserted ${inserted} jobs, marked ${processedJobIds.length} as processed`);
        }

        const stats = processor.getStats();
        totalProcessed += stats.processed;
        totalSuccess += stats.success;
        totalFailed += stats.failed;

        logger.info(`Stats - Processed: ${stats.processed}, Success: ${stats.success}, Failed: ${stats.failed}`);
        
        // Log errors if any
        if (stats.errors.length > 0) {
          logger.warn(`Errors encountered: ${stats.errors.length}`);
          stats.errors.slice(0, 5).forEach(err => {
            logger.error(`  - ${err.job_title}: ${err.error}`);
          });
        }

        processor.resetStats();

      } catch (error) {
        logger.error(`Error processing ${platformKey}:`, error.message);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info('');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('✅ Processing cycle completed');
    logger.info(`📈 Total: ${totalProcessed} | Success: ${totalSuccess} | Failed: ${totalFailed}`);
    logger.info(`⏱️  Duration: ${duration}s`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('');

    this.isProcessing = false;
  }

  async shutdown() {
    logger.info('Shutting down gracefully...');
    await db.close();
    logger.info('✅ Shutdown complete');
    process.exit(0);
  }
}

// Start the application
const app = new DataProcessorApp();
app.start();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('\nReceived SIGINT signal');
  await app.shutdown();
});

process.on('SIGTERM', async () => {
  logger.info('\nReceived SIGTERM signal');
  await app.shutdown();
});