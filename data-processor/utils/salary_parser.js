const logger = require('../services/logger');
const aiProcessor = require('../services/ai_processor');

class SalaryParser {
  parseSalary(salaryText, config) {
    if (!salaryText) return null;

    const method = config.salary?.method || 'manual';
    
    // Try manual patterns first
    if (method === 'manual' || method === 'ai') {
      const manualResult = this.parseManual(salaryText, config.salary);
      if (manualResult) return manualResult;
    }

    // Fall back to AI if enabled
    if (config.salary?.ai_fallback?.enabled && method === 'ai') {
      return this.parseWithAI(salaryText, config.salary.ai_fallback.prompt);
    }

    return null;
  }

  parseManual(salaryText, salaryConfig) {
    const patterns = salaryConfig?.patterns || [];
    
    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern.regex, 'i');
        const match = salaryText.match(regex);
        
        if (match) {
          return this.extractSalaryFromMatch(match, pattern, salaryConfig);
        }
      } catch (error) {
        logger.warn(`Invalid regex pattern: ${pattern.regex}`);
      }
    }
    
    return null;
  }

  extractSalaryFromMatch(match, pattern, salaryConfig) {
    const multiplier = pattern.multiplier || 1;
    const currency = pattern.currency || match[pattern.currency_group] || salaryConfig.default_currency;
    
    switch (pattern.type) {
      case 'range':
        const min = this.cleanNumber(match[pattern.min_group]) * multiplier;
        const max = this.cleanNumber(match[pattern.max_group]) * multiplier;
        return {
          min,
          max,
          average: (min + max) / 2,
          currency,
          type: 'range'
        };
      
      case 'min':
        const minVal = this.cleanNumber(match[pattern.value_group]) * multiplier;
        return {
          min: minVal,
          max: null,
          average: minVal,
          currency,
          type: 'min'
        };
      
      case 'max':
        const maxVal = this.cleanNumber(match[pattern.value_group]) * multiplier;
        return {
          min: null,
          max: maxVal,
          average: maxVal,
          currency,
          type: 'max'
        };
      
      case 'exact':
        const exact = this.cleanNumber(match[pattern.value_group]) * multiplier;
        return {
          min: exact,
          max: exact,
          average: exact,
          currency,
          type: 'exact'
        };
      
      case 'negotiable':
        return {
          min: null,
          max: null,
          average: null,
          currency: salaryConfig.default_currency,
          type: 'negotiable'
        };
      
      default:
        return null;
    }
  }

  cleanNumber(str) {
    if (!str) return 0;
    // Remove commas, spaces, and convert to number
    return parseFloat(str.toString().replace(/,/g, '').replace(/\s/g, ''));
  }

  async parseWithAI(salaryText, prompt) {
    try {
      const result = await aiProcessor.process(prompt, salaryText);
      if (result && typeof result === 'object') {
        return {
          min: result.min || null,
          max: result.max || null,
          average: result.min && result.max ? (result.min + result.max) / 2 : (result.min || result.max),
          currency: result.currency || 'VND',
          type: result.type || 'unknown'
        };
      }
    } catch (error) {
      logger.error('AI salary parsing failed:', error.message);
    }
    
    return null;
  }
}

module.exports = new SalaryParser();