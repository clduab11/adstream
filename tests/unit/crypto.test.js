const {
  generateImpressionId,
  verifyImpressionId,
  generateCampaignId,
  generateClickId,
  generateUserId,
  generateApiKey,
  hashApiKey
} = require('../../src/utils/crypto');

describe('Crypto Utils', () => {
  describe('generateImpressionId', () => {
    it('should generate a valid impression ID', () => {
      const id = generateImpressionId();
      expect(id).toMatch(/^imp_[0-9a-f-]+_[0-9a-f]{8}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = generateImpressionId();
      const id2 = generateImpressionId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('verifyImpressionId', () => {
    it('should return true for valid impression IDs', () => {
      const id = generateImpressionId();
      expect(verifyImpressionId(id)).toBe(true);
    });

    it('should return false for invalid format', () => {
      expect(verifyImpressionId('invalid')).toBe(false);
      expect(verifyImpressionId(null)).toBe(false);
      expect(verifyImpressionId('')).toBe(false);
    });

    it('should return false for wrong prefix', () => {
      expect(verifyImpressionId('click_123_abc')).toBe(false);
    });

    it('should return false for invalid UUID', () => {
      expect(verifyImpressionId('imp_notauuid_12345678')).toBe(false);
    });

    it('should return false for wrong signature length', () => {
      expect(verifyImpressionId('imp_12345678-1234-1234-1234-123456789012_short')).toBe(false);
    });
  });

  describe('generateCampaignId', () => {
    it('should generate a valid campaign ID', () => {
      const id = generateCampaignId();
      expect(id).toMatch(/^camp_[0-9a-f]{8}$/);
    });
  });

  describe('generateClickId', () => {
    it('should generate a valid click ID', () => {
      const id = generateClickId();
      expect(id).toMatch(/^click_[0-9a-f-]+$/);
    });
  });

  describe('generateUserId', () => {
    it('should generate a valid user ID', () => {
      const id = generateUserId();
      expect(id).toMatch(/^user_[0-9a-f-]+$/);
    });
  });

  describe('generateApiKey', () => {
    it('should generate a valid API key', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^ak_[0-9a-f]{64}$/);
    });
  });

  describe('hashApiKey', () => {
    it('should hash an API key', () => {
      const key = 'ak_test_key';
      const hash = hashApiKey(key);
      expect(hash).toHaveLength(64);
    });

    it('should produce consistent hashes', () => {
      const key = 'ak_test_key';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });
  });
});
