const logger = require('../services/logger');
const aiProcessor = require('../services/ai_processor');

class DateParser {
  parseDate(dateText, config) {
    if (!dateText) return null;

    const method = config.date?.method || 'manual';
    
    // Try manual parsing first
    if (method === 'manual' || method === 'ai') {
      const manualResult = this.parseManual(dateText, config.date);
      if (manualResult) return manualResult;
    }

    // Fall back to AI if enabled
    if (config.date?.ai_fallback?.enabled) {
      return this.parseWithAI(dateText, config.date.ai_fallback.prompt);
    }

    return null;
  }

  parseManual(dateText, dateConfig) {
    // Try relative date patterns first
    const relativePatterns = dateConfig?.relative || [];
    for (const pattern of relativePatterns) {
      try {
        const regex = new RegExp(pattern.regex, 'i');
        const match = dateText.match(regex);
        
        if (match) {
          return this.calculateRelativeDate(match[1], pattern.unit);
        }
      } catch (error) {
        logger.warn(`Invalid date regex: ${pattern.regex}`);
      }
    }

    // Try absolute date formats
    const formats = dateConfig?.formats || [];
    for (const format of formats) {
      const parsed = this.tryParseFormat(dateText, format);
      if (parsed) return parsed;
    }

    return null;
  }

  calculateRelativeDate(value, unit) {
    const now = new Date();
    const amount = parseInt(value);
    
    switch (unit) {
      case 'days':
        now.setDate(now.getDate() - amount);
        break;
      case 'weeks':
        now.setDate(now.getDate() - (amount * 7));
        break;
      case 'months':
        now.setMonth(now.getMonth() - amount);
        break;
      default:
        return null;
    }
    
    return now.toISOString().split('T')[0];
  }

  tryParseFormat(dateText, format) {
    // Simple format parsing (you can enhance this)
    try {
      const date = new Date(dateText);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch {
      return null;
    }
    
    return null;
  }

  async parseWithAI(dateText, prompt) {
    try {
      const currentDate = new Date().toISOString().split('T')[0];
      const fullPrompt = prompt.replace('{text}', dateText).replace('{current_date}', currentDate);
      
      const result = await aiProcessor.process(fullPrompt, '');
      
      // Validate date format YYYY-MM-DD
      if (typeof result === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(result)) {
        return result;
      }
    } catch (error) {
      logger.error('AI date parsing failed:', error.message);
    }
    
    return null;
  }
}

module.exports = new DateParser();