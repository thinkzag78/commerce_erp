import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test_encryption_key_32_chars_long'),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const plaintext = '스타벅스 강남2호점';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toBeTruthy();
      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      expect(service.encrypt('')).toBe('');
      expect(service.decrypt('')).toBe('');
    });

    it('should handle Korean text', () => {
      const koreanText = '김밥천국 역삼점';
      const encrypted = service.encrypt(koreanText);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(koreanText);
    });

    it('should throw error for invalid ciphertext', () => {
      expect(() => service.decrypt('invalid_ciphertext')).toThrow(
        'Decryption failed',
      );
    });
  });

  describe('generateKey', () => {
    it('should generate a key', () => {
      const key = service.generateKey();
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
    });
  });

  describe('isPersonalData', () => {
    it('should detect phone numbers', () => {
      expect(service.isPersonalData('010-1234-5678')).toBe(true);
      expect(service.isPersonalData('02-123-4567')).toBe(true);
    });

    it('should detect email addresses', () => {
      expect(service.isPersonalData('test@example.com')).toBe(true);
      expect(service.isPersonalData('user.name+tag@domain.co.kr')).toBe(true);
    });

    it('should not detect normal business names', () => {
      expect(service.isPersonalData('스타벅스 강남2호점')).toBe(false);
      expect(service.isPersonalData('김밥천국 역삼점')).toBe(false);
    });

    it('should handle empty input', () => {
      expect(service.isPersonalData('')).toBe(false);
    });
  });

  describe('encryptIfPersonal', () => {
    it('should encrypt personal data', () => {
      const phoneNumber = '010-1234-5678';
      const result = service.encryptIfPersonal(phoneNumber);

      expect(result).not.toBe(phoneNumber);
      expect(service.decrypt(result)).toBe(phoneNumber);
    });

    it('should not encrypt non-personal data', () => {
      const businessName = '스타벅스 강남2호점';
      const result = service.encryptIfPersonal(businessName);

      expect(result).toBe(businessName);
    });
  });

  describe('constructor validation', () => {
    it('should throw error for short encryption key', () => {
      const mockConfigService = {
        get: jest.fn().mockReturnValue('short_key'),
      } as unknown as ConfigService;

      expect(() => {
        new EncryptionService(mockConfigService);
      }).toThrow('ENCRYPTION_KEY must be at least 32 characters long');
    });

    it('should throw error for missing encryption key', () => {
      const mockConfigService = {
        get: jest.fn().mockReturnValue(null),
      } as unknown as ConfigService;

      expect(() => {
        new EncryptionService(mockConfigService);
      }).toThrow('ENCRYPTION_KEY must be at least 32 characters long');
    });
  });
});
