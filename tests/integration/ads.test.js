const request = require('supertest');
const app = require('../../server');
const { initDatabase, closeDatabase } = require('../../src/config/database');

describe('Ads API Integration Tests', () => {
  beforeAll(async () => {
    process.env.DB_TYPE = 'sqlite';
    process.env.SQLITE_DB_PATH = ':memory:';
    await initDatabase();

    // Run migrations inline for tests
    const db = require('../../src/config/database').getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        segment TEXT DEFAULT 'new_customers',
        total_purchases INTEGER DEFAULT 0,
        average_order_value DECIMAL(10, 2) DEFAULT 0,
        last_purchase_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS campaigns (
        campaign_id TEXT PRIMARY KEY,
        advertiser_name TEXT NOT NULL,
        target_segments TEXT,
        ad_creative_url TEXT NOT NULL,
        redirect_url TEXT,
        bid_amount DECIMAL(10, 4) NOT NULL,
        budget_total DECIMAL(10, 2),
        budget_remaining DECIMAL(10, 2) NOT NULL,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'active',
        frequency_cap INTEGER DEFAULT 3,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS impressions (
        impression_id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        device_type TEXT DEFAULT 'desktop',
        placement TEXT DEFAULT 'homepage_banner'
      );

      CREATE TABLE IF NOT EXISTS clicks (
        click_id TEXT PRIMARY KEY,
        impression_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        redirect_url TEXT
      );
    `);
  });

  afterAll(() => {
    closeDatabase();
  });

  const apiKey = 'ak_demo_key_12345';

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });

  describe('POST /api/v1/ads/request', () => {
    it('should return 401 without API key', async () => {
      const res = await request(app)
        .post('/api/v1/ads/request')
        .send({ user_id: 'user_123' });

      expect(res.statusCode).toBe(401);
    });

    it('should return an ad for valid request', async () => {
      const res = await request(app)
        .post('/api/v1/ads/request')
        .set('x-api-key', apiKey)
        .send({
          user_id: 'user_test_123',
          placement: 'homepage_banner',
          device_type: 'mobile'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('ad');
      expect(res.body).toHaveProperty('meta');
    });

    it('should return 400 for missing user_id', async () => {
      const res = await request(app)
        .post('/api/v1/ads/request')
        .set('x-api-key', apiKey)
        .send({
          placement: 'homepage_banner'
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/segments', () => {
    it('should return available segments', async () => {
      const res = await request(app)
        .get('/api/v1/segments')
        .set('x-api-key', apiKey);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('segments');
      expect(Array.isArray(res.body.segments)).toBe(true);
    });
  });

  describe('POST /api/v1/campaigns', () => {
    it('should create a new campaign', async () => {
      const res = await request(app)
        .post('/api/v1/campaigns')
        .set('x-api-key', apiKey)
        .send({
          advertiser_name: 'Test Advertiser',
          target_segments: ['new_customers'],
          ad_creative_url: 'https://example.com/banner.jpg',
          bid_amount: 5.00,
          budget_remaining: 1000
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('campaign_id');
      expect(res.body.advertiser_name).toBe('Test Advertiser');
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/campaigns')
        .set('x-api-key', apiKey)
        .send({
          advertiser_name: 'Test'
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/campaigns', () => {
    it('should list campaigns', async () => {
      const res = await request(app)
        .get('/api/v1/campaigns')
        .set('x-api-key', apiKey);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('campaigns');
      expect(res.body).toHaveProperty('pagination');
    });
  });
});
