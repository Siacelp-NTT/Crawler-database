const BaseProcessor = require('./BaseProcessor');
const logger = require('../services/logger');

class ITviecProcessor extends BaseProcessor {
  constructor() {
    super('ITviec', 'config/itviec.yaml');
  }

  async transformJob(rawJob, globalConfig) {
    const baseJob = await super.transformJob(rawJob, globalConfig);
    
    // ITviec-specific processing
    
    return baseJob;
  }
}

module.exports = ITviecProcessor;