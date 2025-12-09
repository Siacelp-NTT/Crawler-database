const { Pool } = require('pg');
require('dotenv').config();

const rawPool = new Pool({
  host: process.env.RAW_DB_HOST,
  port: process.env.RAW_DB_PORT,
  database: process.env.RAW_DB_NAME,
  user: process.env.RAW_DB_USER,
  password: process.env.RAW_DB_PASSWORD,
});

const cleanPool = new Pool({
  host: process.env.CLEAN_DB_HOST,
  port: process.env.CLEAN_DB_PORT,
  database: process.env.CLEAN_DB_NAME,
  user: process.env.CLEAN_DB_USER,
  password: process.env.CLEAN_DB_PASSWORD,
});

// Test connections
async function testConnections() {
  try {
    await rawPool.query('SELECT NOW()');
    console.log('✅ Connected to Raw Database');
  } catch (error) {
    console.error('❌ Failed to connect to Raw Database:', error.message);
    throw error;
  }

  try {
    await cleanPool.query('SELECT NOW()');
    console.log('✅ Connected to Clean Database');
  } catch (error) {
    console.error('❌ Failed to connect to Clean Database:', error.message);
    throw error;
  }
}

/**
 * Find company by name and domain (case-insensitive)
 * Returns UUID if found, null otherwise
 */
async function findCompanyByNameAndDomain(name, domain) {
  try {
    const result = await cleanPool.query(
      `SELECT Id FROM Company 
       WHERE LOWER(Name) = LOWER($1) 
       AND (LOWER(Domain) = LOWER($2) OR ($2 IS NULL AND Domain IS NULL))
       LIMIT 1`,
      [name, domain]
    );
    
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    console.error('Error finding company:', error);
    return null;
  }
}

/**
 * Find company by name only (fuzzy match)
 * Returns UUID if found, null otherwise
 */
async function findCompanyByName(name) {
  try {
    const result = await cleanPool.query(
      `SELECT Id FROM Company 
       WHERE LOWER(TRIM(Name)) = LOWER(TRIM($1))
       LIMIT 1`,
      [name]
    );
    
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    console.error('Error finding company by name:', error);
    return null;
  }
}

/**
 * Create company and return UUID
 * Handles duplicates by returning existing company
 */
async function createCompany(name, domain = null, location = null) {
  try {
    // First check if company exists
    let companyId = await findCompanyByNameAndDomain(name, domain);
    if (companyId) {
      console.log(`  ℹ️  Company already exists: ${name} (${companyId})`);
      return companyId;
    }

    // If domain is null, check by name only
    if (!domain) {
      companyId = await findCompanyByName(name);
      if (companyId) {
        console.log(`  ℹ️  Company already exists (by name): ${name} (${companyId})`);
        return companyId;
      }
    }

    // Create new company
    const result = await cleanPool.query(
      `INSERT INTO Company (Name, Domain, Location)
       VALUES ($1, $2, $3)
       RETURNING Id`,
      [name, domain, location]
    );
    
    const newCompanyId = result.rows[0].id;
    console.log(`  ✅ Created new company: ${name} (${newCompanyId})`);
    return newCompanyId;
    
  } catch (error) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      console.log(`  ℹ️  Company already exists (constraint): ${name}`);
      // Try to get existing company
      const existing = await findCompanyByNameAndDomain(name, domain);
      if (existing) return existing;
    }
    
    console.error('Error creating company:', error);
    throw error;
  }
}

/**
 * Check if job post exists by URL
 * Returns UUID if found, null otherwise
 */
async function findJobByUrl(url) {
  try {
    const result = await cleanPool.query(
      `SELECT Id FROM JobPost 
       WHERE PostUrl = $1
       LIMIT 1`,
      [url]
    );
    
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    console.error('Error finding job by URL:', error);
    return null;
  }
}

/**
 * Check if job exists by company, title, and platform
 * Returns UUID if found, null otherwise
 */
async function findJobByCompanyTitlePlatform(companyId, title, platformId) {
  try {
    const result = await cleanPool.query(
      `SELECT Id FROM JobPost 
       WHERE CompanyId = $1 
       AND LOWER(TRIM(Title)) = LOWER(TRIM($2))
       AND PlatformId = $3
       LIMIT 1`,
      [companyId, title, platformId]
    );
    
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    console.error('Error finding job by company/title/platform:', error);
    return null;
  }
}

/**
 * Create job post with duplicate checking
 * Returns { created: boolean, jobId: UUID }
 */
async function createJobPost(jobData) {
  try {
    // Check for duplicate by URL
    let existingJobId = await findJobByUrl(jobData.post_url);
    if (existingJobId) {
      console.log(`  ⏭️  Job already exists (URL): ${jobData.title} (${existingJobId})`);
      return { created: false, jobId: existingJobId };
    }

    // Check for duplicate by company + title + platform
    existingJobId = await findJobByCompanyTitlePlatform(
      jobData.company_id,
      jobData.title,
      jobData.platform_id
    );
    if (existingJobId) {
      console.log(`  ⏭️  Job already exists (company/title): ${jobData.title} (${existingJobId})`);
      return { created: false, jobId: existingJobId };
    }

    // Create new job post
    const result = await cleanPool.query(
      `INSERT INTO JobPost (
        CompanyId, Title, Description, SalaryPerMonth, CurrencyId,
        ExperienceLevelId, Location, CountryCode, ApplicantCount,
        PostedDate, PlatformId, PostUrl, CrawledTime
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING Id`,
      [
        jobData.company_id,
        jobData.title,
        jobData.description,
        jobData.salary_per_month,
        jobData.currency_id,
        jobData.experience_level_id,
        jobData.location,
        jobData.country_code,
        jobData.applicant_count,
        jobData.posted_date,
        jobData.platform_id,
        jobData.post_url,
        jobData.crawled_time
      ]
    );

    const newJobId = result.rows[0].id;
    console.log(`  ✅ Created new job: ${jobData.title} (${newJobId})`);
    return { created: true, jobId: newJobId };
    
  } catch (error) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      console.log(`  ⏭️  Job already exists (constraint): ${jobData.title}`);
      const existing = await findJobByUrl(jobData.post_url);
      if (existing) return { created: false, jobId: existing };
    }
    
    console.error('Error creating job post:', error);
    throw error;
  }
}

/**
 * Get lookup table IDs
 */
async function getCurrencyId(currencyCode) {
  const result = await cleanPool.query(
    'SELECT Id FROM Currency WHERE UPPER(Name) = UPPER($1)',
    [currencyCode]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

async function getExperienceLevelId(levelName) {
  const result = await cleanPool.query(
    'SELECT Id FROM ExperienceLevel WHERE LOWER(Name) = LOWER($1)',
    [levelName]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

async function getPlatformId(platformName) {
  const result = await cleanPool.query(
    'SELECT Id FROM Platform WHERE LOWER(Name) = LOWER($1)',
    [platformName]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * Get unprocessed jobs from raw database
 */
async function getUnprocessedJobs(limit = 100) {
  const result = await rawPool.query(
    `SELECT jp.*, c.company_name, c.location as company_location, c.url as company_url
     FROM job_posting jp
     LEFT JOIN company c ON jp.company_id = c.company_id
     WHERE jp.processed = FALSE
     ORDER BY jp.crawled_time ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Mark jobs as processed in raw database
 */
async function markJobsAsProcessed(jobIds) {
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return { processed: 0 };
  }

  const result = await rawPool.query(
    `UPDATE job_posting 
     SET processed = TRUE, processed_at = CURRENT_TIMESTAMP
     WHERE job_id = ANY($1)
     RETURNING job_id`,
    [jobIds]
  );
  
  return { processed: result.rowCount };
}

/**
 * Get statistics
 */
async function getStats() {
  const rawStats = await rawPool.query(`
    SELECT 
      (SELECT COUNT(*) FROM company) as companies,
      (SELECT COUNT(*) FROM job_posting) as total_jobs,
      (SELECT COUNT(*) FROM job_posting WHERE processed = FALSE) as unprocessed_jobs,
      (SELECT COUNT(*) FROM job_posting WHERE processed = TRUE) as processed_jobs
  `);

  const cleanStats = await cleanPool.query(`
    SELECT 
      (SELECT COUNT(*) FROM Company) as companies,
      (SELECT COUNT(*) FROM JobPost) as total_jobs
  `);

  return {
    raw: rawStats.rows[0],
    clean: cleanStats.rows[0]
  };
}

module.exports = {
  rawPool,
  cleanPool,
  testConnections,
  
  // Company operations
  findCompanyByNameAndDomain,
  findCompanyByName,
  createCompany,
  
  // Job operations
  findJobByUrl,
  findJobByCompanyTitlePlatform,
  createJobPost,
  
  // Lookup tables
  getCurrencyId,
  getExperienceLevelId,
  getPlatformId,
  
  // Raw database operations
  getUnprocessedJobs,
  markJobsAsProcessed,
  
  // Statistics
  getStats,
};