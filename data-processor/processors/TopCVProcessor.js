const BaseProcessor = require('./BaseProcessor');
const logger = require('../services/logger');

class TopCVProcessor extends BaseProcessor {
  constructor() {
    super('TopCV', 'config/topcv.yaml');
  }

  async transformJob(rawJob, globalConfig) {
    const baseJob = await super.transformJob(rawJob, globalConfig);
    
    // TopCV-specific processing
    
    return baseJob;
  }
}

module.exports = TopCVProcessor;