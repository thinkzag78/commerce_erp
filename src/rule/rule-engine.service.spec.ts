import { Test, TestingModule } from '@nestjs/testing';
import { RuleEngineService } from './rule-engine.service';
import { RuleDataService } from './rule-data.service';
import {
  ClassificationRule,
  TransactionType,
} from './entities/classification-rule.entity';
import { KeywordType } from './entities/rule-keyword.entity';
import { Category } from './entities/category.entity';
import {
  TransactionData,
  ClassificationContext,
} from './interfaces/classification.interface';

describe('RuleEngineService', () => {
  let service: RuleEngineService;
  let ruleDataService: jest.Mocked<RuleDataService>;

  const mockCategory: Partial<Category> = {
    category_id: 'cat_1',
    company_id: 'com_1',
    category_name: '식비',
    classification_rules: [],
    transactions: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockRule: Partial<ClassificationRule> = {
    rule_id: 1,
    company_id: 'com_1',
    category_id: 'cat_1',
    min_amount: 1000,
    max_amount: 50000,
    transaction_type: TransactionType.WITHDRAWAL,
    priority: 1,
    is_active: true,
    category: mockCategory as Category,
    keywords: [
      {
        keyword_id: 1,
        rule_id: 1,
        keyword: '스타벅스',
        keyword_type: KeywordType.INCLUDE,
        created_at: new Date(),
      } as any,
      {
        keyword_id: 2,
        rule_id: 1,
        keyword: '환불',
        keyword_type: KeywordType.EXCLUDE,
        created_at: new Date(),
      } as any,
    ],
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockTransactionData: TransactionData = {
    description: '스타벅스 강남2호점',
    depositAmount: 0,
    withdrawalAmount: 5500,
    transactionDate: new Date('2025-07-20'),
    branch: '강남지점',
  };

  beforeEach(async () => {
    const mockRuleDataService = {
      getRulesByCompany: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuleEngineService,
        {
          provide: RuleDataService,
          useValue: mockRuleDataService,
        },
      ],
    }).compile();

    service = module.get<RuleEngineService>(RuleEngineService);
    ruleDataService = module.get(RuleDataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('classifyTransaction', () => {
    const context: ClassificationContext = {
      companyId: 'com_1',
      transactionData: mockTransactionData,
    };

    it('should classify transaction successfully', async () => {
      ruleDataService.getRulesByCompany.mockResolvedValue([
        mockRule as ClassificationRule,
      ]);

      const result = await service.classifyTransaction(context);

      expect(result.isClassified).toBe(true);
      expect(result.categoryId).toBe('cat_1');
      expect(result.categoryName).toBe('식비');
      expect(result.ruleId).toBe(1);
      expect(result.matchedKeywords).toContain('스타벅스');
    });

    it('should return unclassified when no rules found', async () => {
      ruleDataService.getRulesByCompany.mockResolvedValue([]);

      const result = await service.classifyTransaction(context);

      expect(result.isClassified).toBe(false);
      expect(result.reason).toBe('No active rules found for company');
    });

    it('should return unclassified when no matching rules', async () => {
      const nonMatchingTransaction: TransactionData = {
        description: '다른 상점',
        depositAmount: 0,
        withdrawalAmount: 5500,
        transactionDate: new Date('2025-07-20'),
      };

      const nonMatchingContext: ClassificationContext = {
        companyId: 'com_1',
        transactionData: nonMatchingTransaction,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        mockRule as ClassificationRule,
      ]);

      const result = await service.classifyTransaction(nonMatchingContext);

      expect(result.isClassified).toBe(false);
      expect(result.reason).toBe('No matching rules found');
    });

    it('should exclude transaction with exclude keywords', async () => {
      const excludeTransaction: TransactionData = {
        description: '스타벅스 환불',
        depositAmount: 5500,
        withdrawalAmount: 0,
        transactionDate: new Date('2025-07-20'),
      };

      const excludeContext: ClassificationContext = {
        companyId: 'com_1',
        transactionData: excludeTransaction,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        mockRule as ClassificationRule,
      ]);

      const result = await service.classifyTransaction(excludeContext);

      expect(result.isClassified).toBe(false);
      expect(result.reason).toBe('No matching rules found');
    });

    it('should not match when amount is out of range', async () => {
      const outOfRangeTransaction: TransactionData = {
        description: '스타벅스 강남2호점',
        depositAmount: 0,
        withdrawalAmount: 100000, // 최대 금액 초과
        transactionDate: new Date('2025-07-20'),
      };

      const outOfRangeContext: ClassificationContext = {
        companyId: 'com_1',
        transactionData: outOfRangeTransaction,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        mockRule as ClassificationRule,
      ]);

      const result = await service.classifyTransaction(outOfRangeContext);

      expect(result.isClassified).toBe(false);
      expect(result.reason).toBe('No matching rules found');
    });

    it('should not match when transaction type does not match', async () => {
      const depositTransaction: TransactionData = {
        description: '스타벅스 강남2호점',
        depositAmount: 5500,
        withdrawalAmount: 0, // 입금 거래
        transactionDate: new Date('2025-07-20'),
      };

      const depositContext: ClassificationContext = {
        companyId: 'com_1',
        transactionData: depositTransaction,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        mockRule as ClassificationRule,
      ]);

      const result = await service.classifyTransaction(depositContext);

      expect(result.isClassified).toBe(false);
      expect(result.reason).toBe('No matching rules found');
    });

    it('should select rule with highest priority when multiple rules match', async () => {
      const lowPriorityRule: Partial<ClassificationRule> = {
        ...mockRule,
        rule_id: 2,
        category_id: 'cat_2',
        priority: 2,
        category: {
          ...mockCategory,
          category_id: 'cat_2',
          category_name: '기타',
        } as Category,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        lowPriorityRule as ClassificationRule,
        mockRule as ClassificationRule,
      ]);

      const result = await service.classifyTransaction(context);

      expect(result.isClassified).toBe(true);
      expect(result.ruleId).toBe(1); // 우선순위가 높은 규칙 선택
      expect(result.categoryId).toBe('cat_1');
    });
  });

  describe('classifyTransactionsBatch', () => {
    it('should classify multiple transactions', async () => {
      const transactions: TransactionData[] = [
        mockTransactionData,
        {
          description: '다른 거래',
          depositAmount: 0,
          withdrawalAmount: 3000,
          transactionDate: new Date('2025-07-20'),
        },
      ];

      ruleDataService.getRulesByCompany.mockResolvedValue([
        mockRule as ClassificationRule,
      ]);

      const results = await service.classifyTransactionsBatch(
        'com_1',
        transactions,
      );

      expect(results).toHaveLength(2);
      expect(results[0].isClassified).toBe(true);
      expect(results[1].isClassified).toBe(false);
    });
  });

  describe('generateClassificationStats', () => {
    it('should generate correct statistics', () => {
      const results = [
        {
          isClassified: true,
          categoryId: 'cat_1',
          categoryName: '식비',
          ruleId: 1,
          matchedKeywords: ['스타벅스'],
          reason: 'Successfully classified',
        },
        {
          isClassified: true,
          categoryId: 'cat_1',
          categoryName: '식비',
          ruleId: 1,
          matchedKeywords: ['카페'],
          reason: 'Successfully classified',
        },
        {
          isClassified: false,
          reason: 'No matching rules found',
        },
      ];

      const stats = service.generateClassificationStats(results);

      expect(stats.totalCount).toBe(3);
      expect(stats.classifiedCount).toBe(2);
      expect(stats.unclassifiedCount).toBe(1);
      expect(stats.categoryStats['cat_1']).toBe(2);
    });
  });

  describe('transaction type validation', () => {
    it('should match ALL transaction type for any transaction', async () => {
      const allTypeRule: Partial<ClassificationRule> = {
        ...mockRule,
        transaction_type: TransactionType.ALL,
      };

      const depositTransaction: TransactionData = {
        description: '스타벅스 강남2호점',
        depositAmount: 5500,
        withdrawalAmount: 0,
        transactionDate: new Date('2025-07-20'),
      };

      const context: ClassificationContext = {
        companyId: 'com_1',
        transactionData: depositTransaction,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        allTypeRule as ClassificationRule,
      ]);

      const result = await service.classifyTransaction(context);

      expect(result.isClassified).toBe(true);
    });

    it('should match DEPOSIT transaction type only for deposit transactions', async () => {
      const depositRule: Partial<ClassificationRule> = {
        ...mockRule,
        transaction_type: TransactionType.DEPOSIT,
      };

      const depositTransaction: TransactionData = {
        description: '스타벅스 강남2호점',
        depositAmount: 5500,
        withdrawalAmount: 0,
        transactionDate: new Date('2025-07-20'),
      };

      const context: ClassificationContext = {
        companyId: 'com_1',
        transactionData: depositTransaction,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        depositRule as ClassificationRule,
      ]);

      const result = await service.classifyTransaction(context);

      expect(result.isClassified).toBe(true);
    });
  });

  describe('amount range validation', () => {
    it('should match when amount is within range', async () => {
      const transaction: TransactionData = {
        description: '스타벅스 강남2호점',
        depositAmount: 0,
        withdrawalAmount: 25000, // 범위 내
        transactionDate: new Date('2025-07-20'),
      };

      const context: ClassificationContext = {
        companyId: 'com_1',
        transactionData: transaction,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        mockRule as ClassificationRule,
      ]);

      const result = await service.classifyTransaction(context);

      expect(result.isClassified).toBe(true);
    });

    it('should not match when amount is below minimum', async () => {
      const transaction: TransactionData = {
        description: '스타벅스 강남2호점',
        depositAmount: 0,
        withdrawalAmount: 500, // 최소값 미만
        transactionDate: new Date('2025-07-20'),
      };

      const context: ClassificationContext = {
        companyId: 'com_1',
        transactionData: transaction,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        mockRule as ClassificationRule,
      ]);

      const result = await service.classifyTransaction(context);

      expect(result.isClassified).toBe(false);
    });
  });

  describe('caching functionality', () => {
    it('should cache rules for performance', async () => {
      const context: ClassificationContext = {
        companyId: 'com_1',
        transactionData: mockTransactionData,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        mockRule as ClassificationRule,
      ]);

      // 첫 번째 호출
      await service.classifyTransaction(context);
      expect(ruleDataService.getRulesByCompany).toHaveBeenCalledTimes(1);

      // 두 번째 호출 (캐시 사용)
      await service.classifyTransaction(context);
      expect(ruleDataService.getRulesByCompany).toHaveBeenCalledTimes(1); // 여전히 1번만 호출
    });

    it('should invalidate cache when requested', async () => {
      const context: ClassificationContext = {
        companyId: 'com_1',
        transactionData: mockTransactionData,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        mockRule as ClassificationRule,
      ]);

      // 첫 번째 호출
      await service.classifyTransaction(context);
      expect(ruleDataService.getRulesByCompany).toHaveBeenCalledTimes(1);

      // 캐시 무효화
      service.invalidateRulesCache('com_1');

      // 두 번째 호출 (캐시 무효화 후)
      await service.classifyTransaction(context);
      expect(ruleDataService.getRulesByCompany).toHaveBeenCalledTimes(2); // 2번 호출됨
    });

    it('should clear all cache', async () => {
      service.clearAllCache();
      // 캐시가 비워졌는지 확인하기 위해 다음 호출에서 데이터베이스 조회가 발생해야 함
      const context: ClassificationContext = {
        companyId: 'com_1',
        transactionData: mockTransactionData,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        mockRule as ClassificationRule,
      ]);
      await service.classifyTransaction(context);
      expect(ruleDataService.getRulesByCompany).toHaveBeenCalled();
    });
  });

  describe('enhanced keyword matching', () => {
    it('should match exact words correctly', async () => {
      const exactWordRule: Partial<ClassificationRule> = {
        ...mockRule,
        keywords: [
          {
            keyword_id: 1,
            rule_id: 1,
            keyword: '스타벅스',
            keyword_type: KeywordType.INCLUDE,
            created_at: new Date(),
          } as any,
        ],
      };

      const transaction: TransactionData = {
        description: '스타벅스 강남점에서 결제',
        depositAmount: 0,
        withdrawalAmount: 5500,
        transactionDate: new Date('2025-07-20'),
      };

      const context: ClassificationContext = {
        companyId: 'com_1',
        transactionData: transaction,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        exactWordRule as ClassificationRule,
      ]);

      const result = await service.classifyTransaction(context);

      expect(result.isClassified).toBe(true);
      expect(result.matchedKeywords).toContain('스타벅스');
    });

    it('should handle partial keyword matching', async () => {
      const partialMatchRule: Partial<ClassificationRule> = {
        ...mockRule,
        keywords: [
          {
            keyword_id: 1,
            rule_id: 1,
            keyword: '카페',
            keyword_type: KeywordType.INCLUDE,
            created_at: new Date(),
          } as any,
        ],
      };

      const transaction: TransactionData = {
        description: '투썸플레이스카페 결제',
        depositAmount: 0,
        withdrawalAmount: 5500,
        transactionDate: new Date('2025-07-20'),
      };

      const context: ClassificationContext = {
        companyId: 'com_1',
        transactionData: transaction,
      };

      ruleDataService.getRulesByCompany.mockResolvedValue([
        partialMatchRule as ClassificationRule,
      ]);

      const result = await service.classifyTransaction(context);

      expect(result.isClassified).toBe(true);
      expect(result.matchedKeywords).toContain('카페');
    });
  });
});
