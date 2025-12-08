# Data Processor

Automated ETL pipeline that transforms raw job data into clean, normalized database records.

## 🎯 Purpose

Reads unprocessed jobs from Raw DB, applies platform-specific transformations using YAML configs, and inserts clean data into the Clean DB.

## 📦 Installation

```bash
npm install
```

## ⚙️ Configuration

Create `.env` file:

```env
# Raw Database (read from)
RAW_DB_HOST=localhost
RAW_DB_PORT=5432
RAW_DB_NAME=jobcrawler_raw_db
RAW_DB_USER=jobcrawler_user
RAW_DB_PASSWORD=your_password

# Clean Database (write to)
CLEAN_DB_HOST=localhost
CLEAN_DB_PORT=5432
CLEAN_DB_NAME=jobcrawler_db
CLEAN_DB_USER=jobcrawler_user
CLEAN_DB_PASSWORD=your_password

# Processing Settings
BATCH_SIZE=100
PROCESS_INTERVAL=*/5 * * * *
LOG_LEVEL=info
RUN_MODE=cron

# AI Processing (Optional)
AI_ENABLED=false
GEMINI_API_KEY=
CLAUDE_API_KEY=
AI_PROVIDER=gemini
```

## 🚀 Usage

### Run Once (Testing)

```bash
npm run process-once
```

### Run Continuously (Production)

```bash
npm start
```

### With PM2

```bash
pm2 start index.js --name data-processor
pm2 save
```

## 📊 Analytics Dashboard

```bash
npm run dashboard
```

Interactive menu with:
- 📈 Dashboard Summary
- 💰 Salary Analytics
- 📍 Location Analytics
- 🏢 Platform Performance
- 🔥 Trending Jobs
- 🔍 Job Search

## 🧪 Testing

```bash
# Insert test data
npm run test-data

# Check processing status
npm run status

# Process once
npm run process-once

# Clear all data
npm run clear-db
```

## 📂 Project Structure

```
data-processor/
├── config/                  # YAML transformation rules
│   ├── global.yaml         # Platform registry
│   ├── careerviet.yaml     # CareerViet patterns
│   ├── linkedin.yaml       # LinkedIn patterns
│   └── ...
├── processors/             # Platform-specific logic
│   ├── BaseProcessor.js
│   ├── CareerVietProcessor.js
│   └── ...
├── utils/                  # Shared utilities
│   ├── salary_parser.js
│   ├── experience_mapper.js
│   └── ...
├── services/               # Core services
│   ├── database.js
│   ├── ai_processor.js
│   └── logger.js
├── analytics/              # Analytics queries
│   ├── queries.js
│   ├── dashboard.js
│   └── export-csv.js
└── test/                   # Test scripts
    ├── test-processor.js
    ├── check-status.js
    └── clear-databases.js
```

## 🔧 YAML Configuration

Each platform has a YAML config defining transformation rules:

```yaml
# config/careerviet.yaml
platform_name: "CareerViet"
platform_id: 3

salary:
  method: "manual"
  patterns:
    - regex: '(\d+)\s*Mil\s*-\s*(\d+)\s*Mil\s*(VND|USD)'
      type: "range"
      multiplier: 1000000
  
  ai_fallback:
    enabled: true
  
  default_currency: "VND"

experience_level:
  method: "manual"
  mappings:
    "Senior": "Senior"
    "Junior": "Entry"
  default: "Entry"

location:
  method: "manual"
  city_mappings:
    "HCM": "Ho Chi Minh City"
  default_country: 'VNM'
```

## 📈 Processing Flow

1. **Fetch** unprocessed jobs from Raw DB (by platform)
2. **Load** YAML config for platform
3. **Transform** each field:
   - Parse salary ranges
   - Normalize locations
   - Map experience levels
   - Clean descriptions
4. **Validate** data
5. **Insert** into Clean DB
6. **Mark** as processed in Raw DB

## 📊 npm Scripts

```bash
npm start              # Start in cron mode
npm run dev            # Start with nodemon
npm run process-once   # Run once and exit
npm run test-data      # Insert test data
npm run status         # Check processing status
npm run clear-db       # Clear all databases
npm run dashboard      # Open analytics dashboard
npm run export-reports # Export CSV reports
npm run logs           # Tail combined logs
npm run logs-error     # Tail error logs
npm run stats          # Tail stats logs
npm run clean-logs     # Delete log files
```

## 🤖 AI Processing

Enable AI for complex field parsing:

1. Get API key (Gemini/Claude/OpenAI)
2. Set in `.env`:
   ```env
   AI_ENABLED=true
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your_key
   ```
3. Configure in YAML:
   ```yaml
   salary:
     method: "ai"  # Use AI for all
     # OR
     method: "manual"
     ai_fallback:
       enabled: true  # Use AI as fallback
   ```

## 📊 Analytics Queries

Use programmatically:

```javascript
const analytics = require('./analytics/queries');

// Get dashboard summary
const summary = await analytics.getDashboardSummary();

// Search jobs
const jobs = await analytics.searchJobs({
  title: 'engineer',
  location: 'Ho Chi Minh',
  minSalary: 20000000
});

// Get salary stats
const stats = await analytics.getSalaryStatsByPlatform();
```

## 📦 Dependencies

```json
{
  "axios": "^1.6.2",
  "dotenv": "^17.2.3",
  "js-yaml": "^4.1.0",
  "node-cron": "^3.0.3",
  "pg": "^8.11.3",
  "winston": "^3.11.0"
}
```

## 📝 Logs

```bash
# Real-time log monitoring
npm run logs         # All logs
npm run logs-error   # Errors only
npm run stats        # Stats only

# Log files location
logs/combined.log
logs/error.log
logs/stats.log
```

## 🐛 Troubleshooting

**Jobs not being processed:**
- Check platform is enabled in `global.yaml`
- Verify processor class exists
- Check logs for errors

**Salary parsing fails:**
- Review actual salary strings in Raw DB
- Update regex patterns in YAML
- Enable AI fallback

**Permission denied:**
```bash
psql -U postgres -d jobcrawler_db
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO jobcrawler_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jobcrawler_user;
```

## 🚀 Production Deployment

1. Deploy to VPS
2. Install dependencies: `npm install --production`
3. Configure `.env`
4. Start with PM2: `pm2 start index.js --name data-processor`
5. Monitor: `pm2 logs data-processor`

## 📊 Monitoring

```bash
# PM2 status
pm2 status
pm2 monit

# Processing stats
npm run status

# Database queries
psql -U jobcrawler_user -d jobcrawler_db -c "
  SELECT COUNT(*) FROM JobPost WHERE CreatedAt > NOW() - INTERVAL '1 hour';
"
```