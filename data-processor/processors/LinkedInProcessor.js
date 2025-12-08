const BaseProcessor = require('./BaseProcessor');
const logger = require('../services/logger');

class LinkedInProcessor extends BaseProcessor {
  constructor() {
    super('LinkedIn', 'config/linkedin.yaml');
  }

  async transformJob(rawJob, globalConfig) {
    const baseJob = await super.transformJob(rawJob, globalConfig);
    
    // LinkedIn-specific processing
    // Example: LinkedIn often has structured data
    
    return baseJob;
  }
}

module.exports = LinkedInProcessor;