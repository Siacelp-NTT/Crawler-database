const BaseProcessor = require('./BaseProcessor');
const logger = require('../services/logger');

class CareerVietProcessor extends BaseProcessor {
  constructor() {
    super('CareerViet', 'config/careerviet.yaml');
  }

  async transformJob(rawJob, globalConfig) {
    // Use base transformation
    const baseJob = await super.transformJob(rawJob, globalConfig);
    
    // Add any CareerViet-specific processing here
    // For example, special handling of Vietnamese text
    
    return baseJob;
  }

  // Override if needed for platform-specific logic
  async processDescription(descriptionText) {
    // CareerViet-specific description processing
    // For now, use base implementation
    return super.processDescription(descriptionText);
  }
}

module.exports = CareerVietProcessor;