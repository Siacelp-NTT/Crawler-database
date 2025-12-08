-- Raw Job Crawler Database Schema
-- Created: 2025-12-08
-- Purpose: Store raw scraped data before processing

-- Create database (run separately if needed)
-- CREATE DATABASE jobcrawler_raw_db;

-- ===================================
-- 1. COMPANY TABLE (Raw)
-- ===================================
CREATE TABLE company (
    company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(500) NOT NULL,
    location VARCHAR(500),
    description TEXT,
    url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX idx_company_name ON company(company_name);
CREATE INDEX idx_company_url ON company(url);

-- ===================================
-- 2. JOB_POSTING TABLE (Raw)
-- ===================================
CREATE TABLE job_posting (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    job_title VARCHAR(1000) NOT NULL,
    description TEXT,
    salary VARCHAR(255),  -- Store as string (could be "1000-2000", "$50/hr", "Negotiable", etc.)
    pay_period VARCHAR(50),  -- hourly, monthly, yearly
    work_type VARCHAR(50),   -- Fulltime, Parttime, Contract, Season
    experience_level VARCHAR(255),  -- Store raw text from website
    location VARCHAR(500),
    applies INTEGER,
    listed_time TIMESTAMP,
    currency VARCHAR(20),
    platform VARCHAR(100) NOT NULL,
    url TEXT NOT NULL UNIQUE,  -- Prevent duplicate URLs
    crawled_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed BOOLEAN DEFAULT FALSE,  -- Track if processed to clean DB
    processed_at TIMESTAMP,  -- When it was processed
    
    FOREIGN KEY (company_id) REFERENCES company(company_id) ON DELETE CASCADE
);

-- Indexes for faster queries
CREATE INDEX idx_job_company ON job_posting(company_id);
CREATE INDEX idx_job_platform ON job_posting(platform);
CREATE INDEX idx_job_crawled_time ON job_posting(crawled_time);
CREATE INDEX idx_job_listed_time ON job_posting(listed_time);
CREATE INDEX idx_job_url ON job_posting(url);
CREATE INDEX idx_job_processed ON job_posting(processed);  -- For ETL queries

-- ===================================
-- 3. BENEFIT TABLE (Raw)
-- ===================================
CREATE TABLE benefit (
    benefit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL,
    type VARCHAR(255),  -- Healthy Insurance, Paid Time Off, Work From Home, etc.
    inferred TEXT,  -- Benefits inferred by LLM from description
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (job_id) REFERENCES job_posting(job_id) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX idx_benefit_job ON benefit(job_id);

-- ===================================
-- VERIFICATION QUERIES
-- ===================================

-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check row counts
SELECT 'company' as table_name, COUNT(*) as count FROM company
UNION ALL
SELECT 'job_posting', COUNT(*) FROM job_posting
UNION ALL
SELECT 'benefit', COUNT(*) FROM benefit;

-- Check processing status
SELECT 
    processed,
    COUNT(*) as count,
    MIN(crawled_time) as oldest,
    MAX(crawled_time) as newest
FROM job_posting
GROUP BY processed;