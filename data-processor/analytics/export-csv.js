const analytics = require('./queries');
const fs = require('fs');
const path = require('path');

async function exportToCSV(filename, data) {
  if (data.length === 0) {
    console.log('No data to export');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];

  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      return typeof value === 'string' ? `"${value}"` : value;
    });
    csvRows.push(values.join(','));
  }

  const csvContent = csvRows.join('\n');
  const filepath = path.join(__dirname, 'exports', filename);

  // Create exports directory if it doesn't exist
  if (!fs.existsSync(path.join(__dirname, 'exports'))) {
    fs.mkdirSync(path.join(__dirname, 'exports'));
  }

  fs.writeFileSync(filepath, csvContent);
  console.log(`✅ Exported to ${filepath}`);
}

async function exportAllReports() {
  console.log('📊 Exporting analytics reports...\n');

  try {
    // Dashboard summary
    const summary = await analytics.getDashboardSummary();
    await exportToCSV('dashboard-summary.csv', [summary]);

    // Salary stats
    const salaryStats = await analytics.getSalaryStatsByPlatform();
    await exportToCSV('salary-by-platform.csv', salaryStats);

    // Location stats
    const locationStats = await analytics.getJobsByLocation();
    await exportToCSV('jobs-by-location.csv', locationStats);

    // Platform performance
    const platformStats = await analytics.getPlatformPerformance();
    await exportToCSV('platform-performance.csv', platformStats);

    // Trending jobs
    const trending = await analytics.getTrendingTitles(30);
    await exportToCSV('trending-jobs.csv', trending);

    // Hiring trends
    const hiringTrends = await analytics.getHiringTrends();
    await exportToCSV('hiring-trends.csv', hiringTrends);

    console.log('\n✅ All reports exported successfully!');
    console.log(`📁 Location: ${path.join(__dirname, 'exports')}\n`);

  } catch (error) {
    console.error('❌ Export failed:', error.message);
  } finally {
    await analytics.close();
  }
}

exportAllReports();