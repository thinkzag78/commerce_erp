import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TransactionClassificationService,
  ClassificationResult,
  TransactionClassificationRequest,
} from './transaction-classification.service';
import { Transaction } from '../entities/transaction.entity';
import { RuleEngineService } from '../../rule/rule-engine.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { ParsedTransaction } from './transaction-parser.service';

describe('TransactionClassificationService', () => {
  let service: TransactionClassificationService;
  let transactionRepository: jest.Mocked<Repository<Transaction>>;
  let ruleEngineService: jest.Mocked<RuleEngineService>;
  let encryptionService: jest.Mocked<EncryptionService>;

  const mockTransactionRepository = {
    save: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn(),
  };

  const mockRuleEngineService = {
    classifyTransaction: jest.fn(),
    classifyTransactionsBatch: jest.fn(),
    generateClassificationStats: jest.fn(),
    invalidateRulesCache: jest.fn(),
    clearAllCache: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
    generateKey: jest.fn(),
    rotateKey: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionClassificationService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: RuleEngineService,
          useValue: mockRuleEngineService,
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
      ],
    }).compile();

    service = module.get<TransactionClassificationService>(
      TransactionClassificationService,
    );
    transactionRepository = module.get(getRepositoryToken(Transaction));
    ruleEngineService = module.get(RuleEngineService);
    encryptionService = module.get(EncryptionService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // 기본 mock 설정
    encryptionService.decrypt.mockImplementation((text: string) => 
      text.replace('encrypted_', '')
    );
  });

  describe('classifyAndSaveTransactions', () => {
    const mockParsedTransactions: ParsedTransaction[] = [
      {
        transaction_date: new Date('2025-07-20T13:45:11'),
        description_encrypted: 'encrypted_스타벅스 강남2호점',
        deposit_amount: 0,
        withdrawal_amount: 5500,
        balance_after: 994500,
        branch_encrypted: 'encrypted_강남지점',
      },
      {
        transaction_date: new Date('2025-07-21T09:30:00'),
        description_encrypted: 'encrypted_네이버페이(주)',
        deposit_amount: 150000,
        withdrawal_amount: 0,
        balance_after: 1107000,
        branch_encrypted: 'encrypted_온라인',
      },
    ];

    const mockRequest: TransactionClassificationRequest = {
      companyId: 'com_1',
      transactions: mockParsedTransactions,
    };

    it('should classify and save transactions successfully', async () => {
      // Mock rule engine responses
      ruleEngineService.classifyTransaction
        .mockResolvedValueOnce({ 
          isClassified: true, 
          categoryId: 'cat_101',
          categoryName: '식비',
          ruleId: 1,
          matchedKeywords: ['스타벅스'],
          reason: 'Successfully classified'
        })
        .mockResolvedValueOnce({ 
          isClassified: false,
          reason: 'No matching rules found'
        });

      // Mock repository save
      transactionRepository.save.mockResolvedValue([] as any);

      const result = await service.classifyAndSaveTransactions(mockRequest);

      expect(result.totalProcessed).toBe(2);
      expect(result.classifiedCount).toBe(1);
      expect(result.unclassifiedCount).toBe(1);
      expect(result.errors).toHaveLength(0);

      expect(ruleEngineService.classifyTransaction).toHaveBeenCalledTimes(2);
      expect(transactionRepository.save).toHaveBeenCalledTimes(1);

      // Verify the saved transactions
      const savedTransactions = transactionRepository.save.mock.calls[0][0] as Transaction[];
      expect(savedTransactions).toHaveLength(2);
      
      // First transaction should be classified
      expect(savedTransactions[0].company_id).toBe('com_1');
      expect(savedTransactions[0].category_id).toBe('cat_101');
      
      // Second transaction should be unclassified
      expect(savedTransactions[1].company_id).toBeNull();
      expect(savedTransactions[1].category_id).toBeNull();
    });

    it('should handle classification errors gracefully', async () => {
      // Mock rule engine to throw error for first transaction
      ruleEngineService.classifyTransaction
        .mockRejectedValueOnce(new Error('Classification failed'))
        .mockResolvedValueOnce({ 
          isClassified: true, 
          categoryId: 'cat_101',
          reason: 'Successfully classified'
        });

      transactionRepository.save.mockResolvedValue([] as any);

      const result = await service.classifyAndSaveTransactions(mockRequest);

      expect(result.totalProcessed).toBe(1); // Only one successful
      expect(result.classifiedCount).toBe(1);
      expect(result.unclassifiedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('거래 분류 오류');
    });

    it('should handle database save errors', async () => {
      ruleEngineService.classifyTransaction.mockResolvedValue({ 
        isClassified: true,
        categoryId: 'cat_101',
        reason: 'Successfully classified'
      });

      transactionRepository.save.mockRejectedValue(new Error('Database error'));

      await expect(service.classifyAndSaveTransactions(mockRequest)).rejects.toThrow(
        '거래 분류 및 저장 중 오류가 발생했습니다.',
      );
    });

    it('should process large batches correctly', async () => {
      // Create a large number of transactions
      const largeTransactionList: ParsedTransaction[] = Array(250).fill(null).map((_, index) => ({
        transaction_date: new Date('2025-07-20T13:45:11'),
        description_encrypted: `encrypted_transaction_${index}`,
        deposit_amount: 0,
        withdrawal_amount: 1000 + index,
        balance_after: 1000000 - (1000 + index),
        branch_encrypted: 'encrypted_branch',
      }));

      const largeRequest: TransactionClassificationRequest = {
        companyId: 'com_1',
        transactions: largeTransactionList,
      };

      ruleEngineService.classifyTransaction.mockResolvedValue({ 
        isClassified: true,
        categoryId: 'cat_101',
        reason: 'Successfully classified'
      });
      transactionRepository.save.mockResolvedValue([] as any);

      const result = await service.classifyAndSaveTransactions(largeRequest);

      expect(result.totalProcessed).toBe(250);
      expect(result.classifiedCount).toBe(250);
      expect(result.unclassifiedCount).toBe(0);

      // Should be called 3 times (250 / 100 = 2.5, rounded up to 3 batches)
      expect(transactionRepository.save).toHaveBeenCalledTimes(3);
    });
  });

  describe('getTransactionsByCompany', () => {
    it('should return paginated transactions', async () => {
      const mockTransactions = [
        {
          transaction_id: 1,
          company_id: 'com_1',
          category_id: 'cat_101',
          transaction_date: new Date('2025-07-20T13:45:11'),
          description_encrypted: 'encrypted_test',
          deposit_amount: 0,
          withdrawal_amount: 5500,
          balance_after: 994500,
          branch_encrypted: 'encrypted_branch',
          processed_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as Partial<Transaction>[] as Transaction[];

      transactionRepository.findAndCount.mockResolvedValue([mockTransactions, 1]);

      const result = await service.getTransactionsByCompany('com_1', 1, 50);

      expect(result.transactions).toEqual(mockTransactions);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);

      expect(transactionRepository.findAndCount).toHaveBeenCalledWith({
        where: { company_id: 'com_1' },
        relations: ['category'],
        order: { transaction_date: 'DESC' },
        skip: 0,
        take: 50,
      });
    });

    it('should handle database errors', async () => {
      transactionRepository.findAndCount.mockRejectedValue(new Error('Database error'));

      await expect(service.getTransactionsByCompany('com_1')).rejects.toThrow(
        '거래 내역 조회 중 오류가 발생했습니다.',
      );
    });
  });

  describe('getUnclassifiedTransactions', () => {
    it('should return unclassified transactions', async () => {
      const mockTransactions = [
        {
          transaction_id: 1,
          company_id: null,
          category_id: null,
          transaction_date: new Date('2025-07-20T13:45:11'),
          description_encrypted: 'encrypted_test',
          deposit_amount: 0,
          withdrawal_amount: 5500,
          balance_after: 994500,
          branch_encrypted: 'encrypted_branch',
          processed_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as Partial<Transaction>[] as Transaction[];

      transactionRepository.findAndCount.mockResolvedValue([mockTransactions, 1]);

      const result = await service.getUnclassifiedTransactions(1, 50);

      expect(result.transactions).toEqual(mockTransactions);
      expect(result.total).toBe(1);

      expect(transactionRepository.findAndCount).toHaveBeenCalledWith({
        where: { 
          company_id: expect.anything(), // IsNull() matcher
        },
        order: { transaction_date: 'DESC' },
        skip: 0,
        take: 50,
      });
    });
  });

  describe('getClassificationStats', () => {
    it('should return classification statistics for specific company', async () => {
      transactionRepository.count
        .mockResolvedValueOnce(80); // company transactions (all classified)

      const result = await service.getClassificationStats('com_1');

      expect(result.totalTransactions).toBe(80);
      expect(result.classifiedCount).toBe(80);
      expect(result.unclassifiedCount).toBe(0);
      expect(result.classificationRate).toBe(100);
    });

    it('should return overall classification statistics', async () => {
      transactionRepository.count
        .mockResolvedValueOnce(100) // total transactions
        .mockResolvedValueOnce(20) // unclassified transactions
        .mockResolvedValueOnce(20); // unclassified transactions (duplicate call)

      const result = await service.getClassificationStats();

      expect(result.totalTransactions).toBe(100);
      expect(result.classifiedCount).toBe(80); // 100 - 20
      expect(result.unclassifiedCount).toBe(20);
      expect(result.classificationRate).toBe(80);
    });

    it('should handle zero transactions', async () => {
      transactionRepository.count
        .mockResolvedValueOnce(0); // company transactions

      const result = await service.getClassificationStats('com_1');

      expect(result.totalTransactions).toBe(0);
      expect(result.classifiedCount).toBe(0);
      expect(result.unclassifiedCount).toBe(0);
      expect(result.classificationRate).toBe(0);
    });

    it('should handle database errors', async () => {
      transactionRepository.count.mockRejectedValue(new Error('Database error'));

      await expect(service.getClassificationStats('com_1')).rejects.toThrow(
        '분류 통계 조회 중 오류가 발생했습니다.',
      );
    });
  });
});