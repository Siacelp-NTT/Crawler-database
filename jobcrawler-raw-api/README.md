# Raw API

RESTful API for inserting scraped job data into the Raw Database.

## 🎯 Purpose

Provides HTTP endpoints for web crawlers to submit job postings. Data is stored in a flexible schema for later processing.

## 📦 Installation

```bash
npm install
```

## ⚙️ Configuration

Create `.env` file:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jobcrawler_raw_db
DB_USER=jobcrawler_user
DB_PASSWORD=your_password
PORT=3000
MAX_FILE_SIZE=10485760
NODE_ENV=development
```

## 🚀 Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

### With PM2

```bash
pm2 start index.js --name raw-api
pm2 save
```

## 📡 API Endpoints

### Health Check

```bash
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-08T10:30:00.000Z",
  "database": "connected"
}
```

### Insert Job Posting

```bash
POST /api/jobposts
Content-Type: application/json

{
  "company_name": "Tech Corp",
  "job_title": "Software Engineer",
  "description": "Job description here",
  "salary": "20 Mil - 30 Mil VND",
  "work_type": "Full-time",
  "experience_level": "Senior",
  "location": "Ho Chi Minh City",
  "platform": "CareerViet",
  "url": "https://example.com/job/123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "company_id": "uuid"
  }
}
```

### Insert Company

```bash
POST /api/companies
Content-Type: application/json

{
  "company_name": "Tech Corp",
  "location": "Ho Chi Minh City",
  "url": "https://techcorp.com"
}
```

### Bulk Insert

```bash
POST /api/jobposts/bulk
Content-Type: application/json

[
  {
    "company_name": "Company A",
    "job_title": "Job 1",
    ...
  },
  {
    "company_name": "Company B",
    "job_title": "Job 2",
    ...
  }
]
```

### Upload CSV

```bash
POST /api/upload/csv
Content-Type: multipart/form-data

file: [CSV file]
```

**CSV Format:**
```csv
company_name,job_title,description,salary,work_type,experience_level,location,platform,url
Tech Corp,Engineer,Description,20M-30M,Full-time,Senior,HCMC,CareerViet,https://...
```

## 🔐 Security

- Input validation on all endpoints
- SQL injection prevention
- File upload size limits
- CORS enabled for specified origins
- Rate limiting recommended for production

## 📊 Monitoring

```bash
# View logs
tail -f logs/combined.log

# Check status
curl http://localhost:3000/api/health
```

## 🧪 Testing

```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Test job insertion
curl -X POST http://localhost:3000/api/jobposts \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Test Corp",
    "job_title": "Test Job",
    "platform": "CareerViet",
    "url": "https://test.com/job/1"
  }'
```

## 📦 Dependencies

```json
{
  "express": "^4.18.2",
  "pg": "^8.11.3",
  "dotenv": "^17.2.3",
  "multer": "^1.4.5-lts.1",
  "csv-parser": "^3.0.0",
  "winston": "^3.11.0"
}
```

## 🚀 Production Deployment

1. Set `NODE_ENV=production`
2. Use PM2 for process management
3. Setup Nginx reverse proxy
4. Enable HTTPS with Let's Encrypt
5. Configure firewall (UFW)

## 📝 Logs

Logs are stored in `logs/` directory:
- `combined.log` - All logs
- `error.log` - Errors only

## 🐛 Troubleshooting

**Database connection failed:**
- Check PostgreSQL is running
- Verify credentials in `.env`
- Ensure database exists

**File upload fails:**
- Check `MAX_FILE_SIZE` setting
- Verify `uploads/` directory exists and is writable

**Port already in use:**
- Change `PORT` in `.env`
- Kill process using port: `lsof -ti:3000 | xargs kill`