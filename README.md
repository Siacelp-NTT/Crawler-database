# Job Crawler Database System

A comprehensive two-tier database system for web scraping job postings with automated data transformation and analytics.

## 🏗️ Architecture

```
┌─────────────────┐
│   Web Crawlers  │ (Your PC)
│  (Python/Node)  │
└────────┬────────┘
         │ HTTP POST
         ▼
┌─────────────────────────────────────┐
│         VPS (DigitalOcean)          │
│                                     │
│  ┌─────────────────────────────┐   │
│  │      Raw API (Node.js)      │   │
│  │    Port 3000 (Internal)     │   │
│  └──────────┬──────────────────┘   │
│             │                       │
│             ▼                       │
│  ┌─────────────────────────────┐   │
│  │  Raw Database (PostgreSQL)  │   │
│  │   Stores unprocessed data   │   │
│  └──────────┬──────────────────┘   │
│             │                       │
│             ▼                       │
│  ┌─────────────────────────────┐   │
│  │  Data Processor (Node.js)   │   │
│  │  Runs every 5 minutes       │   │
│  └──────────┬──────────────────┘   │
│             │                       │
│             ▼                       │
│  ┌─────────────────────────────┐   │
│  │ Clean Database (PostgreSQL) │   │
│  │  Normalized, ready for use  │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

## 📦 Components

### 1. **Raw Database** (`/database-setup/raw_db/`)
- Fast insertion, flexible schema
- Stores all scraped data as-is
- Tracks processing status

### 2. **Clean Database** (`/database-setup/clean_db/`)
- Normalized schema with foreign keys
- Optimized for analytics queries
- Standardized data formats

### 3. **Raw API** (`/raw-api/`)
- RESTful API for data insertion
- Endpoints for job posts, companies, bulk uploads
- CSV file upload support
- Built with Express.js

### 4. **Data Processor** (`/data-processor/`)
- Automated ETL pipeline
- Platform-specific YAML configurations
- Salary parsing, location normalization
- AI fallback for complex fields
- Analytics dashboard

## 🚀 Quick Start

### Prerequisites

- **PostgreSQL** 15+ installed
- **Node.js** 18+ installed
- **npm** or **yarn**
- **VPS** (optional, for production deployment)

### Local Development Setup

#### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/Crawler-database.git
cd Crawler-database
```

#### 2. Setup Databases

```bash
# Create databases and users
psql -U postgres

-- In psql:
CREATE USER jobcrawler_user WITH PASSWORD 'your_password';
CREATE DATABASE jobcrawler_raw_db OWNER jobcrawler_user;
CREATE DATABASE jobcrawler_db OWNER jobcrawler_user;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE jobcrawler_raw_db TO jobcrawler_user;
GRANT ALL PRIVILEGES ON DATABASE jobcrawler_db TO jobcrawler_user;

\q
```

```bash
# Run schema scripts
psql -U jobcrawler_user -d jobcrawler_raw_db -f database-setup/raw_db/schema.sql
psql -U jobcrawler_user -d jobcrawler_db -f database-setup/clean_db/schema.sql
psql -U jobcrawler_user -d jobcrawler_db -f database-setup/clean_db/seed_data.sql
```

#### 3. Setup Raw API

```bash
cd raw-api
npm install
cp .env.example .env
# Edit .env with your database credentials
npm start
```

API will run on `http://localhost:3000`

#### 4. Setup Data Processor

```bash
cd data-processor
npm install
cp .env.example .env
# Edit .env with your database credentials

# Test with sample data
npm run test-data
npm run process-once

# Run analytics dashboard
npm run dashboard
```

## 📖 Detailed Documentation

- [Database Setup Guide](./database-setup/README.md)
- [Raw API Documentation](./raw-api/README.md)
- [Data Processor Guide](./data-processor/README.md)
- [Deployment Instructions](./DEPLOYMENT.md)

## 🔧 Configuration

### Environment Variables

**Raw API** (`.env`):
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jobcrawler_raw_db
DB_USER=jobcrawler_user
DB_PASSWORD=your_password
PORT=3000
MAX_FILE_SIZE=10485760
```

**Data Processor** (`.env`):
```env
RAW_DB_HOST=localhost
RAW_DB_NAME=jobcrawler_raw_db
CLEAN_DB_HOST=localhost
CLEAN_DB_NAME=jobcrawler_db
BATCH_SIZE=100
PROCESS_INTERVAL=*/5 * * * *
AI_ENABLED=false
```

## 📊 Analytics Queries

The system includes built-in analytics:

```bash
cd data-processor
npm run dashboard
```

Available reports:
- 💰 Salary statistics by platform/experience
- 📍 Jobs by location
- 🏢 Platform performance
- 🔥 Trending job titles
- 📈 Hiring trends

## 🧪 Testing

```bash
# Test Raw API
cd raw-api
npm test

# Test Data Processor
cd data-processor
npm run test-data      # Insert test data
npm run status         # Check processing status
npm run process-once   # Run processor once
```

## 📡 API Endpoints

### POST `/api/jobposts`
Insert a single job posting

### POST `/api/companies`
Insert a company

### POST `/api/jobposts/bulk`
Bulk insert via JSON array

### POST `/api/upload/csv`
Upload CSV file

### GET `/api/health`
Health check

See [API Documentation](./raw-api/README.md) for details.

## 🚀 Production Deployment

1. **VPS Setup** (DigitalOcean, AWS, etc.)
2. **Install PostgreSQL**
3. **Deploy databases**
4. **Deploy Raw API** with PM2
5. **Deploy Data Processor** with PM2
6. **Setup Nginx** reverse proxy
7. **Configure firewall**

See [DEPLOYMENT.md](./DEPLOYMENT.md) for step-by-step guide.

## 📈 System Status

```bash
# Check Raw API
curl http://localhost:3000/api/health

# Check processor status
cd data-processor
npm run status

# View logs
npm run logs
```