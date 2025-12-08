const axios = require('axios');
const logger = require('./logger');
require('dotenv').config();

class AIProcessor {
  constructor() {
    this.enabled = process.env.AI_ENABLED === 'true';
    this.provider = process.env.AI_PROVIDER || 'gemini';
    this.apiKey = this.getApiKey();
    this.dailyCallCount = 0;
    this.dailyLimit = 10000;
  }

  getApiKey() {
    switch (this.provider) {
      case 'gemini':
        return process.env.GEMINI_API_KEY;
      case 'claude':
        return process.env.CLAUDE_API_KEY;
      case 'openai':
        return process.env.OPENAI_API_KEY;
      default:
        return null;
    }
  }

  async process(prompt, text) {
    if (!this.enabled || !this.apiKey) {
      logger.warn('AI processing disabled or no API key');
      return null;
    }

    if (this.dailyCallCount >= this.dailyLimit) {
      logger.warn('AI daily limit reached');
      return null;
    }

    try {
      this.dailyCallCount++;
      
      switch (this.provider) {
        case 'gemini':
          return await this.processWithGemini(prompt, text);
        case 'claude':
          return await this.processWithClaude(prompt, text);
        case 'openai':
          return await this.processWithOpenAI(prompt, text);
        default:
          return null;
      }
    } catch (error) {
      logger.error('AI processing error:', error.message);
      return null;
    }
  }

  async processWithGemini(prompt, text) {
    const fullPrompt = prompt.replace('{text}', text);
    
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`,
      {
        contents: [{
          parts: [{
            text: fullPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1000,
        }
      }
    );

    const result = response.data.candidates[0]?.content?.parts[0]?.text;
    
    // Try to parse JSON response
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }

  async processWithClaude(prompt, text) {
    const fullPrompt = prompt.replace('{text}', text);
    
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: fullPrompt
        }]
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );

    const result = response.data.content[0]?.text;
    
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }

  async processWithOpenAI(prompt, text) {
    const fullPrompt = prompt.replace('{text}', text);
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: fullPrompt
        }],
        temperature: 0.3,
        max_tokens: 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const result = response.data.choices[0]?.message?.content;
    
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }

  resetDailyCount() {
    this.dailyCallCount = 0;
    logger.info('AI daily call count reset');
  }
}

module.exports = new AIProcessor();