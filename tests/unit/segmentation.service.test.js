const SegmentationService = require('../../src/services/segmentation.service');
const { SEGMENTS } = require('../../src/config/constants');

describe('SegmentationService', () => {
  describe('calculateSegment', () => {
    it('should identify frequent buyers', () => {
      const user = {
        user_id: 'user_1',
        total_purchases: 15,
        average_order_value: 50,
        last_purchase_date: new Date().toISOString(),
        created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
      };

      const segment = SegmentationService.calculateSegment(user);
      expect(segment).toBe(SEGMENTS.FREQUENT_BUYERS);
    });

    it('should identify high LTV users', () => {
      const user = {
        user_id: 'user_2',
        total_purchases: 5,
        average_order_value: 200,
        last_purchase_date: new Date().toISOString(),
        created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
      };

      const segment = SegmentationService.calculateSegment(user);
      expect(segment).toBe(SEGMENTS.HIGH_LTV);
    });

    it('should identify new customers', () => {
      const user = {
        user_id: 'user_3',
        total_purchases: 1,
        average_order_value: 50,
        last_purchase_date: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      const segment = SegmentationService.calculateSegment(user);
      expect(segment).toBe(SEGMENTS.NEW_CUSTOMERS);
    });

    it('should identify churned users', () => {
      const user = {
        user_id: 'user_4',
        total_purchases: 5,
        average_order_value: 50,
        last_purchase_date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
      };

      const segment = SegmentationService.calculateSegment(user);
      expect(segment).toBe(SEGMENTS.CHURNED_USERS);
    });

    it('should identify at-risk users', () => {
      const user = {
        user_id: 'user_5',
        total_purchases: 5,
        average_order_value: 50,
        last_purchase_date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
      };

      const segment = SegmentationService.calculateSegment(user);
      expect(segment).toBe(SEGMENTS.AT_RISK_USERS);
    });
  });

  describe('userMatchesSegments', () => {
    it('should return true when user segment matches target', () => {
      const user = { segment: SEGMENTS.FREQUENT_BUYERS };
      const targetSegments = [SEGMENTS.FREQUENT_BUYERS, SEGMENTS.HIGH_LTV];

      const result = SegmentationService.userMatchesSegments(user, targetSegments);
      expect(result).toBe(true);
    });

    it('should return false when user segment does not match', () => {
      const user = { segment: SEGMENTS.NEW_CUSTOMERS };
      const targetSegments = [SEGMENTS.FREQUENT_BUYERS, SEGMENTS.HIGH_LTV];

      const result = SegmentationService.userMatchesSegments(user, targetSegments);
      expect(result).toBe(false);
    });

    it('should return true when no target segments specified', () => {
      const user = { segment: SEGMENTS.NEW_CUSTOMERS };

      const result = SegmentationService.userMatchesSegments(user, []);
      expect(result).toBe(true);
    });
  });

  describe('getSegmentDescription', () => {
    it('should return description for known segments', () => {
      const description = SegmentationService.getSegmentDescription(SEGMENTS.FREQUENT_BUYERS);
      expect(description).toContain('10+ purchases');
    });

    it('should return unknown for invalid segments', () => {
      const description = SegmentationService.getSegmentDescription('invalid_segment');
      expect(description).toBe('Unknown segment');
    });
  });
});
