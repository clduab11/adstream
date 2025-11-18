/**
 * ADSTREAM Constants and Configuration
 */

// User Segment Definitions
const SEGMENTS = {
  FREQUENT_BUYERS: 'frequent_buyers',
  HIGH_LTV: 'high_ltv',
  CART_ABANDONERS: 'cart_abandoners',
  NEW_CUSTOMERS: 'new_customers',
  SEASONAL_SHOPPERS: 'seasonal_shoppers',
  ACTIVE_USERS: 'active_users',
  AT_RISK_USERS: 'at_risk_users',
  CHURNED_USERS: 'churned_users'
};

// Segmentation Thresholds
const SEGMENTATION_RULES = {
  FREQUENT_BUYERS_MIN_PURCHASES: 10,
  FREQUENT_BUYERS_DAYS: 90,
  HIGH_LTV_MIN_AOV: 150,
  NEW_CUSTOMER_DAYS: 30,
  NEW_CUSTOMER_MAX_PURCHASES: 3,
  ACTIVE_USER_DAYS: 7,
  AT_RISK_MIN_DAYS: 30,
  AT_RISK_MAX_DAYS: 60,
  CHURNED_MIN_DAYS: 90
};

// Campaign Status
const CAMPAIGN_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed'
};

// Ad Placements
const PLACEMENTS = {
  HOMEPAGE_BANNER: 'homepage_banner',
  SEARCH_RESULTS: 'search_results',
  PRODUCT_PAGE: 'product_page',
  CART_PAGE: 'cart_page',
  CHECKOUT: 'checkout'
};

// Device Types
const DEVICE_TYPES = {
  DESKTOP: 'desktop',
  MOBILE: 'mobile',
  TABLET: 'tablet'
};

// Performance Targets
const PERFORMANCE = {
  AD_REQUEST_TIMEOUT_MS: parseInt(process.env.AD_REQUEST_TIMEOUT_MS) || 100,
  IMPRESSION_BATCH_INTERVAL_MS: parseInt(process.env.IMPRESSION_BATCH_INTERVAL_MS) || 5000,
  MAX_FREQUENCY_CAP_HOURS: 24,
  DEFAULT_FREQUENCY_CAP: 3
};

// API Response Codes
const API_ERRORS = {
  INVALID_REQUEST: {
    code: 'INVALID_REQUEST',
    status: 400,
    message: 'Invalid request parameters'
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    status: 401,
    message: 'Invalid or missing API key'
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    status: 404,
    message: 'Resource not found'
  },
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    status: 429,
    message: 'Too many requests'
  },
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    status: 500,
    message: 'Internal server error'
  },
  SERVICE_UNAVAILABLE: {
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
    message: 'Service temporarily unavailable'
  }
};

// Default House Ad (fallback when no campaigns match)
const DEFAULT_HOUSE_AD = {
  campaign_id: 'house_ad_default',
  creative_url: 'https://cdn.adstream.example/house/default_banner.jpg',
  redirect_url: 'https://adstream.example/advertise',
  advertiser_name: 'ADSTREAM'
};

// Age Range Definitions
const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55+'];

// Geographic Regions
const REGIONS = ['northeast', 'southeast', 'midwest', 'southwest', 'west'];

module.exports = {
  SEGMENTS,
  SEGMENTATION_RULES,
  CAMPAIGN_STATUS,
  PLACEMENTS,
  DEVICE_TYPES,
  PERFORMANCE,
  API_ERRORS,
  DEFAULT_HOUSE_AD,
  AGE_RANGES,
  REGIONS
};
