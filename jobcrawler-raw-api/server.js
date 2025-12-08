const express = require('express');
const { Pool } = require('pg');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer'); // Add this
const csvParser = require('csv-parser'); // Add this
const fs = require('fs'); // Add this
require('dotenv').config();

const app = express();

// Database pools
const rawPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const cleanPool = new Pool({
  host: process.env.CLEAN_DB_HOST,
  port: process.env.CLEAN_DB_PORT,
  database: process.env.CLEAN_DB_NAME,
  user: process.env.CLEAN_DB_USER,
  password: process.env.CLEAN_DB_PASSWORD,
});

// Test database connections on startup
rawPool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Raw DB connection failed:', err.message);
  } else {
    console.log('✅ Raw DB connected:', res.rows[0].now);
  }
});

cleanPool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Clean DB connection failed:', err.message);
  } else {
    console.log('✅ Clean DB connected:', res.rows[0].now);
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
});
app.use('/api/', limiter);

// Authentication middleware
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key is required' });
  }
  
  try {
    const result = await cleanPool.query(
      'SELECT * FROM ApiKeys WHERE ApiKey = $1 AND IsActive = TRUE',
      [apiKey]
    );
    
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid or inactive API key' });
    }
    
    // Update usage
    await cleanPool.query(
      'UPDATE ApiKeys SET UsageCount = UsageCount + 1, LastUsedAt = CURRENT_TIMESTAMP WHERE ApiKey = $1',
      [apiKey]
    );
    
    req.apiKeyInfo = result.rows[0];
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Routes

// Health check (no auth)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Job Crawler Raw API',
    timestamp: new Date().toISOString(),
    database: 'jobcrawler_raw_db'
  });
});

// Get API stats (no auth)
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await rawPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM company) as companies,
        (SELECT COUNT(*) FROM job_posting) as total_jobs,
        (SELECT COUNT(*) FROM job_posting WHERE processed = FALSE) as unprocessed_jobs,
        (SELECT COUNT(*) FROM benefit) as benefits
    `);
    
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('❌ Error in /api/stats:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Create company (with auth)
app.post('/api/companies', authenticateApiKey, async (req, res) => {
  const { company_name, location, description, url } = req.body;
  
  if (!company_name) {
    return res.status(400).json({ error: 'company_name is required' });
  }
  
  try {
    // Check if company exists
    let result = await rawPool.query(
      'SELECT * FROM company WHERE company_name = $1 AND (url = $2 OR ($2 IS NULL AND url IS NULL))',
      [company_name, url || null]
    );
    
    if (result.rows.length > 0) {
      return res.json(result.rows[0]);
    }
    
    // Create new company
    result = await rawPool.query(
      `INSERT INTO company (company_name, location, description, url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [company_name, location, description, url]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// Create job posting (with auth)
app.post('/api/jobposts', authenticateApiKey, async (req, res) => {
  const {
    company_id,
    job_title,
    description,
    salary,
    pay_period,
    work_type,
    experience_level,
    location,
    applies,
    listed_time,
    currency,
    platform,
    url
  } = req.body;
  
  if (!job_title || !url || !platform) {
    return res.status(400).json({ 
      error: 'job_title, url, and platform are required' 
    });
  }
  
  try {
    // Check for duplicate URL
    const existing = await rawPool.query(
      'SELECT job_id FROM job_posting WHERE url = $1',
      [url]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Job post with this URL already exists',
        job_id: existing.rows[0].job_id
      });
    }
    
    const result = await rawPool.query(
      `INSERT INTO job_posting 
       (company_id, job_title, description, salary, pay_period, work_type, 
        experience_level, location, applies, listed_time, currency, platform, url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [company_id, job_title, description, salary, pay_period, work_type,
       experience_level, location, applies, listed_time, currency, platform, url]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating job post:', error);
    res.status(500).json({ error: 'Failed to create job post' });
  }
});

// Bulk create job postings (with auth)
app.post('/api/jobposts/bulk', authenticateApiKey, async (req, res) => {
  const { jobs } = req.body;
  
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ error: 'jobs array is required' });
  }
  
  const results = {
    created: 0,
    skipped: 0,
    errors: []
  };
  
  const client = await rawPool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const job of jobs) {
      try {
        // Check for duplicate
        const existing = await client.query(
          'SELECT job_id FROM job_posting WHERE url = $1',
          [job.url]
        );
        
        if (existing.rows.length > 0) {
          results.skipped++;
          continue;
        }
        
        await client.query(
          `INSERT INTO job_posting 
           (company_id, job_title, description, salary, pay_period, work_type, 
            experience_level, location, applies, listed_time, currency, platform, url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [job.company_id, job.job_title, job.description, job.salary, 
           job.pay_period, job.work_type, job.experience_level, job.location,
           job.applies, job.listed_time, job.currency, job.platform, job.url]
        );
        
        results.created++;
      } catch (error) {
        results.errors.push({
          job_title: job.job_title,
          url: job.url,
          error: error.message
        });
      }
    }
    
    await client.query('COMMIT');
    res.json(results);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Bulk insert error:', error);
    res.status(500).json({ error: 'Bulk insert failed' });
  } finally {
    client.release();
  }
});

// Get unprocessed jobs (for ETL)
app.get('/api/jobposts/unprocessed', authenticateApiKey, async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  
  try {
    const result = await rawPool.query(
      `SELECT jp.*, c.company_name, c.location as company_location, c.url as company_url
       FROM job_posting jp
       LEFT JOIN company c ON jp.company_id = c.company_id
       WHERE jp.processed = FALSE
       ORDER BY jp.crawled_time ASC
       LIMIT $1`,
      [limit]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching unprocessed jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Mark jobs as processed (for ETL)
app.post('/api/jobposts/mark-processed', authenticateApiKey, async (req, res) => {
  const { job_ids } = req.body;
  
  if (!Array.isArray(job_ids) || job_ids.length === 0) {
    return res.status(400).json({ error: 'job_ids array is required' });
  }
  
  try {
    const result = await rawPool.query(
      `UPDATE job_posting 
       SET processed = TRUE, processed_at = CURRENT_TIMESTAMP
       WHERE job_id = ANY($1)
       RETURNING job_id`,
      [job_ids]
    );
    
    res.json({ 
      processed: result.rowCount,
      job_ids: result.rows.map(r => r.job_id)
    });
  } catch (error) {
    console.error('Error marking jobs as processed:', error);
    res.status(500).json({ error: 'Failed to mark jobs' });
  }
});

// CSV Upload endpoint (with auth)
app.post('/api/jobposts/upload-csv', authenticateApiKey, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required' });
  }

  const results = {
    created: 0,
    skipped: 0,
    errors: [],
    total: 0
  };

  const client = await rawPool.connect();
  
  try {
    await client.query('BEGIN');
    
    const jobs = [];
    
    // Parse CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csvParser())
        .on('data', (row) => {
          jobs.push(row);
          results.total++;
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Process each row
    for (const job of jobs) {
      try {
        // First, handle company
        let companyId = job.company_id;
        
        if (!companyId && job.company_name) {
          // Try to find existing company
          const existingCompany = await client.query(
            'SELECT company_id FROM company WHERE company_name = $1',
            [job.company_name]
          );
          
          if (existingCompany.rows.length > 0) {
            companyId = existingCompany.rows[0].company_id;
          } else {
            // Create new company
            const newCompany = await client.query(
              `INSERT INTO company (company_name, location, description, url)
               VALUES ($1, $2, $3, $4)
               RETURNING company_id`,
              [job.company_name, job.company_location || null, job.company_description || null, job.company_url || null]
            );
            companyId = newCompany.rows[0].company_id;
          }
        }

        // Check for duplicate job URL
        const existing = await client.query(
          'SELECT job_id FROM job_posting WHERE url = $1',
          [job.url]
        );
        
        if (existing.rows.length > 0) {
          results.skipped++;
          continue;
        }

        // Insert job posting
        await client.query(
          `INSERT INTO job_posting 
           (company_id, job_title, description, salary, pay_period, work_type, 
            experience_level, location, applies, listed_time, currency, platform, url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            companyId,
            job.job_title,
            job.description || null,
            job.salary || null,
            job.pay_period || null,
            job.work_type || null,
            job.experience_level || null,
            job.location || null,
            job.applies ? parseInt(job.applies) : null,
            job.listed_time || null,
            job.currency || null,
            job.platform || 'CSV Upload',
            job.url
          ]
        );
        
        results.created++;
      } catch (error) {
        results.errors.push({
          row: results.total - jobs.indexOf(job),
          job_title: job.job_title,
          url: job.url,
          error: error.message
        });
      }
    }
    
    await client.query('COMMIT');
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json(results);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('CSV upload error:', error);
    
    // Clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'CSV upload failed', details: error.message });
  } finally {
    client.release();
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`🚀 Raw API Server Started`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`💾 Database: ${process.env.DB_NAME}`);
  console.log('='.repeat(50));
});