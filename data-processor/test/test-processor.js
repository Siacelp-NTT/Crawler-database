const { Pool } = require('pg');
require('dotenv').config();

const rawPool = new Pool({
  host: process.env.RAW_DB_HOST,
  port: process.env.RAW_DB_PORT,
  database: process.env.RAW_DB_NAME,
  user: process.env.RAW_DB_USER,
  password: process.env.RAW_DB_PASSWORD,
  // Add client encoding for UTF8
  client_encoding: 'UTF8'
});

const cleanPool = new Pool({
  host: process.env.CLEAN_DB_HOST,
  port: process.env.CLEAN_DB_PORT,
  database: process.env.CLEAN_DB_NAME,
  user: process.env.CLEAN_DB_USER,
  password: process.env.CLEAN_DB_PASSWORD,
  // Add client encoding for UTF8
  client_encoding: 'UTF8'
});

async function insertTestData() {
  console.log('🧪 Inserting test data into Raw DB...\n');

  try {
    // Set client encoding immediately after connecting
    await rawPool.query("SET CLIENT_ENCODING TO 'UTF8'");
    
    // Insert test company
    const company = await rawPool.query(
      `INSERT INTO company (company_name, location, url)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING company_id`,
      ['Test Tech Corp', 'Ho Chi Minh City', 'https://testtech.com']
    );

    let companyId = company.rows[0]?.company_id;

    if (!companyId) {
      // Company already exists, get it
      const existingCompany = await rawPool.query(
        `SELECT company_id FROM company WHERE company_name = $1`,
        ['Test Tech Corp']
      );
      companyId = existingCompany.rows[0].company_id;
    }

    console.log(`✅ Company inserted: ${companyId}\n`);

    // Insert test jobs with various data patterns
    const testJobs = [
      {
        company_id: companyId,
        job_title: 'Senior Software Engineer',
        description: '<p>We are looking for a senior developer with <strong>5+ years</strong> experience.</p><ul><li>Design systems</li><li>Code reviews</li></ul>',
        salary: '15 Mil - 25 Mil VND',
        pay_period: 'month',
        work_type: 'Full-time',
        experience_level: 'Senior',
        location: 'Ho Chi Minh City', // Use English instead of Vietnamese
        applies: 42,
        listed_time: '2025-12-01',
        currency: 'VND',
        platform: 'CareerViet',
        url: 'https://careerviet.vn/job/123456'
      },
      {
        company_id: companyId,
        job_title: 'Junior Data Analyst',
        description: 'Entry level position for fresh graduates. Training provided.',
        salary: 'Negotiable', // Use English instead of Vietnamese
        pay_period: null,
        work_type: 'Full-time', // Use English
        experience_level: 'Entry level', // Use English
        location: 'Hanoi', // Use English
        applies: 15,
        listed_time: '2025-12-05', // Use absolute date
        currency: 'VND',
        platform: 'CareerViet',
        url: 'https://careerviet.vn/job/123457'
      },
      {
        company_id: companyId,
        job_title: 'Product Manager',
        description: 'Lead product development for our SaaS platform.',
        salary: '$4,000 - $6,000/mo',
        pay_period: 'month',
        work_type: 'Full-time',
        experience_level: 'Mid-Senior level',
        location: 'Remote',
        applies: 28,
        listed_time: '2025-12-05',
        currency: 'USD',
        platform: 'LinkedIn',
        url: 'https://linkedin.com/jobs/987654'
      },
      {
        company_id: companyId,
        job_title: 'DevOps Engineer',
        description: 'Manage cloud infrastructure and CI/CD pipelines.',
        salary: '20 Mil - 35 Mil VND',
        pay_period: 'month',
        work_type: 'Full-time',
        experience_level: 'Mid',
        location: 'Da Nang',
        applies: 22,
        listed_time: '2025-12-06',
        currency: 'VND',
        platform: 'ITviec',
        url: 'https://itviec.com/job/567890'
      }
    ];

    for (const job of testJobs) {
      try {
        const result = await rawPool.query(
          `INSERT INTO job_posting 
           (company_id, job_title, description, salary, pay_period, work_type, 
            experience_level, location, applies, listed_time, currency, platform, url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamp, $11, $12, $13)
           ON CONFLICT (url) DO NOTHING
           RETURNING job_id, job_title`,
          [job.company_id, job.job_title, job.description, job.salary, 
           job.pay_period, job.work_type, job.experience_level, job.location,
           job.applies, job.listed_time, job.currency, job.platform, job.url]
        );

        if (result.rows.length > 0) {
          console.log(`✅ Inserted: ${result.rows[0].job_title}`);
        } else {
          console.log(`⏭️  Skipped (duplicate): ${job.job_title}`);
        }
      } catch (error) {
        console.error(`❌ Error inserting ${job.job_title}:`, error.message);
      }
    }

    console.log('\n📊 Current Raw DB Stats:');
    const stats = await rawPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM company) as companies,
        (SELECT COUNT(*) FROM job_posting) as total_jobs,
        (SELECT COUNT(*) FROM job_posting WHERE processed = FALSE) as unprocessed_jobs
    `);
    console.log(stats.rows[0]);

  } catch (error) {
    console.error('❌ Test data insertion failed:', error.message);
  } finally {
    await rawPool.end();
    await cleanPool.end();
  }
}

insertTestData();