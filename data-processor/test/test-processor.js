const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const rawPool = new Pool({
  host: process.env.RAW_DB_HOST,
  port: process.env.RAW_DB_PORT,
  database: process.env.RAW_DB_NAME,
  user: process.env.RAW_DB_USER,
  password: process.env.RAW_DB_PASSWORD,
});

/**
 * Generate deterministic UUID from string
 * Same input = same UUID every time
 */
function generateDeterministicUUID(str) {
  const hash = crypto.createHash('md5').update(str).digest('hex');
  // Convert MD5 hash to UUID v4 format
  return [
    hash.substr(0, 8),
    hash.substr(8, 4),
    '4' + hash.substr(12, 3), // Version 4
    hash.substr(16, 4),
    hash.substr(20, 12)
  ].join('-');
}

async function insertTestData() {
  console.log('🧪 Inserting test data into Raw DB...\n');

  try {
    // Company data
    const companyName = 'Test Company Ltd';
    const companyUrl = 'https://testcompany.com';
    
    // Generate deterministic UUID based on company name + URL
    const companyKey = `${companyName}|${companyUrl}`;
    const companyId = generateDeterministicUUID(companyKey);

    // Check if company exists
    let result = await rawPool.query(
      'SELECT company_id FROM company WHERE company_id = $1',
      [companyId]
    );

    if (result.rows.length === 0) {
      // Insert company
      await rawPool.query(
        `INSERT INTO company (company_id, company_name, location, url)
         VALUES ($1, $2, $3, $4)`,
        [companyId, companyName, 'Ho Chi Minh City, Vietnam', companyUrl]
      );
      console.log(`✅ Company inserted: ${companyId}\n`);
    } else {
      console.log(`ℹ️  Company already exists: ${companyId}\n`);
    }

    // Test job postings
    const testJobs = [
      {
        title: 'Senior Software Engineer',
        description: 'We are looking for a senior software engineer with 5+ years of experience in Node.js and React. You will work on challenging projects...',
        salary: '2000-3000 USD',
        experience_level: 'Senior',
        location: 'Ho Chi Minh City',
        platform: 'LinkedIn',
        url: 'https://linkedin.com/jobs/test-senior-swe-001'
      },
      {
        title: 'Junior Data Analyst',
        description: 'Join our data team as a junior analyst. Experience with SQL and Python required. Fresh graduates welcome.',
        salary: '500-800 USD',
        experience_level: 'Entry level',
        location: 'Hanoi',
        platform: 'CareerViet',
        url: 'https://careerviet.vn/vi/viec-lam/test-junior-analyst-002'
      },
      {
        title: 'Product Manager',
        description: 'Lead product development for our SaaS platform. 3+ years experience in product management required.',
        salary: '1500-2500 USD',
        experience_level: 'Mid-Senior level',
        location: 'Remote',
        platform: 'ITviec',
        url: 'https://itviec.com/it-jobs/test-product-manager-003'
      },
      {
        title: 'DevOps Engineer',
        description: 'Manage our cloud infrastructure on AWS. Docker, Kubernetes, and CI/CD experience required.',
        salary: '1800-2800 USD',
        experience_level: 'Senior',
        location: 'Da Nang',
        platform: 'CareerViet',
        url: 'https://careerviet.vn/vi/viec-lam/test-devops-004'
      }
    ];

    for (const job of testJobs) {
      // Check if job exists (by URL)
      result = await rawPool.query(
        'SELECT job_id FROM job_posting WHERE url = $1',
        [job.url]
      );

      if (result.rows.length > 0) {
        console.log(`⏭️  Skipped (duplicate): ${job.title}`);
        continue;
      }

      // Insert job
      await rawPool.query(
        `INSERT INTO job_posting (
          company_id, job_title, description, salary, experience_level,
          location, platform, url, currency, applies, listed_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() - INTERVAL '2 days')`,
        [
          companyId,
          job.title,
          job.description,
          job.salary,
          job.experience_level,
          job.location,
          job.platform,
          job.url,
          'USD',
          Math.floor(Math.random() * 100) + 10
        ]
      );

      console.log(`✅ Inserted: ${job.title}`);
    }

    console.log('');

    // Show stats
    const stats = await rawPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM company) as companies,
        (SELECT COUNT(*) FROM job_posting) as total_jobs,
        (SELECT COUNT(*) FROM job_posting WHERE processed = FALSE) as unprocessed_jobs
    `);

    console.log('📊 Current Raw DB Stats:');
    console.log(stats.rows[0]);

  } catch (error) {
    console.error('❌ Error inserting test data:', error);
  } finally {
    await rawPool.end();
  }
}

insertTestData();