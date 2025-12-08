const { Pool } = require('pg');
const logger = require('./logger');
require('dotenv').config();

class DatabaseService {
  constructor() {
    // Raw database pool
    this.rawPool = new Pool({
      host: process.env.RAW_DB_HOST,
      port: process.env.RAW_DB_PORT,
      database: process.env.RAW_DB_NAME,
      user: process.env.RAW_DB_USER,
      password: process.env.RAW_DB_PASSWORD,
      client_encoding: 'UTF8' // Force UTF8 encoding
    });

    // Clean database pool
    this.cleanPool = new Pool({
      host: process.env.CLEAN_DB_HOST,
      port: process.env.CLEAN_DB_PORT,
      database: process.env.CLEAN_DB_NAME,
      user: process.env.CLEAN_DB_USER,
      password: process.env.CLEAN_DB_PASSWORD,
      client_encoding: 'UTF8' // Force UTF8 encoding
    });

    // Set encoding on pool creation
    this.rawPool.on('connect', (client) => {
      client.query("SET CLIENT_ENCODING TO 'UTF8'");
    });

    this.cleanPool.on('connect', (client) => {
      client.query("SET CLIENT_ENCODING TO 'UTF8'");
    });
  }

  async testConnections() {
    try {
      await this.rawPool.query('SELECT NOW()');
      logger.info('✅ Connected to Raw DB');
      
      await this.cleanPool.query('SELECT NOW()');
      logger.info('✅ Connected to Clean DB');
      
      return true;
    } catch (error) {
      logger.error('❌ Database connection failed:', error.message);
      return false;
    }
  }

  async getUnprocessedJobs(platform, limit = 100) {
    const query = `
      SELECT jp.*, c.company_name, c.location as company_location, c.url as company_url
      FROM job_posting jp
      LEFT JOIN company c ON jp.company_id = c.company_id
      WHERE jp.processed = FALSE AND jp.platform = $1
      ORDER BY jp.crawled_time ASC
      LIMIT $2
    `;
    
    try {
      const result = await this.rawPool.query(query, [platform, limit]);
      return result.rows;
    } catch (error) {
      logger.error(`Error fetching unprocessed jobs for ${platform}:`, error.message);
      throw error;
    }
  }

  async markJobsProcessed(jobIds) {
    const query = `
      UPDATE job_posting 
      SET processed = TRUE, processed_at = CURRENT_TIMESTAMP
      WHERE job_id = ANY($1)
    `;
    
    try {
      await this.rawPool.query(query, [jobIds]);
      logger.info(`Marked ${jobIds.length} jobs as processed`);
    } catch (error) {
      logger.error('Error marking jobs as processed:', error.message);
      throw error;
    }
  }

  async upsertCompany(companyData) {
    const { name, location, domain } = companyData;
    
    const query = `
      INSERT INTO Company (Name, Location, Domain)
      VALUES ($1, $2, $3)
      ON CONFLICT (Name, Domain) 
      DO UPDATE SET 
        Location = EXCLUDED.Location,
        UpdatedAt = CURRENT_TIMESTAMP
      RETURNING Id
    `;
    
    try {
      const result = await this.cleanPool.query(query, [name, location, domain]);
      return result.rows[0].id;
    } catch (error) {
      logger.error('Error upserting company:', error.message);
      throw error;
    }
  }

  async insertJobPost(jobData) {
    const query = `
      INSERT INTO JobPost (
        CompanyId, Title, Description, SalaryPerMonth, CurrencyId,
        ExperienceLevelId, Location, CountryCode, ApplicantCount,
        PostedDate, PlatformId, PostUrl, CrawledTime
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (PostUrl) DO NOTHING
      RETURNING Id
    `;
    
    const values = [
      jobData.companyId,
      jobData.title,
      jobData.description,
      jobData.salaryPerMonth,
      jobData.currencyId,
      jobData.experienceLevelId,
      jobData.location,
      jobData.countryCode,
      jobData.applicantCount,
      jobData.postedDate,
      jobData.platformId,
      jobData.postUrl,
      jobData.crawledTime
    ];
    
    try {
      const result = await this.cleanPool.query(query, values);
      return result.rows[0]?.id;
    } catch (error) {
      logger.error('Error inserting job post:', error.message);
      throw error;
    }
  }

  async close() {
    await this.rawPool.end();
    await this.cleanPool.end();
    logger.info('Database connections closed');
  }
}

module.exports = new DatabaseService();