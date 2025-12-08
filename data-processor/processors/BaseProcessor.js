const fs = require('fs');
const yaml = require('js-yaml');
const logger = require('../services/logger');
const salaryParser = require('../utils/salary_parser');
const experienceMapper = require('../utils/experience_mapper');
const locationNormalizer = require('../utils/location_normalizer');
const dateParser = require('../utils/date_parser');
const aiProcessor = require('../services/ai_processor');

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
}

module.exports = BaseProcessor;