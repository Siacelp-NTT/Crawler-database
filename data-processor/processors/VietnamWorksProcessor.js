const BaseProcessor = require('./BaseProcessor');
const logger = require('../services/logger');

class VietnamWorksProcessor extends BaseProcessor {
  constructor() {
    super('VietnamWorks', 'config/vietnamworks.yaml');
  }

  async transformJob(rawJob, globalConfig) {
    const baseJob = await super.transformJob(rawJob, globalConfig);
    
    // VietnamWorks-specific processing
    
    return baseJob;
  }
}

module.exports = VietnamWorksProcessor;