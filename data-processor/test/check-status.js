const { Pool } = require('pg');
require('dotenv').config();

const rawPool = new Pool({
  host: process.env.RAW_DB_HOST,
  port: process.env.RAW_DB_PORT,
  database: process.env.RAW_DB_NAME,
  user: process.env.RAW_DB_USER,
  password: process.env.RAW_DB_PASSWORD,
  client_encoding: 'UTF8'
});

const cleanPool = new Pool({
  host: process.env.CLEAN_DB_HOST,
  port: process.env.CLEAN_DB_PORT,
  database: process.env.CLEAN_DB_NAME,
  user: process.env.CLEAN_DB_USER,
  password: process.env.CLEAN_DB_PASSWORD,
  client_encoding: 'UTF8'
});

async function checkStatus() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 DATA PROCESSOR STATUS');
  console.log('='.repeat(60) + '\n');

  try {
    // Set encoding
    await rawPool.query("SET CLIENT_ENCODING TO 'UTF8'");
    await cleanPool.query("SET CLIENT_ENCODING TO 'UTF8'");

    // Raw DB Stats
    console.log('📦 RAW DATABASE:');
    const rawStats = await rawPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM company) as companies,
        (SELECT COUNT(*) FROM job_posting) as total_jobs,
        (SELECT COUNT(*) FROM job_posting WHERE processed = FALSE) as unprocessed,
        (SELECT COUNT(*) FROM job_posting WHERE processed = TRUE) as processed,
        (SELECT MAX(crawled_time) FROM job_posting) as latest_crawl
    `);
    console.table(rawStats.rows[0]);

    // Platform breakdown (raw)
    console.log('\n📱 RAW JOBS BY PLATFORM:');
    const platformStats = await rawPool.query(`
      SELECT 
        platform,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE processed = FALSE) as unprocessed,
        COUNT(*) FILTER (WHERE processed = TRUE) as processed
      FROM job_posting
      GROUP BY platform
      ORDER BY total DESC
    `);
    console.table(platformStats.rows);

    // Clean DB Stats
    console.log('\n✨ CLEAN DATABASE:');
    const cleanStats = await cleanPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM Company) as companies,
        (SELECT COUNT(*) FROM JobPost) as job_posts,
        (SELECT MAX(CrawledTime) FROM JobPost) as latest_processed
    `);
    console.table(cleanStats.rows[0]);

    // Platform breakdown (clean)
    console.log('\n📱 CLEAN JOBS BY PLATFORM:');
    const cleanPlatformStats = await cleanPool.query(`
      SELECT 
        p.Name as platform,
        COUNT(jp.Id) as total_jobs,
        AVG(jp.SalaryPerMonth)::numeric(10,2) as avg_salary
      FROM Platform p
      LEFT JOIN JobPost jp ON jp.PlatformId = p.Id
      GROUP BY p.Name
      ORDER BY total_jobs DESC
    `);
    console.table(cleanPlatformStats.rows);

    // Recent processing
    console.log('\n🕐 RECENT PROCESSING:');
    const recentProcessed = await rawPool.query(`
      SELECT 
        job_title,
        platform,
        processed_at
      FROM job_posting
      WHERE processed = TRUE
      ORDER BY processed_at DESC
      LIMIT 5
    `);
    console.table(recentProcessed.rows);

    console.log('\n' + '='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error checking status:', error.message);
  } finally {
    await rawPool.end();
    await cleanPool.end();
  }
}

// Only run checkStatus, remove insertTestData call
checkStatus();