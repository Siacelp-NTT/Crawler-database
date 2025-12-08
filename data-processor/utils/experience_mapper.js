const logger = require('../services/logger');
const aiProcessor = require('../services/ai_processor');

class ExperienceMapper {
  constructor() {
    // Reference mapping from global.yaml
    this.referenceMap = {
      'Internship': 1,
      'Entry': 2,
      'Mid': 3,
      'Senior': 4,
      'Lead': 5,
      'Executive': 6
    };
  }

  async mapExperience(experienceText, config) {
    if (!experienceText) return config.experience_level?.default || 'Entry';

    const method = config.experience_level?.method || 'manual';
    
    // Try manual mapping first
    if (method === 'manual' || method === 'ai') {
      const manualResult = this.mapManual(experienceText, config.experience_level);
      if (manualResult) return manualResult;
    }

    // Fall back to AI if enabled
    if (config.experience_level?.ai_fallback?.enabled) {
      const aiResult = await this.mapWithAI(experienceText, config.experience_level.ai_fallback.prompt);
      if (aiResult) return aiResult;
    }

    return config.experience_level?.default || 'Entry';
  }

  mapManual(experienceText, experienceConfig) {
    const mappings = experienceConfig?.mappings || {};
    
    // Direct match
    if (mappings[experienceText]) {
      return mappings[experienceText];
    }

    // Case-insensitive partial match
    const lowerText = experienceText.toLowerCase();
    for (const [key, value] of Object.entries(mappings)) {
      if (lowerText.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerText)) {
        return value;
      }
    }

    return null;
  }

  async mapWithAI(experienceText, prompt) {
    try {
      const result = await aiProcessor.process(prompt, experienceText);
      // Validate result is one of the valid levels
      if (this.referenceMap[result]) {
        return result;
      }
    } catch (error) {
      logger.error('AI experience mapping failed:', error.message);
    }
    
    return null;
  }

  getExperienceLevelId(experienceName) {
    return this.referenceMap[experienceName] || 2; // Default to Entry (ID: 2)
  }
}

module.exports = new ExperienceMapper();