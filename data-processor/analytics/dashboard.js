const analytics = require('./queries');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function printHeader(title) {
  console.log('\n' + '='.repeat(80));
  console.log(`📊 ${title}`);
  console.log('='.repeat(80) + '\n');
}

function formatCurrency(amount, currency = 'VND') {
  if (!amount) return 'N/A';
  if (currency === 'VND') {
    return `${(amount / 1000000).toFixed(1)}M VND`;
  }
  return `$${amount.toLocaleString()}`;
}

async function showMainMenu() {
  console.clear();
  console.log('\n' + '🎯 '.repeat(40));
  console.log('📊 JOB MARKET ANALYTICS DASHBOARD');
  console.log('🎯 '.repeat(40) + '\n');

  console.log('1.  📈 Dashboard Summary');
  console.log('2.  💰 Salary Analytics');
  console.log('3.  📍 Location Analytics');
  console.log('4.  🏢 Platform Performance');
  console.log('5.  🔥 Trending Jobs');
  console.log('6.  🆕 New Companies');
  console.log('7.  📊 Hiring Trends (Last 30 Days)');
  console.log('8.  🎯 Top Paying Companies');
  console.log('9.  🏠 Remote Jobs');
  console.log('10. 🔍 Search Jobs');
  console.log('0.  ❌ Exit\n');

  const choice = await askQuestion('Select option: ');
  return choice.trim();
}

async function showDashboardSummary() {
  printHeader('DASHBOARD SUMMARY');
  
  const summary = await analytics.getDashboardSummary();
  
  console.log(`📦 Total Companies:        ${summary.total_companies}`);
  console.log(`📄 Total Jobs:             ${summary.total_jobs}`);
  console.log(`📅 Jobs (Last 7 Days):     ${summary.jobs_last_week}`);
  console.log(`📅 Jobs (Last 30 Days):    ${summary.jobs_last_month}`);
  console.log(`💰 Average Salary:         ${formatCurrency(summary.avg_salary)}`);
  console.log(`🏢 Active Companies (7d):  ${summary.active_companies}`);
  console.log(`📊 Jobs with Salary:       ${summary.jobs_with_salary} (${((summary.jobs_with_salary/summary.total_jobs)*100).toFixed(1)}%)`);
  console.log(`📆 Latest Job Posted:      ${summary.latest_job_date}\n`);

  await askQuestion('Press Enter to continue...');
}

async function showSalaryAnalytics() {
  printHeader('SALARY ANALYTICS');
  
  console.log('1. Salary by Platform');
  console.log('2. Salary by Experience Level');
  console.log('3. Top Paying Companies\n');
  
  const choice = await askQuestion('Select: ');
  
  if (choice === '1') {
    const data = await analytics.getSalaryStatsByPlatform();
    console.log('\n💰 Salary Statistics by Platform:\n');
    console.table(data.map(d => ({
      Platform: d.platform,
      Jobs: d.job_count,
      'Avg Salary': formatCurrency(d.avg_salary, d.currency),
      'Min': formatCurrency(d.min_salary, d.currency),
      'Max': formatCurrency(d.max_salary, d.currency),
      'Median': formatCurrency(d.median_salary, d.currency)
    })));
  } else if (choice === '2') {
    const data = await analytics.getSalaryByExperience();
    console.log('\n💼 Salary by Experience Level:\n');
    console.table(data.map(d => ({
      Level: d.experience_level,
      Jobs: d.job_count,
      'Avg': formatCurrency(d.avg_salary),
      'Min': formatCurrency(d.min_salary),
      'Max': formatCurrency(d.max_salary)
    })));
  } else if (choice === '3') {
    const limit = await askQuestion('How many companies? (default 20): ');
    const data = await analytics.getTopPayingCompanies(parseInt(limit) || 20);
    console.log('\n🏆 Top Paying Companies:\n');
    console.table(data.map(d => ({
      Company: d.company,
      Location: d.location,
      Jobs: d.job_count,
      'Avg Salary': formatCurrency(d.avg_salary),
      'Max Salary': formatCurrency(d.max_salary)
    })));
  }
  
  await askQuestion('\nPress Enter to continue...');
}

async function showLocationAnalytics() {
  printHeader('LOCATION ANALYTICS');
  
  const data = await analytics.getJobsByLocation();
  console.table(data.map(d => ({
    City: d.city,
    Country: d.country,
    'Job Count': d.job_count,
    'Avg Salary': formatCurrency(d.avg_salary)
  })));
  
  await askQuestion('\nPress Enter to continue...');
}

async function showPlatformPerformance() {
  printHeader('PLATFORM PERFORMANCE');
  
  const data = await analytics.getPlatformPerformance();
  console.table(data.map(d => ({
    Platform: d.platform,
    'Total Jobs': d.total_jobs,
    'Last 7d': d.jobs_last_7_days,
    'Last 30d': d.jobs_last_30_days,
    'With Salary': d.jobs_with_salary,
    'Avg Applicants': d.avg_applicants || 'N/A'
  })));
  
  await askQuestion('\nPress Enter to continue...');
}

async function showTrendingJobs() {
  printHeader('TRENDING JOB TITLES');
  
  const days = await askQuestion('Days to analyze (default 30): ');
  const data = await analytics.getTrendingTitles(parseInt(days) || 30);
  
  console.table(data.map(d => ({
    Title: d.title,
    Count: d.occurrences,
    'Avg Salary': formatCurrency(d.avg_salary),
    'Avg Applicants': d.avg_applicants || 'N/A'
  })));
  
  await askQuestion('\nPress Enter to continue...');
}

async function showNewCompanies() {
  printHeader('NEW COMPANIES');
  
  const days = await askQuestion('Days to look back (default 7): ');
  const data = await analytics.getNewCompanies(parseInt(days) || 7);
  
  if (data.length === 0) {
    console.log('No new companies found in this period.\n');
  } else {
    console.table(data.map(d => ({
      Company: d.company,
      Location: d.location,
      Domain: d.domain || 'N/A',
      'Job Count': d.job_count,
      'First Posted': d.first_posted
    })));
  }
  
  await askQuestion('\nPress Enter to continue...');
}

async function showHiringTrends() {
  printHeader('HIRING TRENDS (Last 30 Days)');
  
  const data = await analytics.getHiringTrends();
  console.table(data.map(d => ({
    Date: d.date.toISOString().split('T')[0],
    'Jobs Posted': d.jobs_posted,
    'With Salary': d.jobs_with_salary,
    'Avg Salary': formatCurrency(d.avg_salary)
  })));
  
  await askQuestion('\nPress Enter to continue...');
}

async function showTopPayingCompanies() {
  printHeader('TOP PAYING COMPANIES');
  
  const limit = await askQuestion('How many companies? (default 20): ');
  const data = await analytics.getTopPayingCompanies(parseInt(limit) || 20);
  
  console.table(data.map((d, idx) => ({
    Rank: idx + 1,
    Company: d.company,
    Location: d.location,
    Jobs: d.job_count,
    'Avg Salary': formatCurrency(d.avg_salary),
    'Max Salary': formatCurrency(d.max_salary)
  })));
  
  await askQuestion('\nPress Enter to continue...');
}

async function showRemoteJobs() {
  printHeader('REMOTE JOBS');
  
  const data = await analytics.getRemoteJobs();
  
  if (data.length === 0) {
    console.log('No remote jobs found.\n');
  } else {
    console.table(data.map(d => ({
      Title: d.title.substring(0, 40),
      Company: d.company,
      Salary: d.salarypermonth ? formatCurrency(d.salarypermonth, d.currency) : 'N/A',
      Experience: d.experience || 'N/A',
      Platform: d.platform,
      Posted: d.posteddate
    })));
  }
  
  await askQuestion('\nPress Enter to continue...');
}

async function searchJobs() {
  printHeader('SEARCH JOBS');
  
  console.log('Leave blank to skip a filter\n');
  
  const filters = {};
  
  const title = await askQuestion('Job title (e.g., "software engineer"): ');
  if (title) filters.title = title;
  
  const location = await askQuestion('Location (e.g., "Ho Chi Minh"): ');
  if (location) filters.location = location;
  
  const minSalary = await askQuestion('Min salary (VND): ');
  if (minSalary) filters.minSalary = parseInt(minSalary);
  
  const maxSalary = await askQuestion('Max salary (VND): ');
  if (maxSalary) filters.maxSalary = parseInt(maxSalary);
  
  const experience = await askQuestion('Experience (Internship/Entry/Mid/Senior/Lead/Executive): ');
  if (experience) filters.experienceLevel = experience;
  
  const platform = await askQuestion('Platform (Careerviet/LinkedIn/ITviec/etc): ');
  if (platform) filters.platform = platform;
  
  const limit = await askQuestion('Max results (default 50): ');
  if (limit) filters.limit = parseInt(limit);
  
  console.log('\n🔍 Searching...\n');
  
  const results = await analytics.searchJobs(filters);
  
  if (results.length === 0) {
    console.log('❌ No jobs found matching your criteria.\n');
  } else {
    console.log(`✅ Found ${results.length} jobs:\n`);
    console.table(results.map(d => ({
      Title: d.title.substring(0, 35),
      Company: d.company.substring(0, 20),
      Location: d.location || 'N/A',
      Salary: d.salarypermonth ? formatCurrency(d.salarypermonth, d.currency) : 'N/A',
      Experience: d.experience || 'N/A',
      Platform: d.platform,
      Posted: d.posteddate
    })));
  }
  
  await askQuestion('\nPress Enter to continue...');
}

async function main() {
  let running = true;
  
  while (running) {
    try {
      const choice = await showMainMenu();
      
      switch (choice) {
        case '1':
          await showDashboardSummary();
          break;
        case '2':
          await showSalaryAnalytics();
          break;
        case '3':
          await showLocationAnalytics();
          break;
        case '4':
          await showPlatformPerformance();
          break;
        case '5':
          await showTrendingJobs();
          break;
        case '6':
          await showNewCompanies();
          break;
        case '7':
          await showHiringTrends();
          break;
        case '8':
          await showTopPayingCompanies();
          break;
        case '9':
          await showRemoteJobs();
          break;
        case '10':
          await searchJobs();
          break;
        case '0':
          running = false;
          console.log('\n👋 Goodbye!\n');
          break;
        default:
          console.log('\n❌ Invalid option\n');
          await askQuestion('Press Enter to continue...');
      }
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      await askQuestion('\nPress Enter to continue...');
    }
  }
  
  rl.close();
  await analytics.close();
  process.exit(0);
}

main();