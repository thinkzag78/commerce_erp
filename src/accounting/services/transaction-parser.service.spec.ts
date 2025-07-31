import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  TransactionParserService,
  TransactionParseResult,
} from './transaction-parser.service';
import { EncryptionService } from '../../encryption/encryption.service';

describe('TransactionParserService', () => {
  let service: TransactionParserService;
  let encryptionService: jest.Mocked<EncryptionService>;

  const mockEncryptionService = {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
    generateKey: jest.fn(),
    rotateKey: jest.fn(),
    isPersonalData: jest.fn(),
    encryptIfPersonal: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionParserService,
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
      ],
    }).compile();

    service = module.get<TransactionParserService>(TransactionParserService);
    encryptionService = module.get(EncryptionService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    encryptionService.encrypt.mockImplementation(
      (text: string) => `encrypted_${text}`,
    );
  });

  describe('parseTransactionFile', () => {
    it('should parse valid transaction file with header', async () => {
      const fileContent = `거래일시,적요,입금액,출금액,거래후잔액,거래점
2025-07-20 13:45:11,스타벅스 강남2호점,0,5500,994500,강남지점
2025-07-21 09:30:00,네이버페이(주),150000,0,1107000,온라인`;

      const result = await service.parseTransactionFile(fileContent);

      expect(result.totalCount).toBe(2);
      expect(result.validCount).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(2);

      const firstTransaction = result.transactions[0];
      expect(firstTransaction.transaction_date).toEqual(
        new Date(2025, 6, 20, 13, 45, 11),
      );
      expect(firstTransaction.description_encrypted).toBe(
        'encrypted_스타벅스 강남2호점',
      );
      expect(firstTransaction.deposit_amount).toBe(0);
      expect(firstTransaction.withdrawal_amount).toBe(5500);
      expect(firstTransaction.balance_after).toBe(994500);
      expect(firstTransaction.branch_encrypted).toBe('encrypted_강남지점');

      expect(encryptionService.encrypt).toHaveBeenCalledTimes(4); // 2 transactions * 2 fields each
    });

    it('should parse valid transaction file without header', async () => {
      const fileContent = `2025-07-20 13:45:11,스타벅스 강남2호점,0,5500,994500,강남지점`;

      const result = await service.parseTransactionFile(fileContent);

      expect(result.totalCount).toBe(1);
      expect(result.validCount).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(1);
    });

    it('should handle deposit transactions correctly', async () => {
      const fileContent = `2025-07-21 09:30:00,네이버페이(주),150000,0,1107000,온라인`;

      const result = await service.parseTransactionFile(fileContent);

      expect(result.validCount).toBe(1);
      const transaction = result.transactions[0];
      expect(transaction.deposit_amount).toBe(150000);
      expect(transaction.withdrawal_amount).toBe(0);
    });

    it('should throw error for empty file', async () => {
      await expect(service.parseTransactionFile('')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.parseTransactionFile('   ')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error when no valid transactions found', async () => {
      const fileContent = `거래일시,적요,입금액,출금액,거래후잔액,거래점
invalid,data,format,here,test,line`;

      await expect(service.parseTransactionFile(fileContent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle invalid header format', async () => {
      const fileContent = `날짜,내용,입금,출금,잔액,지점
2025-07-20 13:45:11,스타벅스 강남2호점,0,5500,994500,강남지점`;

      // csv-parser는 헤더를 무시하고 정의된 헤더를 사용하므로 모든 행이 데이터로 처리됨
      const result = await service.parseTransactionFile(fileContent);

      expect(result.totalCount).toBe(2);
      expect(result.validCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        '입금액 또는 출금액 중 하나는 0보다 커야 합니다',
      );
    });

    it('should collect errors for invalid lines but continue processing valid ones', async () => {
      const fileContent = `거래일시,적요,입금액,출금액,거래후잔액,거래점
2025-07-20 13:45:11,스타벅스 강남2호점,0,5500,994500,강남지점
invalid,line,with,wrong,format
2025-07-21 09:30:00,네이버페이(주),150000,0,1107000,온라인`;

      const result = await service.parseTransactionFile(fileContent);

      expect(result.totalCount).toBe(3);
      expect(result.validCount).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Row 2:'); // csv-parser는 0부터 시작하므로 Row 2
      expect(result.transactions).toHaveLength(2);
    });

    it('should handle amounts with commas', async () => {
      const fileContent = `2025-07-20 13:45:11,스타벅스 강남2호점,0,"5,500","994,500",강남지점`;

      const result = await service.parseTransactionFile(fileContent);

      expect(result.validCount).toBe(1);
      const transaction = result.transactions[0];
      expect(transaction.withdrawal_amount).toBe(5500);
      expect(transaction.balance_after).toBe(994500);
    });

    it('should skip empty lines', async () => {
      const fileContent = `거래일시,적요,입금액,출금액,거래후잔액,거래점

2025-07-20 13:45:11,스타벅스 강남2호점,0,5500,994500,강남지점

2025-07-21 09:30:00,네이버페이(주),150000,0,1107000,온라인

`;

      const result = await service.parseTransactionFile(fileContent);

      expect(result.validCount).toBe(2);
      expect(result.transactions).toHaveLength(2);
    });
  });

  describe('date parsing', () => {
    it('should reject future dates', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateStr = futureDate
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      const fileContent = `${futureDateStr},테스트,0,1000,999000,테스트지점`;

      await expect(service.parseTransactionFile(fileContent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid date formats', async () => {
      const fileContent = `2025-13-45 25:70:80,테스트,0,1000,999000,테스트지점`;

      await expect(service.parseTransactionFile(fileContent)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('amount validation', () => {
    it('should reject negative amounts', async () => {
      const fileContent = `2025-07-20 13:45:11,테스트,-1000,0,999000,테스트지점`;

      await expect(service.parseTransactionFile(fileContent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject transactions with both deposit and withdrawal', async () => {
      const fileContent = `2025-07-20 13:45:11,테스트,1000,2000,999000,테스트지점`;

      await expect(service.parseTransactionFile(fileContent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject transactions with zero amounts', async () => {
      const fileContent = `2025-07-20 13:45:11,테스트,0,0,999000,테스트지점`;

      await expect(service.parseTransactionFile(fileContent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid number formats', async () => {
      const fileContent = `2025-07-20 13:45:11,테스트,abc,0,999000,테스트지점`;

      await expect(service.parseTransactionFile(fileContent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject amounts exceeding maximum limit', async () => {
      const fileContent = `2025-07-20 13:45:11,테스트,0,1000000001,999000,테스트지점`;

      await expect(service.parseTransactionFile(fileContent)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle decimal amounts correctly', async () => {
      const fileContent = `2025-07-20 13:45:11,테스트,0,1234.56,999000,테스트지점`;

      const result = await service.parseTransactionFile(fileContent);

      expect(result.validCount).toBe(1);
      expect(result.transactions[0].withdrawal_amount).toBe(1234.56);
    });

    it('should reject amounts with more than 2 decimal places', async () => {
      const fileContent = `2025-07-20 13:45:11,테스트,0,1234.567,999000,테스트지점`;

      await expect(service.parseTransactionFile(fileContent)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('column validation', () => {
    it('should handle lines with wrong number of columns', async () => {
      const fileContent = `2025-07-20 13:45:11,테스트,0,1000`;

      // csv-parser는 부족한 컬럼을 빈 문자열로 채우므로 validation에서 걸림
      await expect(service.parseTransactionFile(fileContent)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('encryption', () => {
    it('should encrypt description and branch fields', async () => {
      const fileContent = `2025-07-20 13:45:11,스타벅스 강남2호점,0,5500,994500,강남지점`;

      await service.parseTransactionFile(fileContent);

      expect(encryptionService.encrypt).toHaveBeenCalledWith(
        '스타벅스 강남2호점',
      );
      expect(encryptionService.encrypt).toHaveBeenCalledWith('강남지점');
    });

    it('should handle empty description and branch fields', async () => {
      const fileContent = `2025-07-20 13:45:11,,0,5500,994500,`;

      const result = await service.parseTransactionFile(fileContent);

      expect(result.validCount).toBe(1);
      expect(result.transactions[0].description_encrypted).toBe('');
      expect(result.transactions[0].branch_encrypted).toBe('');
    });

    it('should handle encryption errors', async () => {
      const mockEncrypt = jest.fn().mockImplementation(() => {
        throw new Error('Encryption failed');
      });
      encryptionService.encrypt = mockEncrypt;

      const fileContent = `2025-07-20 13:45:11,테스트,0,5500,994500,테스트지점`;

      await expect(service.parseTransactionFile(fileContent)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateParseResult', () => {
    it('should pass validation for good results', () => {
      const result: TransactionParseResult = {
        transactions: [
          {
            transaction_date: new Date(),
            description_encrypted: 'encrypted_test',
            deposit_amount: 1000,
            withdrawal_amount: 0,
            balance_after: 999000,
            branch_encrypted: 'encrypted_branch',
          },
        ],
        totalCount: 1,
        validCount: 1,
        errors: [],
      };

      expect(() => service.validateParseResult(result)).not.toThrow();
    });

    it('should throw error when too many errors', () => {
      const result: TransactionParseResult = {
        transactions: [],
        totalCount: 10,
        validCount: 2,
        errors: ['error1', 'error2', 'error3', 'error4', 'error5'],
      };

      expect(() => service.validateParseResult(result)).toThrow(
        BadRequestException,
      );
    });

    it('should throw error when no valid transactions', () => {
      const result: TransactionParseResult = {
        transactions: [],
        totalCount: 5,
        validCount: 0,
        errors: ['error1', 'error2'],
      };

      expect(() => service.validateParseResult(result)).toThrow(
        BadRequestException,
      );
    });
  });
});
