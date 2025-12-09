const fs = require('fs');
const yaml = require('js-yaml');
const logger = require('../services/logger');
const db = require('../services/database');

class BaseProcessor {
  constructor(platformName, configFile) {
    this.platformName = platformName;
    this.configFile = configFile;
    this.config = this.loadConfig();
    this.stats = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: []
    };
  }

  loadConfig() {
    try {
      const fileContents = fs.readFileSync(this.configFile, 'utf8');
      const config = yaml.load(fileContents);
      logger.info(`✅ Loaded config for ${this.platformName}`);
      return config;
    } catch (error) {
      logger.error(`❌ Failed to load config for ${this.platformName}:`, error.message);
      throw error;
    }
  }

  async processJobs(rawJobs, globalConfig) {
    logger.info(`Processing ${rawJobs.length} jobs from ${this.platformName}`);
    
    const processedJobs = [];
    
    for (const rawJob of rawJobs) {
      try {
        this.stats.processed++;
        const processedJob = await this.transformJob(rawJob, globalConfig);
        
        if (processedJob) {
          processedJobs.push(processedJob);
          this.stats.success++;
        } else {
          this.stats.failed++;
          logger.warn(`Failed to transform job: ${rawJob.job_title}`);
        }
      } catch (error) {
        this.stats.failed++;
        this.stats.errors.push({
          job_id: rawJob.job_id,
          job_title: rawJob.job_title,
          error: error.message
        });
        logger.error(`Error processing job ${rawJob.job_id}:`, error.message);
      }
    }
    
    return processedJobs;
  }

  async transformJob(rawJob, globalConfig) {
    // Parse salary
    const salaryInfo = salaryParser.parseSalary(rawJob.salary, this.config);
    
    // Map experience level
    const experienceLevel = await experienceMapper.mapExperience(rawJob.experience_level, this.config);
    const experienceLevelId = experienceMapper.getExperienceLevelId(experienceLevel);
    
    // Normalize location
    const locationInfo = locationNormalizer.normalizeLocation(rawJob.location, this.config);
    
    // Parse date
    const postedDate = dateParser.parseDate(rawJob.listed_time, this.config) || new Date().toISOString().split('T')[0];
    
    // Process description (AI or manual)
    const description = await this.processDescription(rawJob.description);
    
    // Get currency ID
    const currencyId = this.getCurrencyId(salaryInfo?.currency, globalConfig);
    
    // Get platform ID
    const platformId = globalConfig.reference_tables.platforms[this.platformName] || 
                       this.config.platform_id;
    
    return {
      // Company info
      company: {
        name: rawJob.company_name,
        location: rawJob.company_location,
        domain: this.extractDomain(rawJob.company_url)
      },
      
      // Job info
      title: rawJob.job_title,
      description: description,
      salaryPerMonth: salaryInfo?.average || null,
      currencyId: currencyId,
      experienceLevelId: experienceLevelId,
      location: locationInfo.city,
      countryCode: locationInfo.country,
      applicantCount: rawJob.applies ? parseInt(rawJob.applies) : null,
      postedDate: postedDate,
      platformId: platformId,
      postUrl: rawJob.url,
      crawledTime: rawJob.crawled_time,
      
      // Raw job ID for marking as processed
      rawJobId: rawJob.job_id
    };
  }

  async processDescription(descriptionText) {
    if (!descriptionText) return null;
    
    const descConfig = this.config.description;
    
    if (descConfig?.method === 'ai' && descConfig?.ai_processing?.enabled) {
      try {
        const prompt = descConfig.ai_processing.prompt || 
          `Clean this job description, remove HTML, keep only relevant info: {text}`;
        
        const result = await aiProcessor.process(prompt, descriptionText);
        
        if (result && typeof result === 'object' && result.cleaned_description) {
          return result.cleaned_description;
        } else if (typeof result === 'string') {
          return result;
        }
      } catch (error) {
        logger.warn('AI description processing failed, using original');
      }
    }
    
    // Simple HTML cleanup if AI not used
    return this.simpleCleanHtml(descriptionText);
  }

  simpleCleanHtml(html) {
    if (!html) return null;
    // Remove HTML tags
    return html.replace(/<[^>]*>/g, ' ')
               .replace(/\s+/g, ' ')
               .trim()
               .substring(0, 10000); // Limit length
  }

  extractDomain(url) {
    if (!url) return null;
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  getCurrencyId(currency, globalConfig) {
    const currencyMap = globalConfig.reference_tables.currencies;
    return currencyMap[currency] || currencyMap['VND']; // Default to VND
  }

  validateJob(job) {
    const requiredFields = this.config.quality_checks?.required_fields || [];
    
    for (const field of requiredFields) {
      if (!job[field]) {
        logger.warn(`Missing required field: ${field}`);
        return false;
      }
    }
    
    // Check title length
    const maxTitleLength = this.config.quality_checks?.max_title_length || 500;
    if (job.title && job.title.length > maxTitleLength) {
      logger.warn(`Title too long: ${job.title.length} characters`);
      return false;
    }
    
    return true;
  }

  getStats() {
    return this.stats;
  }

  resetStats() {
    this.stats = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: []
    };
  }

  /**
   * Process a single raw job
   * Must be implemented by child classes
   */
  async processJob(rawJob) {
    throw new Error('processJob() must be implemented by child class');
  }

  /**
   * Find or create company in clean database
   * Returns company UUID
   */
  async findOrCreateCompany(companyName, companyUrl, companyLocation) {
    try {
      // Extract domain from URL
      let domain = null;
      if (companyUrl) {
        try {
          const url = new URL(companyUrl);
          domain = url.hostname.replace('www.', '');
        } catch (error) {
          logger.warn(`Invalid company URL: ${companyUrl}`);
        }
      }

      // Use the database service's duplicate-safe create
      const companyId = await db.createCompany(
        companyName,
        domain,
        companyLocation
      );

      return companyId;
      
    } catch (error) {
      logger.error(`Error finding/creating company: ${companyName}`, error);
      throw error;
    }
  }

  /**
   * Insert job into clean database with duplicate checking
   * Returns { created: boolean, jobId: UUID }
   */
  async insertCleanJob(jobData) {
    try {
      // Validate required fields
      if (!jobData.company_id) {
        throw new Error('company_id is required');
      }
      if (!jobData.title) {
        throw new Error('title is required');
      }
      if (!jobData.post_url) {
        throw new Error('post_url is required');
      }

      // Set platform ID
      jobData.platform_id = this.platformId;

      // Use the database service's duplicate-safe create
      const result = await db.createJobPost(jobData);
      
      return result;
      
    } catch (error) {
      logger.error(`Error inserting job: ${jobData.title}`, error);
      throw error;
    }
  }

  /**
   * Batch process multiple jobs
   */
  async batchProcess(rawJobs) {
    const results = {
      total: rawJobs.length,
      processed: 0,
      created: 0,
      skipped: 0,
      errors: 0,
      processedJobIds: [],
      errors_detail: []
    };

    logger.info(`Processing ${rawJobs.length} jobs from ${this.platformName}`);

    for (const rawJob of rawJobs) {
      try {
        // Process the job
        const cleanJob = await this.processJob(rawJob);

        if (!cleanJob) {
          logger.warn(`Processor returned null for job: ${rawJob.job_id}`);
          results.errors++;
          results.errors_detail.push({
            job_id: rawJob.job_id,
            title: rawJob.job_title,
            error: 'Processor returned null'
          });
          continue;
        }

        // Insert into clean database with duplicate checking
        const { created, jobId } = await this.insertCleanJob(cleanJob);

        if (created) {
          results.created++;
          logger.info(`✅ Created job: ${cleanJob.title} (${jobId})`);
        } else {
          results.skipped++;
          logger.info(`⏭️  Skipped duplicate: ${cleanJob.title} (${jobId})`);
        }

        results.processed++;
        results.processedJobIds.push(rawJob.job_id);

      } catch (error) {
        results.errors++;
        results.errors_detail.push({
          job_id: rawJob.job_id,
          title: rawJob.job_title,
          error: error.message
        });
        logger.error(`Error processing job ${rawJob.job_id}:`, error);
      }
    }

    // Mark processed jobs in raw database
    if (results.processedJobIds.length > 0) {
      await db.markJobsAsProcessed(results.processedJobIds);
      logger.info(`Marked ${results.processedJobIds.length} jobs as processed in raw DB`);
    }

    return results;
  }

  /**
   * Log processing results
   */
  logResults(results) {
    logger.info('='.repeat(60));
    logger.info(`${this.platformName} Processing Results:`);
    logger.info(`  Total: ${results.total}`);
    logger.info(`  Processed: ${results.processed}`);
    logger.info(`  Created: ${results.created}`);
    logger.info(`  Skipped (duplicates): ${results.skipped}`);
    logger.info(`  Errors: ${results.errors}`);
    logger.info('='.repeat(60));

    if (results.errors > 0 && results.errors_detail.length > 0) {
      logger.warn('Errors detail:');
      results.errors_detail.forEach(err => {
        logger.warn(`  - ${err.title}: ${err.error}`);
      });
    }
  }
}

module.exports = BaseProcessor;