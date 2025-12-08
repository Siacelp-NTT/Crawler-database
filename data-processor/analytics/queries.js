const { Pool } = require('pg');
require('dotenv').config();

const cleanPool = new Pool({
  host: process.env.CLEAN_DB_HOST,
  port: process.env.CLEAN_DB_PORT,
  database: process.env.CLEAN_DB_NAME,
  user: process.env.CLEAN_DB_USER,
  password: process.env.CLEAN_DB_PASSWORD,
  client_encoding: 'UTF8'
});

class Analytics {
  // ============================================
  // SALARY ANALYTICS
  // ============================================

  async getSalaryStatsByPlatform() {
    const query = `
      SELECT 
        p.Name as platform,
        cur.Code as currency,
        COUNT(jp.Id) as job_count,
        AVG(jp.SalaryPerMonth)::numeric(12,2) as avg_salary,
        MIN(jp.SalaryPerMonth)::numeric(12,2) as min_salary,
        MAX(jp.SalaryPerMonth)::numeric(12,2) as max_salary,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY jp.SalaryPerMonth)::numeric(12,2) as median_salary
      FROM JobPost jp
      JOIN Platform p ON jp.PlatformId = p.Id
      JOIN Currency cur ON jp.CurrencyId = cur.Id
      WHERE jp.SalaryPerMonth IS NOT NULL
      GROUP BY p.Name, cur.Code
      ORDER BY avg_salary DESC;
    `;
    
    try {
      const result = await cleanPool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting salary stats:', error.message);
      throw error;
    }
  }

  async getSalaryByExperience() {
    const query = `
      SELECT 
        el.Name as experience_level,
        COUNT(jp.Id) as job_count,
        AVG(jp.SalaryPerMonth)::numeric(12,2) as avg_salary,
        MIN(jp.SalaryPerMonth)::numeric(12,2) as min_salary,
        MAX(jp.SalaryPerMonth)::numeric(12,2) as max_salary
      FROM JobPost jp
      JOIN ExperienceLevel el ON jp.ExperienceLevelId = el.Id
      WHERE jp.SalaryPerMonth IS NOT NULL
      GROUP BY el.Name, el.Id
      ORDER BY el.Id;
    `;
    
    try {
      const result = await cleanPool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting salary by experience:', error.message);
      throw error;
    }
  }

  async getTopPayingCompanies(limit = 20) {
    const query = `
      SELECT 
        c.Name as company,
        c.Location as location,
        COUNT(jp.Id) as job_count,
        AVG(jp.SalaryPerMonth)::numeric(12,2) as avg_salary,
        MAX(jp.SalaryPerMonth)::numeric(12,2) as max_salary
      FROM JobPost jp
      JOIN Company c ON jp.CompanyId = c.Id
      WHERE jp.SalaryPerMonth IS NOT NULL
      GROUP BY c.Name, c.Location
      HAVING COUNT(jp.Id) >= 2
      ORDER BY avg_salary DESC
      LIMIT $1;
    `;
    
    try {
      const result = await cleanPool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('Error getting top paying companies:', error.message);
      throw error;
    }
  }

  // ============================================
  // LOCATION ANALYTICS
  // ============================================

  async getJobsByLocation() {
    const query = `
      SELECT 
        jp.Location as city,
        jp.CountryCode as country,
        COUNT(jp.Id) as job_count,
        AVG(jp.SalaryPerMonth)::numeric(12,2) as avg_salary
      FROM JobPost jp
      WHERE jp.Location IS NOT NULL
      GROUP BY jp.Location, jp.CountryCode
      ORDER BY job_count DESC;
    `;
    
    try {
      const result = await cleanPool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting jobs by location:', error.message);
      throw error;
    }
  }

  async getRemoteJobs() {
    const query = `
      SELECT 
        jp.Title,
        c.Name as company,
        jp.SalaryPerMonth,
        cur.Code as currency,
        el.Name as experience,
        jp.PostedDate
      FROM JobPost jp
      JOIN Company c ON jp.CompanyId = c.Id
      LEFT JOIN Currency cur ON jp.CurrencyId = cur.Id
      LEFT JOIN ExperienceLevel el ON jp.ExperienceLevelId = el.Id
      WHERE LOWER(jp.Location) IN ('remote', 'work from home', 'wfh')
         OR jp.Location IS NULL
      ORDER BY jp.PostedDate DESC
      LIMIT 50;
    `;
    
    try {
      const result = await cleanPool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting remote jobs:', error.message);
      throw error;
    }
  }

  // ============================================
  // PLATFORM ANALYTICS
  // ============================================

  async getPlatformPerformance() {
    const query = `
      SELECT 
        p.Name as platform,
        COUNT(jp.Id) as total_jobs,
        COUNT(CASE WHEN jp.PostedDate >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as jobs_last_7_days,
        COUNT(CASE WHEN jp.PostedDate >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as jobs_last_30_days,
        COUNT(CASE WHEN jp.SalaryPerMonth IS NOT NULL THEN 1 END) as jobs_with_salary,
        AVG(jp.ApplicantCount)::numeric(10,2) as avg_applicants
      FROM Platform p
      LEFT JOIN JobPost jp ON jp.PlatformId = p.Id
      GROUP BY p.Name
      ORDER BY total_jobs DESC;
    `;
    
    try {
      const result = await cleanPool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting platform performance:', error.message);
      throw error;
    }
  }

  // ============================================
  // TRENDING & INSIGHTS
  // ============================================

  async getTrendingTitles(days = 30) {
    const query = `
      SELECT 
        jp.Title,
        COUNT(*) as occurrences,
        AVG(jp.SalaryPerMonth)::numeric(12,2) as avg_salary,
        AVG(jp.ApplicantCount)::numeric(10,2) as avg_applicants
      FROM JobPost jp
      WHERE jp.PostedDate >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY jp.Title
      HAVING COUNT(*) >= 3
      ORDER BY occurrences DESC
      LIMIT 20;
    `;
    
    try {
      const result = await cleanPool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting trending titles:', error.message);
      throw error;
    }
  }

  async getNewCompanies(days = 7) {
    const query = `
      SELECT 
        c.Name as company,
        c.Location,
        c.Domain,
        COUNT(jp.Id) as job_count,
        MIN(jp.PostedDate) as first_posted
      FROM Company c
      JOIN JobPost jp ON jp.CompanyId = c.Id
      WHERE c.CreatedAt >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY c.Name, c.Location, c.Domain
      ORDER BY first_posted DESC;
    `;
    
    try {
      const result = await cleanPool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting new companies:', error.message);
      throw error;
    }
  }

  async getHiringTrends() {
    const query = `
      SELECT 
        DATE_TRUNC('day', jp.PostedDate) as date,
        COUNT(*) as jobs_posted,
        COUNT(CASE WHEN jp.SalaryPerMonth IS NOT NULL THEN 1 END) as jobs_with_salary,
        AVG(jp.SalaryPerMonth)::numeric(12,2) as avg_salary
      FROM JobPost jp
      WHERE jp.PostedDate >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', jp.PostedDate)
      ORDER BY date DESC;
    `;
    
    try {
      const result = await cleanPool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting hiring trends:', error.message);
      throw error;
    }
  }

  // ============================================
  // SEARCH & FILTER
  // ============================================

  async searchJobs(filters = {}) {
    let conditions = ['1=1'];
    let params = [];
    let paramCount = 1;

    if (filters.title) {
      params.push(`%${filters.title}%`);
      conditions.push(`jp.Title ILIKE $${paramCount++}`);
    }

    if (filters.location) {
      params.push(`%${filters.location}%`);
      conditions.push(`jp.Location ILIKE $${paramCount++}`);
    }

    if (filters.minSalary) {
      params.push(filters.minSalary);
      conditions.push(`jp.SalaryPerMonth >= $${paramCount++}`);
    }

    if (filters.maxSalary) {
      params.push(filters.maxSalary);
      conditions.push(`jp.SalaryPerMonth <= $${paramCount++}`);
    }

    if (filters.experienceLevel) {
      params.push(filters.experienceLevel);
      conditions.push(`el.Name = $${paramCount++}`);
    }

    if (filters.platform) {
      params.push(filters.platform);
      conditions.push(`p.Name = $${paramCount++}`);
    }

    const query = `
      SELECT 
        jp.Id,
        jp.Title,
        c.Name as company,
        jp.Location,
        jp.SalaryPerMonth,
        cur.Code as currency,
        el.Name as experience,
        p.Name as platform,
        jp.PostedDate,
        jp.PostUrl
      FROM JobPost jp
      JOIN Company c ON jp.CompanyId = c.Id
      LEFT JOIN Currency cur ON jp.CurrencyId = cur.Id
      LEFT JOIN ExperienceLevel el ON jp.ExperienceLevelId = el.Id
      LEFT JOIN Platform p ON jp.PlatformId = p.Id
      WHERE ${conditions.join(' AND ')}
      ORDER BY jp.PostedDate DESC
      LIMIT ${filters.limit || 50};
    `;

    try {
      const result = await cleanPool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error searching jobs:', error.message);
      throw error;
    }
  }

  // ============================================
  // DASHBOARD SUMMARY
  // ============================================

  async getDashboardSummary() {
    const query = `
      SELECT 
        (SELECT COUNT(*) FROM Company) as total_companies,
        (SELECT COUNT(*) FROM JobPost) as total_jobs,
        (SELECT COUNT(*) FROM JobPost WHERE PostedDate >= CURRENT_DATE - INTERVAL '7 days') as jobs_last_week,
        (SELECT COUNT(*) FROM JobPost WHERE PostedDate >= CURRENT_DATE - INTERVAL '30 days') as jobs_last_month,
        (SELECT AVG(SalaryPerMonth)::numeric(12,2) FROM JobPost WHERE SalaryPerMonth IS NOT NULL) as avg_salary,
        (SELECT COUNT(DISTINCT CompanyId) FROM JobPost WHERE PostedDate >= CURRENT_DATE - INTERVAL '7 days') as active_companies,
        (SELECT MAX(PostedDate) FROM JobPost) as latest_job_date,
        (SELECT COUNT(*) FROM JobPost WHERE SalaryPerMonth IS NOT NULL) as jobs_with_salary;
    `;

    try {
      const result = await cleanPool.query(query);
      return result.rows[0];
    } catch (error) {
      console.error('Error getting dashboard summary:', error.message);
      throw error;
    }
  }

  async close() {
    await cleanPool.end();
  }
}

module.exports = new Analytics();