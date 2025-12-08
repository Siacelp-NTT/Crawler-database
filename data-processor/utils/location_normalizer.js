const logger = require('../services/logger');
const aiProcessor = require('../services/ai_processor');

class LocationNormalizer {
  normalizeLocation(locationText, config) {
    if (!locationText) return { city: null, country: config.location?.default_country || 'VNM', isRemote: false };

    const method = config.location?.method || 'manual';
    
    // Try manual normalization first
    if (method === 'manual' || method === 'ai') {
      const manualResult = this.normalizeManual(locationText, config.location);
      if (manualResult) return manualResult;
    }

    // Fall back to AI if enabled
    if (config.location?.ai_fallback?.enabled) {
      return this.normalizeWithAI(locationText, config.location.ai_fallback.prompt);
    }

    return { 
      city: locationText, 
      country: config.location?.default_country || 'VNM', 
      isRemote: false 
    };
  }

  normalizeManual(locationText, locationConfig) {
    const cityMappings = locationConfig?.city_mappings || {};
    const countryPatterns = locationConfig?.country_patterns || [];
    const remoteKeywords = locationConfig?.remote_keywords || [];
    const hybridKeywords = locationConfig?.hybrid_keywords || [];

    // Check if remote
    const isRemote = remoteKeywords.some(keyword => 
      locationText.toLowerCase().includes(keyword.toLowerCase())
    );

    const isHybrid = hybridKeywords.some(keyword => 
      locationText.toLowerCase().includes(keyword.toLowerCase())
    );

    // Map city name
    let city = locationText;
    for (const [key, value] of Object.entries(cityMappings)) {
      if (locationText.includes(key)) {
        city = value;
        break;
      }
    }

    // Detect country
    let countryCode = locationConfig.default_country || 'VNM';
    for (const pattern of countryPatterns) {
      const regex = new RegExp(pattern.regex, 'i');
      if (regex.test(locationText)) {
        countryCode = pattern.code;
        break;
      }
    }

    return {
      city: isRemote ? 'Remote' : city,
      country: countryCode,
      isRemote,
      isHybrid
    };
  }

  async normalizeWithAI(locationText, prompt) {
    try {
      const result = await aiProcessor.process(prompt, locationText);
      if (result && typeof result === 'object') {
        return {
          city: result.city || locationText,
          country: result.country_code || 'VNM',
          isRemote: result.is_remote || false
        };
      }
    } catch (error) {
      logger.error('AI location normalization failed:', error.message);
    }
    
    return null;
  }
}

module.exports = new LocationNormalizer();