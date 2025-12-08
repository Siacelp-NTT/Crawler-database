# Job Crawler Database & API Server - Deployment Guide
## Project Structure
```
Project-folder\
├── .git/
├── .gitignore
├── README.md
├── instruction.md
├── schema.sql                      ← Clean DB schema
├── raw_schema.sql                  ← Raw DB schema
│
├── jobcrawler-raw-api/            ← API on VPS
│   ├── .env
│   ├── package.json
│   ├── server.js
│   └── generate-api-key.js
│
└── data-processor/               
    ├── .env
    ├── package.json
    ├── index.js                        ← Main entry point
    │
    ├── config/                         ← YAML configs per platform
    │   ├── global.yaml                ← Platform registry & settings
    │   ├── careerviet.yaml            ← CareerViet transformation rules
    │   ├── linkedin.yaml              ← LinkedIn transformation rules
    │   ├── itviec.yaml                ← ITviec transformation rules
    │   ├── topcv.yaml                 ← TopCV transformation rules
    │   └── vietnamworks.yaml          ← VietnamWorks transformation rules
    │
    ├── processors/                     ← Platform-specific processors
    │   ├── BaseProcessor.js           ← Abstract base class
    │   ├── CareerVietProcessor.js     ← CareerViet logic
    │   ├── LinkedInProcessor.js       ← LinkedIn logic
    │   ├── ITviecProcessor.js         ← ITviec logic
    │   ├── TopCVProcessor.js          ← TopCV logic
    │   └── VietnamWorksProcessor.js   ← VietnamWorks logic
    │
    ├── utils/                          ← Shared utilities
    │   ├── salary_parser.js           ← Parse salary strings
    │   ├── experience_mapper.js       ← Map experience levels
    │   ├── location_normalizer.js     ← Normalize locations
    │   └── date_parser.js             ← Parse various date formats
    │
    ├── services/
    │   ├── database.js                ← DB connection manager
    │   ├── ai_processor.js            ← AI/LLM integration (optional)
    │   └── logger.js                  ← Winston logger
    │
    └── test/
        ├── test-processor.js          ← Insert test data
        └── check-status.js            ← Check processing status
```

## 📋 Project Overview

**Goal:** Build a centralized two-tier database system with API server where multiple crawlers can push raw job posting data, which is then processed into a cleaned, normalized database.

**Architecture:**
```
Crawler 1 ──┐
Crawler 2 ──┼──→ API Server (Raw) ──→ PostgreSQL (Raw DB)
Crawler 3 ──┘       ↓                       ↓
              (Crawler-pcs)               (VPS)
                                            ↓
                                    Data Processor
                                    (VPS)
                                    - Reads YAML configs
                                    - Transforms data
                                    - AI processing
                                            ↓
                                    PostgreSQL (Clean DB)
                                    (VPS)
                                            ↓
                                    Analytics/Queries
```

**Two-Database Design:**

1. **Raw Database (`jobcrawler_raw_db`):**
   - Stores data exactly as scraped
   - Flexible schema (text fields, no strict validation)
   - Fast inserts from crawlers
   - Tables: `company`, `job_posting`, `benefit`

2. **Clean Database (`jobcrawler_db`):**
   - Normalized, structured data
   - Lookup tables for consistency
   - Optimized for queries and analytics
   - Tables: `Currency`, `ExperienceLevel`, `Platform`, `Company`, `JobPost`, `ApiKeys`

**Data Flow:**
```
1. Crawler scrapes job data
2. Crawler pushes to Raw DB via API (no validation)
3. Data Processor runs periodically on VPS
4. Data Processor reads YAML configs for each platform
5. Data Processor cleans, normalizes, validates data
6. Data Processor inserts into Clean DB
7. Analytics queries Clean DB
```

**Tech Stack:**
- Database: PostgreSQL (2 databases on same VPS)
- Raw API: Node.js + Express (on VPS)
- Data Processor: Node.js with YAML configs (on VPS)
- Auth: Simple API Keys
- Deployment: DigitalOcean VPS (Ubuntu 24.04)
- Version Control: Git + GitHub

**Workflow:**
1. Develop locally on your PC
2. Push code to GitHub repository
3. Pull and deploy on VPS

---

## 🎯 Phase 1: Database Design & Setup

### 1.1 Database Schema Overview

We will create **TWO separate databases** on the same PostgreSQL server.

#### **Database 1: Raw Database (`jobcrawler_raw_db`)**

**Purpose:** Store raw, unprocessed data from crawlers

**Tables:**

1. **company** - Company information (raw)
   - Fields: company_id (UUID), company_name, location, description, url, created_at
   - No strict validation, stores exactly what crawler sends

2. **job_posting** - Job posting data (raw)
   - Fields: job_id (UUID), company_id (FK), job_title, description, salary (VARCHAR), pay_period, work_type, experience_level (VARCHAR), location, applies, listed_time, currency (VARCHAR), platform (VARCHAR), url (UNIQUE), crawled_time, processed (BOOLEAN), processed_at
   - `processed` flag tracks if data has been moved to clean DB
   - Salary stored as text (handles "1000-2000", "$50/hr", "Negotiable")
   - Experience level stored as text (handles any format from websites)

3. **benefit** - Job benefits (raw)
   - Fields: benefit_id (UUID), job_id (FK), type, inferred, created_at
   - `inferred` field for LLM-extracted benefits from description

**Indexes:**
- job_posting: company_id, platform, crawled_time, url, processed
- company: company_name, url

#### **Database 2: Clean Database (`jobcrawler_db`)**

**Purpose:** Store normalized, validated data for analytics

**Tables:**

1. **Currency** - Reference table
   - Fields: Id, Name, CreatedAt
   - Pre-populated: VND, USD

2. **ExperienceLevel** - Reference table
   - Fields: Id, Name, Description, CreatedAt
   - Pre-populated: Internship, Entry, Mid, Senior, Lead, Executive

3. **Platform** - Reference table
   - Fields: Id, Name, Description, Domain, CreatedAt
   - Pre-populated: LinkedIn, Indeed, Careerviet, Topcv, Itviec, VietnamWorks

4. **Company** - Normalized company data
   - Fields: Id (UUID), Name, Location, Domain, CreatedAt, UpdatedAt
   - UNIQUE constraint on (Name, Domain)
   - Auto-update UpdatedAt trigger

5. **JobPost** - Normalized job posting data
   - Fields: Id (UUID), CompanyId (FK), Title, Description, SalaryPerMonth (DECIMAL), CurrencyId (FK), ExperienceLevelId (FK), Location, CountryCode, ApplicantCount, PostedDate (DATE), PlatformId (FK), PostUrl (UNIQUE), CrawledTime, CreatedAt, UpdatedAt
   - Foreign keys enforce data integrity
   - Salary converted to decimal number
   - Experience level mapped to ID (1-6)

6. **ApiKeys** - Authentication
   - Fields: Id (UUID), KeyName, ApiKey, IsActive, UsageCount, CreatedBy, CreatedAt, LastUsedAt
   - Used by both APIs

**Indexes:**
- JobPost: CompanyId, PlatformId, PostedDate, CrawledTime, Title (full-text)
- Company: Name
- ApiKeys: ApiKey

**Triggers:**
- Auto-update UpdatedAt on Company and JobPost

### 1.2 Setup PostgreSQL on VPS

**Steps:**

1. **SSH into your droplet:**
   ```bash
   ssh root@YOUR_DROPLET_IP
   ```

2. **Install PostgreSQL:**
   ```bash
   apt update
   apt install postgresql postgresql-contrib -y
   ```

3. **Create both databases:**
   ```bash
   sudo -u postgres psql
   ```
   ```sql
   CREATE DATABASE jobcrawler_raw_db;
   CREATE DATABASE jobcrawler_db;
   ```

4. **Create database user:**
   ```sql
   CREATE USER jobcrawler_user WITH PASSWORD 'YOUR_SECURE_PASSWORD';
   GRANT ALL PRIVILEGES ON DATABASE jobcrawler_raw_db TO jobcrawler_user;
   GRANT ALL PRIVILEGES ON DATABASE jobcrawler_db TO jobcrawler_user;
   \q
   ```

5. **Execute schema files:**
   
   Upload both schema files to VPS, then:
   ```bash
   # Raw database schema
   sudo -u postgres psql -d jobcrawler_raw_db -f raw_schema.sql
   
   # Clean database schema
   sudo -u postgres psql -d jobcrawler_db -f schema.sql
   ```

6. **⚠️ CRITICAL: Grant table-level permissions:**
   
   After creating the schemas, you MUST grant permissions on all tables:
   
   ```bash
   sudo -u postgres psql
   ```
   
   ```sql
   -- Connect to raw database and grant permissions
   \c jobcrawler_raw_db
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO jobcrawler_user;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jobcrawler_user;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO jobcrawler_user;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO jobcrawler_user;
   
   -- Connect to clean database and grant permissions
   \c jobcrawler_db
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO jobcrawler_user;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jobcrawler_user;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO jobcrawler_user;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO jobcrawler_user;
   
   -- Verify permissions
   \c jobcrawler_raw_db
   \dp company
   \dp job_posting
   \dp benefit
   
   \c jobcrawler_db
   \dp ApiKeys
   \dp Company
   \dp JobPost
   
   \q
   ```
   
   **Why this is needed:** Creating a database and granting database-level privileges does NOT automatically grant permissions on tables created afterwards. You must explicitly grant table permissions after running the schema files.

7. **Configure PostgreSQL for remote access (optional - only if you want to connect from your PC):**
   
   Edit `/etc/postgresql/*/main/postgresql.conf`:
   ```
   listen_addresses = '*'
   ```
   
   Edit `/etc/postgresql/*/main/pg_hba.conf`, add:
   ```
   host    all             all             0.0.0.0/0               md5
   ```
   
   Restart PostgreSQL:
   ```bash
   systemctl restart postgresql
   ```

8. **Configure firewall (if remote access needed):**
   ```bash
   ufw allow 5432/tcp
   ufw reload
   ```

### 1.3 Test Database Connections

From your local PC, test both databases:

**Using psql client:**
```bash
# Test raw database
psql -h YOUR_DROPLET_IP -U jobcrawler_user -d jobcrawler_raw_db

# Test clean database
psql -h YOUR_DROPLET_IP -U jobcrawler_user -d jobcrawler_db
```

**Verify tables and permissions:**
```sql
-- In raw database
\dt  -- Should see: company, job_posting, benefit
\dp  -- Check permissions (should show jobcrawler_user has access)
SELECT COUNT(*) FROM company;  -- Should execute without "permission denied" error

-- In clean database
\dt  -- Should see: Currency, ExperienceLevel, Platform, Company, JobPost, ApiKeys
\dp  -- Check permissions
SELECT COUNT(*) FROM ApiKeys;  -- Should execute without error
```

**Common Issues:**
- **"permission denied for table X"**: You forgot step 6 (grant table permissions)
- **"relation X does not exist"**: Schema file wasn't executed properly
- **"FATAL: password authentication failed"**: Wrong password in connection string

**✅ Checkpoint:** You should be able to:
1. Connect to both databases from your local PC
2. See all tables with `\dt`
3. Query tables without permission errors
4. Generate API keys successfully

---

## 🚀 Phase 2: Raw API Server Development

### 2.1 Local Development Setup

**On your local PC:**

1. Create project directory: `jobcrawler-raw-api`
   ```bash
   cd Projects\
   mkdir jobcrawler-raw-api
   cd jobcrawler-raw-api
   ```

2. Initialize Node.js project:
   ```bash
   npm init -y
   ```

3. Install dependencies:
   ```bash
   npm install express pg dotenv cors helmet express-rate-limit
   ```

4. Create `.env` file:
   ```env
   # Database - Raw Database
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=jobcrawler_raw_db
   DB_USER=jobcrawler_user
   DB_PASSWORD=YOUR_SECURE_PASSWORD
   
   # Clean Database (for API key validation)
   CLEAN_DB_HOST=localhost
   CLEAN_DB_PORT=5432
   CLEAN_DB_NAME=jobcrawler_db
   CLEAN_DB_USER=jobcrawler_user
   CLEAN_DB_PASSWORD=YOUR_SECURE_PASSWORD
   
   # Server
   PORT=3000
   NODE_ENV=development
   ```

### 2.2 Raw API Server Code

**File: `server.js`**

This server handles RAW data insertions (no validation, just store as-is):

```javascript
const express = require('express');
const { Pool } = require('pg');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
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

// Test connections
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
  windowMs: 15 * 60 * 1000,
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

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Job Crawler Raw API',
    timestamp: new Date().toISOString(),
    database: 'jobcrawler_raw_db'
  });
});

// Stats
app.get('/api/stats', async (req, res) => {
  try {
    const companyCount = await rawPool.query('SELECT COUNT(*) FROM company');
    const jobCount = await rawPool.query('SELECT COUNT(*) FROM job_posting');
    const unprocessedCount = await rawPool.query('SELECT COUNT(*) FROM job_posting WHERE processed = FALSE');
    const benefitCount = await rawPool.query('SELECT COUNT(*) FROM benefit');
    
    res.json({
      companies: parseInt(companyCount.rows[0].count),
      total_jobs: parseInt(jobCount.rows[0].count),
      unprocessed_jobs: parseInt(unprocessedCount.rows[0].count),
      benefits: parseInt(benefitCount.rows[0].count)
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Create company
app.post('/api/companies', authenticateApiKey, async (req, res) => {
  const { company_name, location, description, url } = req.body;
  
  if (!company_name) {
    return res.status(400).json({ error: 'company_name is required' });
  }
  
  try {
    let result = await rawPool.query(
      'SELECT * FROM company WHERE company_name = $1 AND (url = $2 OR ($2 IS NULL AND url IS NULL))',
      [company_name, url || null]
    );
    
    if (result.rows.length > 0) {
      return res.json(result.rows[0]);
    }
    
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

// Create job posting
app.post('/api/jobposts', authenticateApiKey, async (req, res) => {
  const {
    company_id, job_title, description, salary, pay_period, work_type,
    experience_level, location, applies, listed_time, currency, platform, url
  } = req.body;
  
  if (!job_title || !url || !platform) {
    return res.status(400).json({ 
      error: 'job_title, url, and platform are required' 
    });
  }
  
  try {
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

// Bulk create job postings
app.post('/api/jobposts/bulk', authenticateApiKey, async (req, res) => {
  const { jobs } = req.body;
  
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ error: 'jobs array is required' });
  }
  
  const results = { created: 0, skipped: 0, errors: [] };
  const client = await rawPool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const job of jobs) {
      try {
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

// Get unprocessed jobs (for data processor)
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

// Mark jobs as processed (for data processor)
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
```

### 2.3 API Key Generator

**File: `generate-api-key.js`**

```javascript
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
    console.log('\n⚠️  Save this API key securely!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const keyName = process.argv[2] || 'default-crawler';
const createdBy = process.argv[3] || 'admin';

generateApiKey(keyName, createdBy);
```

### 2.4 CSV Upload Feature (For Manual Data Submissions)

Some users may send you CSV files instead of using the API directly. The Raw API supports CSV uploads for bulk job posting insertion.

#### 2.4.1 Install Additional Dependencies

```bash
npm install multer csv-parser
```

#### 2.4.2 Update server.js

Add the following code to your `server.js` (after the existing dependencies):

```javascript
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});
```

Then add this endpoint (after the existing routes):

```javascript
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
          row: jobs.indexOf(job) + 1,
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
```

#### 2.4.3 Create Uploads Directory

```bash
cd jobcrawler-raw-api
mkdir uploads
```

#### 2.4.4 Update .gitignore

Add to your `.gitignore`:

```gitignore
# Uploads (don't commit CSV files)
uploads/
```

#### 2.4.5 CSV File Format

The CSV file should have these columns (minimum required: `job_title`, `url`, and either `company_id` OR `company_name`):

```csv
company_name,company_location,company_url,job_title,description,salary,pay_period,work_type,experience_level,location,applies,listed_time,currency,platform,url
Google,Mountain View CA,https://google.com,Software Engineer,Full stack development,120000,year,Full-time,Mid,Remote,50,2025-12-08,USD,LinkedIn,https://linkedin.com/jobs/456
Microsoft,Redmond WA,https://microsoft.com,Data Scientist,AI research,150000,year,Full-time,Senior,Hybrid,30,2025-12-07,USD,Indeed,https://indeed.com/jobs/789
```

**Notes:**
- If `company_id` is provided, it will use that existing company
- If only `company_name` is provided, it will:
  - Search for existing company with that name
  - Create a new company if not found
- Duplicate URLs will be skipped automatically
- Empty fields will be stored as `NULL`

#### 2.4.6 Testing CSV Upload

**Using curl (Windows):**

```bash
curl -X POST http://localhost:3000/api/jobposts/upload-csv ^
  -H "x-api-key: YOUR_API_KEY" ^
  -F "file=@path\to\jobs.csv"
```

**Using curl (Linux/Mac):**

```bash
curl -X POST http://localhost:3000/api/jobposts/upload-csv \
  -H "x-api-key: YOUR_API_KEY" \
  -F "file=@path/to/jobs.csv"
```

**Expected Response:**
```json
{
  "created": 2,
  "skipped": 0,
  "errors": [],
  "total": 2
}
```

**If there are errors:**
```json
{
  "created": 1,
  "skipped": 1,
  "errors": [
    {
      "row": 3,
      "job_title": "Invalid Job",
      "url": "invalid-url",
      "error": "Invalid URL format"
    }
  ],
  "total": 3
}
```

#### 2.4.7 Update package.json

Your `package.json` should now include:

```json
{
  "name": "jobcrawler-raw-api",
  "version": "1.0.0",
  "description": "API server for raw job crawler data",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.1.5",
    "dotenv": "^17.2.3",
    "multer": "^1.4.5-lts.1",
    "csv-parser": "^3.0.0"
  }
}
```

**✅ Checkpoint:** You should be able to upload CSV files and bulk insert job postings. The API will automatically handle company creation if needed.

### 2.5 Managing API Keys

API keys are permanent and stored in the clean database. Here's how to manage them:

#### View All API Keys

```bash
psql -h localhost -U jobcrawler_user -d jobcrawler_db
```

```sql
-- View all API keys
SELECT Id, KeyName, ApiKey, IsActive, UsageCount, CreatedBy, CreatedAt, LastUsedAt 
FROM ApiKeys;
```

#### Delete an API Key

```sql
-- Delete by key name
DELETE FROM ApiKeys WHERE KeyName = 'test-crawler';

-- Delete by ID
DELETE FROM ApiKeys WHERE Id = 'your-uuid-here';

-- Delete all API keys (use with caution!)
DELETE FROM ApiKeys;
```

#### Deactivate (Don't Delete) an API Key

```sql
-- Deactivate instead of deleting (preserves usage history)
UPDATE ApiKeys SET IsActive = FALSE WHERE KeyName = 'test-crawler';

-- Reactivate
UPDATE ApiKeys SET IsActive = TRUE WHERE KeyName = 'test-crawler';
```

#### Check API Key Usage Stats

```sql
-- See most used keys
SELECT KeyName, UsageCount, LastUsedAt 
FROM ApiKeys 
ORDER BY UsageCount DESC;

-- See inactive keys
SELECT KeyName, CreatedAt, LastUsedAt 
FROM ApiKeys 
WHERE IsActive = FALSE;
```

### 2.6 Cleaning Test Data

After testing, you may want to clean the raw database:

#### Quick Delete (Recommended for Testing)

```bash
psql -h localhost -U jobcrawler_user -d jobcrawler_raw_db
```

```sql
-- Delete all data (preserves table structure)
DELETE FROM job_posting;
DELETE FROM benefit;
DELETE FROM company;

-- Verify
SELECT COUNT(*) FROM company;      -- Should return 0
SELECT COUNT(*) FROM job_posting;  -- Should return 0
SELECT COUNT(*) FROM benefit;      -- Should return 0

\q
```

#### Complete Reset (Drop and Recreate)

```bash
psql -h localhost -U postgres -d jobcrawler_raw_db
```

```sql
-- Drop all tables
DROP TABLE IF EXISTS benefit CASCADE;
DROP TABLE IF EXISTS job_posting CASCADE;
DROP TABLE IF EXISTS company CASCADE;

\q
```

Then recreate the schema:

```bash
psql -h localhost -U postgres -d jobcrawler_raw_db -f raw_schema.sql
```

**Don't forget to re-grant permissions:**

```bash
psql -h localhost -U postgres -d jobcrawler_raw_db
```

```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO jobcrawler_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jobcrawler_user;
\q
```

**✅ Final Checkpoint for Phase 2:**
- [ ] API server runs without errors
- [ ] All endpoints tested (health, stats, companies, jobposts, bulk, CSV)
- [ ] CSV upload works correctly
- [ ] Can manage API keys (create, delete, deactivate)
- [ ] Can clean test data
- [ ] Ready to deploy to VPS

---

## 🌐 Phase 3: Deploy Raw API to VPS

### 3.1 Prepare VPS

1. **SSH into VPS**:
   ```bash
   ssh root@YOUR_DROPLET_IP
   ```

2. **Install Node.js**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt-get install -y nodejs
   node --version
   npm --version
   ```

3. **Install PM2** (process manager):
   ```bash
   npm install -g pm2
   ```

4. **Create app directory**:
   ```bash
   mkdir -p /var/www/jobcrawler-raw-api
   cd /var/www/jobcrawler-raw-api
   ```

### 3.2 Deploy Code

**Option A: Using Git (Recommended)**

1. **On VPS**, clone your repository:
   ```bash
   cd /var/www
   git clone https://github.com/YOUR_USERNAME/Crawler-database.git
   cd Crawler-database/jobcrawler-raw-api
   ```

2. **Install dependencies**:
   ```bash
   npm install --production
   ```

3. **Create `.env` file**:
   ```bash
   nano .env
   ```
   
   Add (use `localhost` since DB is on same server):
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=jobcrawler_raw_db
   DB_USER=jobcrawler_user
   DB_PASSWORD=YOUR_SECURE_PASSWORD
   
   CLEAN_DB_HOST=localhost
   CLEAN_DB_PORT=5432
   CLEAN_DB_NAME=jobcrawler_db
   CLEAN_DB_USER=jobcrawler_user
   CLEAN_DB_PASSWORD=YOUR_SECURE_PASSWORD
   
   PORT=3000
   NODE_ENV=production
   ```

**Option B: Manual Upload**

Use SCP or SFTP to upload files from your PC to VPS.

### 3.3 Start API with PM2

```bash
cd /var/www/Crawler-database/jobcrawler-raw-api

# Start with PM2
pm2 start server.js --name jobcrawler-raw-api

# Save PM2 config
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the command it gives you

# Check status
pm2 status
pm2 logs jobcrawler-raw-api
```

### 3.4 Setup Nginx Reverse Proxy

1. **Install Nginx**:
   ```bash
   apt install nginx -y
   ```

2. **Create Nginx config**:
   ```bash
   nano /etc/nginx/sites-available/jobcrawler-raw-api
   ```
   
   Add:
   ```nginx
   server {
       listen 80;
       server_name YOUR_DOMAIN_OR_IP;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **Enable site**:
   ```bash
   ln -s /etc/nginx/sites-available/jobcrawler-raw-api /etc/nginx/sites-enabled/
   nginx -t
   systemctl restart nginx
   ```

4. **Configure firewall**:
   ```bash
   ufw allow 'Nginx Full'
   ufw allow 22/tcp
   ufw enable
   ```

### 3.5 Test Deployment

```bash
# From your PC
curl http://YOUR_DROPLET_IP/api/health
curl http://YOUR_DROPLET_IP/api/stats
```

**✅ Checkpoint:** API should be accessible from internet.

---

## 🔐 Phase 4: Setup SSL (Optional but Recommended)

1. **Install Certbot**:
   ```bash
   apt install certbot python3-certbot-nginx -y
   ```

2. **Get SSL certificate**:
   ```bash
   certbot --nginx -d your-domain.com
   ```

3. **Auto-renewal**:
   ```bash
   certbot renew --dry-run
   ```

Now your API is accessible via `https://your-domain.com`!

---

## 🔄 Phase 5: Data Processor Development & Deployment

### Overview

The Data Processor reads unprocessed jobs from the Raw DB, transforms them using platform-specific YAML configurations, and inserts clean data into the Clean DB.

**Architecture:**
```
Raw DB (unprocessed jobs)
    ↓
Data Processor (reads YAML configs)
    ↓
Transform & Normalize
    ↓
Clean DB (structured data)
    ↓
Mark as processed in Raw DB
```

### 5.1 Project Structure

```
data-processor/
├── .env
├── package.json
├── index.js                        ← Main entry point
│
├── config/                         ← YAML configs per platform
│   ├── global.yaml                ← Platform registry & settings
│   ├── careerviet.yaml            ← CareerViet transformation rules
│   ├── linkedin.yaml              ← LinkedIn transformation rules
│   ├── itviec.yaml                ← ITviec transformation rules
│   ├── topcv.yaml                 ← TopCV transformation rules
│   └── vietnamworks.yaml          ← VietnamWorks transformation rules
│
├── processors/                     ← Platform-specific processors
│   ├── BaseProcessor.js           ← Abstract base class
│   ├── CareerVietProcessor.js     ← CareerViet logic
│   ├── LinkedInProcessor.js       ← LinkedIn logic
│   ├── ITviecProcessor.js         ← ITviec logic
│   ├── TopCVProcessor.js          ← TopCV logic
│   └── VietnamWorksProcessor.js   ← VietnamWorks logic
│
├── utils/                          ← Shared utilities
│   ├── salary_parser.js           ← Parse salary strings
│   ├── experience_mapper.js       ← Map experience levels
│   ├── location_normalizer.js     ← Normalize locations
│   └── date_parser.js             ← Parse various date formats
│
├── services/
│   ├── database.js                ← DB connection manager
│   ├── ai_processor.js            ← AI/LLM integration (optional)
│   └── logger.js                  ← Winston logger
│
└── test/
    ├── test-processor.js          ← Insert test data
    └── check-status.js            ← Check processing status
```

### 5.2 How It Works

#### YAML Configuration System

Each platform has a YAML config file that defines transformation rules:

**Example: `config/careerviet.yaml`**

```yaml
platform_name: "CareerViet"
platform_id: 3

# Salary parsing
salary:
  method: "manual"              # or "ai"
  patterns:
    - regex: '(\d+(?:,\d+)?)\s*Mil\s*-\s*(\d+(?:,\d+)?)\s*Mil\s*(VND|USD)'
      type: "range"
      multiplier: 1000000
      currency_group: 3
      min_group: 1
      max_group: 2
  
  ai_fallback:
    enabled: true
    prompt: |
      Extract salary from: "{text}"
      Return JSON: {"min": number, "max": number, "currency": "VND|USD"}
  
  default_currency: "VND"

# Experience level mapping
experience_level:
  method: "manual"
  mappings:
    "Intern": "Internship"
    "Entry level": "Entry"
    "Senior": "Senior"
  ai_fallback:
    enabled: true
  default: "Entry"

# Location normalization
location:
  method: "manual"
  city_mappings:
    "HCM": "Ho Chi Minh City"
    "Hanoi": "Hanoi"
  default_country: 'VNM'
```

**Key Features:**
- **Manual patterns**: Use regex for consistent data formats
- **AI fallback**: Use AI when patterns fail
- **Platform-specific**: Each platform has its own config
- **Flexible**: Easy to add new patterns as you discover them

#### Processing Flow

1. **Read unprocessed jobs** from Raw DB (filtered by platform)
2. **Load YAML config** for that platform
3. **Parse each field**:
   - Salary: Extract min/max, convert to monthly amount
   - Experience: Map to standardized levels (Internship, Entry, Mid, Senior, Lead, Executive)
   - Location: Normalize city names, detect country
   - Date: Parse various date formats
   - Description: Clean HTML, optionally use AI
4. **Validate data** (check required fields, ranges)
5. **Insert into Clean DB**
6. **Mark as processed** in Raw DB

### 5.3 Local Setup

**1. Create directory:**
```bash
cd d:\Projects\Crawler-database
mkdir data-processor
cd data-processor
```

**2. Initialize project:**
```bash
npm init -y
```

**3. Install dependencies:**
```bash
npm install pg dotenv js-yaml axios winston node-cron
npm install cross-env nodemon --save-dev
```

**4. Create `.env` file:**
```env
# Raw Database (read from)
RAW_DB_HOST=localhost
RAW_DB_PORT=5432
RAW_DB_NAME=jobcrawler_raw_db
RAW_DB_USER=jobcrawler_user
RAW_DB_PASSWORD=YOUR_PASSWORD

# Clean Database (write to)
CLEAN_DB_HOST=localhost
CLEAN_DB_PORT=5432
CLEAN_DB_NAME=jobcrawler_db
CLEAN_DB_USER=jobcrawler_user
CLEAN_DB_PASSWORD=YOUR_PASSWORD

# Processing Settings
BATCH_SIZE=100
PROCESS_INTERVAL=*/5 * * * *    # Every 5 minutes (cron format)
LOG_LEVEL=info
RUN_MODE=cron                   # cron or once

# AI Processing (Optional)
AI_ENABLED=false
GEMINI_API_KEY=
CLAUDE_API_KEY=
AI_PROVIDER=gemini
```

**5. Create directory structure:**
```bash
mkdir config processors services utils test logs
```

**6. Copy all code files** (provided earlier in conversation)

### 5.4 Testing Locally

**1. Insert test data:**
```bash
npm run test-data
```

**Expected output:**
```
✅ Company inserted: <uuid>
✅ Inserted: Senior Software Engineer
✅ Inserted: Junior Data Analyst
✅ Inserted: Product Manager
✅ Inserted: DevOps Engineer

📊 Current Raw DB Stats:
{ companies: '1', total_jobs: '4', unprocessed_jobs: '4' }
```

**2. Check status before processing:**
```bash
npm run status
```

**Expected output:**
```
📦 RAW DATABASE:
  companies: '1'
  total_jobs: '4'
  unprocessed: '4'
  processed: '0'

✨ CLEAN DATABASE:
  companies: '0'
  job_posts: '0'
```

**3. Run processor once:**
```bash
npm run process-once
```

**Expected output:**
```
🚀 Job Crawler Data Processor Started
✅ Connected to Raw DB
✅ Connected to Clean DB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Starting data processing cycle
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Processing CareerViet...
Found 2 unprocessed jobs
Processing 2 jobs from CareerViet
✅ Inserted 2 jobs, marked 2 as processed
Stats - Processed: 2, Success: 2, Failed: 0

📊 Processing LinkedIn...
Found 1 unprocessed jobs
Processing 1 jobs from LinkedIn
✅ Inserted 1 jobs, marked 1 as processed
Stats - Processed: 1, Success: 1, Failed: 0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Processing cycle completed
📈 Total: 3 | Success: 3 | Failed: 0
⏱️  Duration: 0.38s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**4. Check status after processing:**
```bash
npm run status
```

**Expected output:**
```
📦 RAW DATABASE:
  companies: '1'
  total_jobs: '4'
  unprocessed: '1'  ← Only ITviec left (not enabled)
  processed: '3'

✨ CLEAN DATABASE:
  companies: '1'
  job_posts: '3'

📱 CLEAN JOBS BY PLATFORM:
  Careerviet   │ 2 jobs │ avg: 20,000,000 VND
  LinkedIn     │ 1 job  │ avg: null

🕐 RECENT PROCESSING:
  Product Manager          │ LinkedIn   │ 2025-12-08
  Senior Software Engineer │ CareerViet │ 2025-12-08
  Junior Data Analyst      │ CareerViet │ 2025-12-08
```

**5. Start in cron mode (automatic processing):**
```bash
npm start
```

This will:
- Run immediately on start
- Schedule to run every 5 minutes (configurable in `.env`)
- Keep running until you press Ctrl+C

**6. Monitor logs in real-time:**
```bash
# In separate terminals:
npm run logs         # All logs
npm run logs-error   # Errors only
npm run stats        # Stats only
```

### 5.5 Verify Data Quality

**Connect to Clean DB:**
```bash
psql -h localhost -U jobcrawler_user -d jobcrawler_db
```

**Check transformed data:**
```sql
-- View all jobs with company info
SELECT 
    jp.Title,
    c.Name as Company,
    jp.SalaryPerMonth,
    cur.Name as Currency,
    el.Name as Experience,
    p.Name as Platform,
    jp.Location
FROM JobPost jp
LEFT JOIN Company c ON jp.CompanyId = c.Id
LEFT JOIN Currency cur ON jp.CurrencyId = cur.Id
LEFT JOIN ExperienceLevel el ON jp.ExperienceLevelId = el.Id
LEFT JOIN Platform p ON jp.PlatformId = p.Id;

-- Check salary ranges
SELECT 
    Title,
    SalaryPerMonth,
    CurrencyId
FROM JobPost
WHERE SalaryPerMonth IS NOT NULL
ORDER BY SalaryPerMonth DESC;

-- Check experience levels
SELECT 
    el.Name,
    COUNT(jp.Id) as job_count
FROM ExperienceLevel el
LEFT JOIN JobPost jp ON jp.ExperienceLevelId = el.Id
GROUP BY el.Name
ORDER BY job_count DESC;
```

### 5.6 Filling in YAML Configs

As you get real data from your crawlers, you'll need to fill in the YAML configs with actual patterns.

**Workflow:**
1. **Collect samples** from Raw DB:
   ```sql
   SELECT salary FROM job_posting WHERE platform = 'CareerViet' LIMIT 20;
   SELECT experience_level FROM job_posting WHERE platform = 'CareerViet' LIMIT 20;
   ```

2. **Identify patterns**:
   - `"15 Mil - 25 Mil VND"` → Range with "Mil"
   - `"Thỏa thuận"` → Negotiable
   - `"$50/hr"` → Hourly rate

3. **Write regex patterns** in YAML:
   ```yaml
   patterns:
     - regex: '(\d+(?:,\d+)?)\s*Mil\s*-\s*(\d+(?:,\d+)?)\s*Mil'
       type: "range"
       multiplier: 1000000
   ```

4. **Test** with `npm run process-once`

5. **Iterate** until all common patterns are covered

6. **Enable AI fallback** for edge cases

### 5.7 Common Issues & Solutions

#### Issue: "Invalid regex pattern"

**Cause:** Regex syntax error in YAML config

**Solution:** Test regex on https://regex101.com first, escape special characters

#### Issue: Jobs not being processed

**Cause 1:** Platform not enabled in `global.yaml`

**Solution:** Set `enabled: true` for that platform

**Cause 2:** No matching processor class

**Solution:** Check `processor_class` matches actual file name

#### Issue: Salary parsing fails

**Cause:** Pattern doesn't match actual data format

**Solution:** 
1. Check actual salary strings in Raw DB
2. Update regex pattern
3. Enable AI fallback

#### Issue: "Permission denied for table"

**Cause:** Database permissions not granted (see Phase 1.2 step 6)

**Solution:**
```bash
psql -h localhost -U postgres -d jobcrawler_db
```
```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO jobcrawler_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jobcrawler_user;
```

### 5.8 Deploy to VPS

**1. SSH into VPS:**
```bash
ssh root@YOUR_DROPLET_IP
```

**2. Navigate to project directory:**
```bash
cd /var/www/Crawler-database/data-processor
```

**3. Install dependencies:**
```bash
npm install --production
```

**4. Create `.env` file:**
```bash
nano .env
```

```env
RAW_DB_HOST=localhost
RAW_DB_PORT=5432
RAW_DB_NAME=jobcrawler_raw_db
RAW_DB_USER=jobcrawler_user
RAW_DB_PASSWORD=YOUR_PASSWORD

CLEAN_DB_HOST=localhost
CLEAN_DB_PORT=5432
CLEAN_DB_NAME=jobcrawler_db
CLEAN_DB_USER=jobcrawler_user
CLEAN_DB_PASSWORD=YOUR_PASSWORD

BATCH_SIZE=100
PROCESS_INTERVAL=*/5 * * * *
LOG_LEVEL=info
RUN_MODE=cron

AI_ENABLED=false
```

**5. Test once:**
```bash
npm run process-once
```

**6. Start with PM2:**
```bash
pm2 start index.js --name data-processor
pm2 save
pm2 status
```

**7. Monitor logs:**
```bash
pm2 logs data-processor
pm2 logs data-processor --err  # Errors only
```

**8. Stop processor:**
```bash
pm2 stop data-processor
```

**9. Restart processor:**
```bash
pm2 restart data-processor
```

### 5.9 Available npm Scripts

```bash
npm start              # Start in cron mode (continuous)
npm run process-once   # Run once and exit
npm run test-data      # Insert test data into Raw DB
npm run status         # Check processing status
npm run logs           # Tail combined logs
npm run logs-error     # Tail error logs
npm run stats          # Tail stats logs
npm run clean-logs     # Delete all log files
```

### 5.10 Monitoring & Maintenance

**Check processor status:**
```bash
pm2 status
pm2 monit  # Real-time monitoring
```

**View processing stats:**
```bash
npm run status
```

**Check logs:**
```bash
tail -f logs/combined.log
tail -f logs/error.log
tail -f logs/stats.log
```

**Database queries:**
```sql
-- Jobs processed in last hour
SELECT COUNT(*) 
FROM job_posting 
WHERE processed = TRUE 
  AND processed_at > NOW() - INTERVAL '1 hour';

-- Failed processing patterns (no salary parsed)
SELECT platform, salary, COUNT(*) 
FROM job_posting jp
LEFT JOIN JobPost cleanJP ON jp.url = cleanJP.PostUrl
WHERE jp.processed = TRUE 
  AND cleanJP.SalaryPerMonth IS NULL
  AND jp.salary IS NOT NULL
GROUP BY platform, salary;
```

**Reset processed flag (reprocess jobs):**
```sql
UPDATE job_posting 
SET processed = FALSE, processed_at = NULL
WHERE platform = 'CareerViet';
```

### 5.11 AI Processing (Optional)

To enable AI for complex field parsing:

**1. Get API key:**
- **Gemini**: https://makersuite.google.com/app/apikey
- **Claude**: https://console.anthropic.com/
- **OpenAI**: https://platform.openai.com/api-keys

**2. Update `.env`:**
```env
AI_ENABLED=true
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
```

**3. Update YAML configs:**
```yaml
salary:
  method: "ai"  # Use AI for all salary parsing
  
  # OR use AI as fallback:
  method: "manual"
  ai_fallback:
    enabled: true
```

**4. Monitor AI usage:**

The processor tracks daily AI calls to prevent excessive costs. Check logs for:

```
AI daily limit reached
AI processing disabled or no API key
```

**5. Adjust limits in `global.yaml`:**
```yaml
ai:
  enabled: true
  daily_limit: 10000     # Max calls per day
  cost_per_call: 0.001   # Estimated cost
```

### ✅ Phase 5 Checklist

- [ ] Data processor installed locally
- [ ] All dependencies installed
- [ ] `.env` configured
- [ ] Test data inserted successfully
- [ ] Processing works locally (`npm run process-once`)
- [ ] Jobs appear in Clean DB
- [ ] YAML configs filled in for your platforms
- [ ] Deployed to VPS
- [ ] Running with PM2
- [ ] Logs being generated
- [ ] Cron schedule working

---

## 📊 Complete System Workflow

Now that all phases are complete, here's the full workflow:

```
1. Crawler (on your PC)
   ↓
2. POST to Raw API (http://your-vps-ip/api/jobposts)
   ↓
3. Raw DB stores unprocessed data
   ↓
4. Data Processor (runs every 5 min on VPS)
   ↓
5. Reads YAML configs for each platform
   ↓
6. Transforms & validates data
   ↓
7. Inserts into Clean DB
   ↓
8. Marks jobs as processed in Raw DB
   ↓
9. Clean DB ready for analytics
```

### Next Steps

1. **Connect your crawlers** to the Raw API
2. **Monitor processing** with `npm run status`
3. **Fill in YAML patterns** as you discover them
4. **Build analytics** queries on Clean DB
5. **Add AI processing** for complex fields
6. **Deploy everything** to production

---

## 🎯 Summary

You now have a complete two-tier database system:

- **Raw DB**: Fast insertion, flexible schema, stores everything
- **Clean DB**: Normalized data, optimized queries, analytics-ready
- **Raw API**: RESTful API for crawlers, CSV uploads
- **Data Processor**: Automated ETL with YAML configs, AI fallback

**All running on a single DigitalOcean VPS!** 🚀