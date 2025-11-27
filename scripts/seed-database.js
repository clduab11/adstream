#!/usr/bin/env node

/**
 * Database Seeding Script
 * Generates sample data for ADSTREAM
 */

require('dotenv').config();

const { initDatabase } = require('../src/config/database');
const UserModel = require('../src/models/user.model');
const CampaignModel = require('../src/models/campaign.model');
const TrackingModel = require('../src/models/tracking.model');
const { SEGMENTS, PLACEMENTS, DEVICE_TYPES } = require('../src/config/constants');
const { generateUserId, generateCampaignId } = require('../src/utils/crypto');

// Configuration
const NUM_USERS = 100;
const NUM_CAMPAIGNS = 20;
const NUM_IMPRESSIONS = 10000;
const CLICK_RATE = 0.03; // 3% CTR

// Sample data
const advertisers = [
  'TechGadgets Pro',
  'Fashion Forward',
  'Home Essentials',
  'Sports & Outdoors',
  'Beauty Plus',
  'Food & Gourmet',
  'Electronics Hub',
  'Kids & Toys',
  'Auto Parts Direct',
  'Health & Wellness'
];

const creativeUrls = [
  'https://cdn.adstream.example/banners/tech_sale.jpg',
  'https://cdn.adstream.example/banners/fashion_spring.jpg',
  'https://cdn.adstream.example/banners/home_deals.jpg',
  'https://cdn.adstream.example/banners/sports_gear.jpg',
  'https://cdn.adstream.example/banners/beauty_new.jpg',
  'https://cdn.adstream.example/banners/gourmet_food.jpg',
  'https://cdn.adstream.example/banners/electronics.jpg',
  'https://cdn.adstream.example/banners/toys_holiday.jpg',
  'https://cdn.adstream.example/banners/auto_parts.jpg',
  'https://cdn.adstream.example/banners/wellness.jpg'
];

const segments = Object.values(SEGMENTS);
const placements = Object.values(PLACEMENTS);
const deviceTypes = Object.values(DEVICE_TYPES);

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seedUsers() {
  console.log(`\nSeeding ${NUM_USERS} users...`);

  const users = [];
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < NUM_USERS; i++) {
    const userId = generateUserId();
    const totalPurchases = randomInt(0, 50);
    const avgOrderValue = randomInt(20, 300);

    const user = UserModel.create({
      user_id: userId,
      username: `user_${i + 1}`,
      email: `user${i + 1}@example.com`,
      segment: randomElement(segments),
      total_purchases: totalPurchases,
      average_order_value: avgOrderValue,
      last_purchase_date: totalPurchases > 0
        ? randomDate(sixMonthsAgo, now).toISOString()
        : null
    });

    users.push(user);

    if ((i + 1) % 25 === 0) {
      console.log(`  Created ${i + 1} users...`);
    }
  }

  console.log(`  ✓ Created ${NUM_USERS} users`);
  return users;
}

async function seedCampaigns() {
  console.log(`\nSeeding ${NUM_CAMPAIGNS} campaigns...`);

  const campaigns = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < NUM_CAMPAIGNS; i++) {
    const numTargetSegments = randomInt(1, 3);
    const targetSegments = [];
    for (let j = 0; j < numTargetSegments; j++) {
      const seg = randomElement(segments);
      if (!targetSegments.includes(seg)) {
        targetSegments.push(seg);
      }
    }

    const budget = randomInt(500, 5000);

    const campaign = CampaignModel.create({
      campaign_id: generateCampaignId(),
      advertiser_name: advertisers[i % advertisers.length],
      target_segments: targetSegments,
      ad_creative_url: creativeUrls[i % creativeUrls.length],
      redirect_url: `https://${advertisers[i % advertisers.length].toLowerCase().replace(/\s+/g, '')}.com/promo`,
      bid_amount: randomInt(100, 1099) / 100,
      budget_total: budget,
      budget_remaining: budget * (0.5 + Math.random() * 0.5),
      start_date: thirtyDaysAgo.toISOString(),
      end_date: thirtyDaysFromNow.toISOString(),
      status: i < 18 ? 'active' : (i < 19 ? 'paused' : 'completed'),
      frequency_cap: randomInt(2, 5)
    });

    campaigns.push(campaign);
  }

  console.log(`  ✓ Created ${NUM_CAMPAIGNS} campaigns`);
  return campaigns;
}

async function seedImpressions(users, campaigns) {
  console.log(`\nSeeding ${NUM_IMPRESSIONS} impressions...`);

  const impressions = [];

  const activeCampaigns = campaigns.filter(c => c.status === 'active');

  for (let i = 0; i < NUM_IMPRESSIONS; i++) {
    const user = randomElement(users);
    const campaign = randomElement(activeCampaigns);

    const impression = TrackingModel.createImpression({
      campaign_id: campaign.campaign_id,
      user_id: user.user_id,
      device_type: randomElement(deviceTypes),
      placement: randomElement(placements)
    });

    impressions.push({
      ...impression,
      campaign_id: campaign.campaign_id,
      user_id: user.user_id
    });

    if ((i + 1) % 2500 === 0) {
      console.log(`  Created ${i + 1} impressions...`);
    }
  }

  console.log(`  ✓ Created ${NUM_IMPRESSIONS} impressions`);
  return impressions;
}

async function seedClicks(impressions) {
  const numClicks = Math.floor(impressions.length * CLICK_RATE);
  console.log(`\nSeeding ${numClicks} clicks (${CLICK_RATE * 100}% CTR)...`);

  // Randomly select impressions to have clicks
  const shuffled = [...impressions].sort(() => Math.random() - 0.5);
  const impressionsWithClicks = shuffled.slice(0, numClicks);

  for (const impression of impressionsWithClicks) {
    TrackingModel.createClick({
      impression_id: impression.impression_id,
      campaign_id: impression.campaign_id,
      user_id: impression.user_id,
      redirect_url: `https://advertiser.com/landing?campaign=${impression.campaign_id}`
    });
  }

  console.log(`  ✓ Created ${numClicks} clicks`);
}

async function main() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║         ADSTREAM Database Seeder              ║');
  console.log('╚═══════════════════════════════════════════════╝');

  try {
    // Initialize database
    initDatabase();
    console.log('\nDatabase connected.');

    // Seed data
    const users = await seedUsers();
    const campaigns = await seedCampaigns();
    const impressions = await seedImpressions(users, campaigns);
    await seedClicks(impressions);

    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║           Seeding Complete!                   ║');
    console.log('╠═══════════════════════════════════════════════╣');
    console.log(`║  Users:       ${String(NUM_USERS).padEnd(30)}║`);
    console.log(`║  Campaigns:   ${String(NUM_CAMPAIGNS).padEnd(30)}║`);
    console.log(`║  Impressions: ${String(NUM_IMPRESSIONS).padEnd(30)}║`);
    console.log(`║  Clicks:      ${String(Math.floor(NUM_IMPRESSIONS * CLICK_RATE)).padEnd(30)}║`);
    console.log('╚═══════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\nSeeding failed:', error.message);
    process.exit(1);
  }
}

main();
