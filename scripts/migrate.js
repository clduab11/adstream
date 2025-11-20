#!/usr/bin/env node

/**
 * Database Migration Script
 * Creates all required tables for ADSTREAM
 */

require('dotenv').config();

const { initDatabase, getDbType } = require('../src/config/database');

const migrations = [
  {
    name: 'create_users_table',
    up: `
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        segment TEXT DEFAULT 'new_customers',
        total_purchases INTEGER DEFAULT 0,
        average_order_value DECIMAL(10, 2) DEFAULT 0,
        last_purchase_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    down: 'DROP TABLE IF EXISTS users'
  },
  {
    name: 'create_campaigns_table',
    up: `
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
      )
    `,
    down: 'DROP TABLE IF EXISTS campaigns'
  },
  {
    name: 'create_impressions_table',
    up: `
      CREATE TABLE IF NOT EXISTS impressions (
        impression_id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        device_type TEXT DEFAULT 'desktop',
        placement TEXT DEFAULT 'homepage_banner',
        FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      )
    `,
    down: 'DROP TABLE IF EXISTS impressions'
  },
  {
    name: 'create_clicks_table',
    up: `
      CREATE TABLE IF NOT EXISTS clicks (
        click_id TEXT PRIMARY KEY,
        impression_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        redirect_url TEXT,
        FOREIGN KEY (impression_id) REFERENCES impressions(impression_id) ON DELETE CASCADE,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      )
    `,
    down: 'DROP TABLE IF EXISTS clicks'
  },
  {
    name: 'create_indexes',
    up: `
      CREATE INDEX IF NOT EXISTS idx_impressions_campaign_timestamp ON impressions(campaign_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_impressions_user_timestamp ON impressions(user_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_impressions_campaign_user ON impressions(campaign_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_clicks_campaign_timestamp ON clicks(campaign_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_clicks_impression ON clicks(impression_id);
      CREATE INDEX IF NOT EXISTS idx_users_segment ON users(segment);
      CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);
    `,
    down: `
      DROP INDEX IF EXISTS idx_impressions_campaign_timestamp;
      DROP INDEX IF EXISTS idx_impressions_user_timestamp;
      DROP INDEX IF EXISTS idx_impressions_campaign_user;
      DROP INDEX IF EXISTS idx_clicks_campaign_timestamp;
      DROP INDEX IF EXISTS idx_clicks_impression;
      DROP INDEX IF EXISTS idx_users_segment;
      DROP INDEX IF EXISTS idx_campaigns_status;
      DROP INDEX IF EXISTS idx_campaigns_dates;
    `
  }
];

async function runMigrations(direction = 'up') {
  console.log(`\nRunning ${direction === 'up' ? 'migrations' : 'rollback'}...\n`);

  const db = initDatabase();
  const dbType = getDbType();

  const migrationsToRun = direction === 'up' ? migrations : [...migrations].reverse();

  for (const migration of migrationsToRun) {
    const sql = direction === 'up' ? migration.up : migration.down;

    try {
      if (dbType === 'sqlite') {
        // Split multiple statements for SQLite
        const statements = sql.split(';').filter(s => s.trim());
        for (const statement of statements) {
          if (statement.trim()) {
            db.exec(statement);
          }
        }
      } else {
        // PostgreSQL can handle multiple statements
        await db.query(sql);
      }

      console.log(`  ✓ ${migration.name}`);
    } catch (error) {
      console.error(`  ✗ ${migration.name}: ${error.message}`);
      if (direction === 'up') {
        process.exit(1);
      }
    }
  }

  console.log(`\nMigrations ${direction === 'up' ? 'completed' : 'rolled back'} successfully!\n`);
}

// Run migrations
const direction = process.argv[2] === 'down' ? 'down' : 'up';
runMigrations(direction).catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
