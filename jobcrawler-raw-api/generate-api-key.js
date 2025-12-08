const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const cleanPool = new Pool({
  host: process.env.CLEAN_DB_HOST,
  port: process.env.CLEAN_DB_PORT,
  database: process.env.CLEAN_DB_NAME,
  user: process.env.CLEAN_DB_USER,
  password: process.env.CLEAN_DB_PASSWORD,
});

async function generateApiKey(keyName, createdBy) {
  const apiKey = crypto.randomBytes(32).toString('hex');
  
  try {
    const result = await cleanPool.query(
      `INSERT INTO ApiKeys (KeyName, ApiKey, IsActive, CreatedBy)
       VALUES ($1, $2, TRUE, $3)
       RETURNING *`,
      [keyName, apiKey, createdBy]
    );
    
    console.log('✅ API Key Generated Successfully!');
    console.log('='.repeat(60));
    console.log('Key Name:', result.rows[0].keyname);
    console.log('API Key:', result.rows[0].apikey);
    console.log('Created By:', result.rows[0].createdby);
    console.log('Created At:', result.rows[0].createdat);
    console.log('='.repeat(60));
    console.log('\n⚠️  Save this API key securely! It won\'t be shown again.\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating API key:', error.message);
    process.exit(1);
  }
}

const keyName = process.argv[2] || 'default-crawler';
const createdBy = process.argv[3] || 'admin';

generateApiKey(keyName, createdBy);