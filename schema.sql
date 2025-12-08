-- Job Crawler Database Schema
-- Created: 2025-12-08

-- Create database (run separately if needed)
-- CREATE DATABASE jobcrawler_db;

-- ===================================
-- 1. CURRENCY TABLE
-- ===================================
CREATE TABLE Currency (
    Id SERIAL PRIMARY KEY,
    Name VARCHAR(10) NOT NULL UNIQUE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pre-populate currencies
INSERT INTO Currency (Name) VALUES 
    ('VND'),
    ('USD');

-- ===================================
-- 2. EXPERIENCE LEVEL TABLE
-- ===================================
CREATE TABLE ExperienceLevel (
    Id SERIAL PRIMARY KEY,
    Name VARCHAR(50) NOT NULL UNIQUE,
    Description TEXT,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pre-populate experience levels
INSERT INTO ExperienceLevel (Name, Description) VALUES 
    ('Internship', 'Internship or trainee position'),
    ('Entry', 'Entry level, 0-2 years experience'),
    ('Mid', 'Mid level, 2-5 years experience'),
    ('Senior', 'Senior level, 5-10 years experience'),
    ('Lead', 'Lead or team lead, 10+ years experience'),
    ('Executive', 'Executive or C-level position');

-- ===================================
-- 3. PLATFORM TABLE
-- ===================================
CREATE TABLE Platform (
    Id SERIAL PRIMARY KEY,
    Name VARCHAR(100) NOT NULL UNIQUE,
    Description TEXT,
    Domain VARCHAR(255),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pre-populate platforms
INSERT INTO Platform (Name, Description, Domain) VALUES 
    ('LinkedIn', 'Professional networking platform', 'linkedin.com'),
    ('Indeed', 'Job search engine', 'indeed.com'),
    ('Careerviet', 'Jobs recruiting board', 'careerviet.vn'),
    ('Topcv', 'Jobs recruiting board', 'topcv.vn'),
    ('ItViec', 'It jobs recruiting board', 'itviec.com'),
    ('VietnamWorks', 'Job board and recruiting', 'vietnamworks.com');

-- ===================================
-- 4. COMPANY TABLE
-- ===================================
CREATE TABLE Company (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name VARCHAR(255) NOT NULL,
    Location VARCHAR(255),
    Domain VARCHAR(255),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(Name, Domain)
);

-- Index for faster company lookups
CREATE INDEX idx_company_name ON Company(Name);

-- ===================================
-- 5. JOBPOST TABLE
-- ===================================
CREATE TABLE JobPost (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CompanyId UUID NOT NULL,
    Title VARCHAR(500) NOT NULL,
    Description TEXT,
    SalaryPerMonth DECIMAL(10, 2),
    CurrencyId INTEGER,
    ExperienceLevelId INTEGER,
    Location VARCHAR(255),
    CountryCode VARCHAR(3),
    ApplicantCount INTEGER,
    PostedDate DATE,
    PlatformId INTEGER NOT NULL,
    PostUrl TEXT NOT NULL UNIQUE,
    CrawledTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (CompanyId) REFERENCES Company(Id) ON DELETE CASCADE,
    FOREIGN KEY (CurrencyId) REFERENCES Currency(Id),
    FOREIGN KEY (ExperienceLevelId) REFERENCES ExperienceLevel(Id),
    FOREIGN KEY (PlatformId) REFERENCES Platform(Id)
);

-- Indexes for faster queries
CREATE INDEX idx_jobpost_company ON JobPost(CompanyId);
CREATE INDEX idx_jobpost_platform ON JobPost(PlatformId);
CREATE INDEX idx_jobpost_posted_date ON JobPost(PostedDate);
CREATE INDEX idx_jobpost_crawled_time ON JobPost(CrawledTime);
CREATE INDEX idx_jobpost_title ON JobPost USING gin(to_tsvector('english', Title));

-- ===================================
-- 6. APIKEYS TABLE
-- ===================================
CREATE TABLE ApiKeys (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    KeyName VARCHAR(100) NOT NULL UNIQUE,
    ApiKey VARCHAR(64) NOT NULL UNIQUE,
    IsActive BOOLEAN DEFAULT TRUE,
    CreatedBy VARCHAR(100),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    LastUsedAt TIMESTAMP,
    UsageCount INTEGER DEFAULT 0
);

-- Index for API key lookups
CREATE INDEX idx_apikeys_key ON ApiKeys(ApiKey);

-- ===================================
-- 7. TRIGGERS FOR AUTO-UPDATE
-- ===================================

-- Function to update UpdatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.UpdatedAt = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for Company table
CREATE TRIGGER update_company_updated_at
    BEFORE UPDATE ON Company
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for JobPost table
CREATE TRIGGER update_jobpost_updated_at
    BEFORE UPDATE ON JobPost
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ===================================
-- VERIFICATION QUERIES
-- ===================================

-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check row counts
SELECT 'Currency' as table_name, COUNT(*) as count FROM Currency
UNION ALL
SELECT 'ExperienceLevel', COUNT(*) FROM ExperienceLevel
UNION ALL
SELECT 'Platform', COUNT(*) FROM Platform
UNION ALL
SELECT 'Company', COUNT(*) FROM Company
UNION ALL
SELECT 'JobPost', COUNT(*) FROM JobPost
UNION ALL
SELECT 'ApiKeys', COUNT(*) FROM ApiKeys;