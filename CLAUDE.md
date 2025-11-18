# ADSTREAM Development Guide

## Quick Start Commands

```bash
npm install           # Install dependencies
npm run dev          # Start development server with nodemon (auto-reload)
npm run start        # Start production server
npm test             # Run Jest test suite with coverage
npm run seed         # Populate database with sample data (100 users, 20 campaigns, 10k impressions)
npm run migrate      # Run database migrations
npm run lint         # ESLint code quality check
```

## Code Style

- Use ES6+ syntax: async/await, arrow functions, destructuring
- 2-space indentation, semicolons required
- File naming: kebab-case for files, camelCase for functions, PascalCase for classes
- Always use prepared statements for SQL queries (prevent injection)
- Maximum function length: 50 lines (extract to helper functions)

## Database Management

- **SQLite**: Development/demo mode (file: `./data/adstream.db`)
- **PostgreSQL**: Production mode (configure via `DATABASE_URL` env var)
- Run migrations before starting server: `npm run migrate`
- All timestamps stored in UTC, convert to user timezone in API responses

## Testing Requirements

- Mock database calls using Jest mocks
- Test error scenarios: invalid user_id, expired campaigns, database failures
- Target 90% coverage on services and controllers
- Use supertest for API integration tests

## Performance Targets

- Ad request endpoint: <100ms p95 latency
- Database connection pool: min 5, max 20 connections
- Impression batch inserts: group writes every 5 seconds in production
- Enable query logging in development: set `DEBUG=true` in .env

## Security

- API keys required for all endpoints (except health check)
- Rate limit: 1000 requests/hour per API key
- Validate all user input: sanitize strings, validate UUIDs
- Sign impression IDs using HMAC-SHA256 with `SECRET_KEY` from .env

## Project Structure

```
/adstream
├── src/
│   ├── config/           # Database and app configuration
│   ├── models/           # Data access layer
│   ├── services/         # Business logic
│   ├── controllers/      # Request handlers
│   ├── routes/           # API route definitions
│   ├── middleware/       # Auth, rate limiting, error handling
│   └── utils/            # Logger, crypto utilities
├── tests/                # Jest test files
├── scripts/              # Migration and seeding scripts
├── server.js             # Express app entry point
└── package.json
```

## API Overview

### Ad Serving
- `POST /api/v1/ads/request` - Request an ad for a user
- `POST /api/v1/ads/impression/:id` - Record impression
- `POST /api/v1/ads/click/:id` - Record click

### Campaigns
- `GET /api/v1/campaigns` - List campaigns
- `POST /api/v1/campaigns` - Create campaign
- `GET /api/v1/campaigns/:id/metrics` - Get metrics

### Segments
- `GET /api/v1/segments` - Available segments
- `GET /api/v1/segments/performance` - Segment performance

## Environment Variables

Copy `.env.example` to `.env` and configure:

```
PORT=3000
NODE_ENV=development
DB_TYPE=sqlite
SECRET_KEY=your-secret-key
```

## Demo API Key

For testing, use the demo API key in the `x-api-key` header:
```
ak_demo_key_12345
```

## Common Tasks

### Creating a Campaign
```bash
curl -X POST http://localhost:3000/api/v1/campaigns \
  -H "Content-Type: application/json" \
  -H "x-api-key: ak_demo_key_12345" \
  -d '{
    "advertiser_name": "Test Advertiser",
    "target_segments": ["frequent_buyers"],
    "ad_creative_url": "https://example.com/banner.jpg",
    "bid_amount": 5.00,
    "budget_remaining": 1000
  }'
```

### Requesting an Ad
```bash
curl -X POST http://localhost:3000/api/v1/ads/request \
  -H "Content-Type: application/json" \
  -H "x-api-key: ak_demo_key_12345" \
  -d '{
    "user_id": "user_12345",
    "placement": "homepage_banner",
    "device_type": "mobile"
  }'
```

### Getting Campaign Metrics
```bash
curl http://localhost:3000/api/v1/campaigns/CAMPAIGN_ID/metrics \
  -H "x-api-key: ak_demo_key_12345"
```
