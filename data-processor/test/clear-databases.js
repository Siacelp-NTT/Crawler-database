const { Pool } = require('pg');
const readline = require('readline');
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function clearDatabases() {
  console.log('\n' + '⚠️ '.repeat(30));
  console.log('🗑️  DATABASE CLEANUP UTILITY');
  console.log('⚠️ '.repeat(30) + '\n');

  try {
    // Show current stats
    console.log('📊 Current Database Status:\n');

    const rawStats = await rawPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM company) as companies,
        (SELECT COUNT(*) FROM job_posting) as total_jobs,
        (SELECT COUNT(*) FILTER (WHERE processed = FALSE) FROM job_posting) as unprocessed,
        (SELECT COUNT(*) FILTER (WHERE processed = TRUE) FROM job_posting) as processed
    `);
    
    console.log('📦 RAW DATABASE:');
    console.table(rawStats.rows[0]);

    const cleanStats = await cleanPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM Company) as companies,
        (SELECT COUNT(*) FROM JobPost) as job_posts
    `);
    
    console.log('\n✨ CLEAN DATABASE:');
    console.table(cleanStats.rows[0]);

    console.log('\n' + '⚠️ '.repeat(30));
    console.log('⚠️  WARNING: This will DELETE ALL DATA!');
    console.log('⚠️ '.repeat(30) + '\n');

    const answer = await askQuestion('Are you sure? Type "DELETE ALL" to confirm: ');

    if (answer.trim() !== 'DELETE ALL') {
      console.log('\n❌ Cancelled. No data was deleted.\n');
      return;
    }

    console.log('\n🗑️  Deleting data...\n');

    // Delete from Raw DB
    console.log('📦 Clearing Raw Database...');
    const rawDeleted = await rawPool.query('DELETE FROM job_posting RETURNING job_id');
    console.log(`   ✅ Deleted ${rawDeleted.rowCount} job postings`);
    
    const rawCompanies = await rawPool.query('DELETE FROM company RETURNING company_id');
    console.log(`   ✅ Deleted ${rawCompanies.rowCount} companies`);

    // Delete from Clean DB
    console.log('\n✨ Clearing Clean Database...');
    const cleanJobs = await cleanPool.query('DELETE FROM JobPost RETURNING Id');
    console.log(`   ✅ Deleted ${cleanJobs.rowCount} job posts`);
    
    const cleanCompanies = await cleanPool.query('DELETE FROM Company RETURNING Id');
    console.log(`   ✅ Deleted ${cleanCompanies.rowCount} companies`);

    // Verify
    console.log('\n📊 Verification:\n');

    const verifyRaw = await rawPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM company) as companies,
        (SELECT COUNT(*) FROM job_posting) as jobs
    `);
    console.log('📦 RAW DATABASE:');
    console.table(verifyRaw.rows[0]);

    const verifyClean = await cleanPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM Company) as companies,
        (SELECT COUNT(*) FROM JobPost) as jobs
    `);
    console.log('✨ CLEAN DATABASE:');
    console.table(verifyClean.rows[0]);

    console.log('\n✅ All data deleted successfully!\n');

  } catch (error) {
    console.error('\n❌ Error clearing databases:', error.message);
  } finally {
    rl.close();
    await rawPool.end();
    await cleanPool.end();
  }
}

clearDatabases();