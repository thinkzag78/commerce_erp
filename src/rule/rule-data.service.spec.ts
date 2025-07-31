import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { RuleDataService } from './rule-data.service';
import { Category } from './entities/category.entity';
import {
  ClassificationRule,
  TransactionType,
} from './entities/classification-rule.entity';
import { RuleKeyword, KeywordType } from './entities/rule-keyword.entity';
import { Company } from '../auth/entities/company.entity';

describe('RuleDataService', () => {
  let service: RuleDataService;
  let ruleRepository: jest.Mocked<Repository<ClassificationRule>>;
  let queryRunner: any;

  beforeEach(async () => {
    const mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
      },
    };

    const mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuleDataService,
        {
          provide: getRepositoryToken(ClassificationRule),
          useValue: mockRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<RuleDataService>(RuleDataService);
    ruleRepository = module.get(getRepositoryToken(ClassificationRule));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parseAndValidateRulesFile', () => {
    it('should parse valid JSON rules file', async () => {
      const validRulesJson = JSON.stringify({
        companies: [
          {
            company_id: 'com_1',
            company_name: 'Test Company',
            categories: [
              {
                category_id: 'cat_1',
                category_name: 'Test Category',
                keywords: ['test'],
              },
            ],
          },
        ],
      });

      const result = await service.parseAndValidateRulesFile(validRulesJson);

      expect(result.companies).toHaveLength(1);
      expect(result.companies[0].company_id).toBe('com_1');
      expect(result.companies[0].company_name).toBe('Test Company');
      expect(result.companies[0].categories).toHaveLength(1);
      expect(result.companies[0].categories[0].category_id).toBe('cat_1');
      expect(result.companies[0].categories[0].keywords).toEqual(['test']);
    });

    it('should throw BadRequestException for invalid JSON', async () => {
      const invalidJson = '{ invalid json }';

      await expect(
        service.parseAndValidateRulesFile(invalidJson),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for missing companies array', async () => {
      const invalidRulesJson = JSON.stringify({
        invalid: 'structure',
      });

      await expect(
        service.parseAndValidateRulesFile(invalidRulesJson),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid company structure', async () => {
      const invalidRulesJson = JSON.stringify({
        companies: [
          {
            // missing company_id
            company_name: 'Test Company',
            categories: [
              {
                category_id: 'cat_1',
                category_name: 'Test Category',
                keywords: ['test'],
              },
            ],
          },
        ],
      });

      await expect(
        service.parseAndValidateRulesFile(invalidRulesJson),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid category structure', async () => {
      const invalidRulesJson = JSON.stringify({
        companies: [
          {
            company_id: 'com_1',
            company_name: 'Test Company',
            categories: [
              {
                category_id: 'cat_1',
                category_name: 'Test Category',
                keywords: [], // empty keywords array
              },
            ],
          },
        ],
      });

      await expect(
        service.parseAndValidateRulesFile(invalidRulesJson),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate amount_range correctly', async () => {
      const validRulesJson = JSON.stringify({
        companies: [
          {
            company_id: 'com_1',
            company_name: 'Test Company',
            categories: [
              {
                category_id: 'cat_1',
                category_name: 'Test Category',
                keywords: ['test'],
                amount_range: { min: 1000, max: 5000 },
              },
            ],
          },
        ],
      });

      await expect(
        service.parseAndValidateRulesFile(validRulesJson),
      ).resolves.not.toThrow();
    });

    it('should throw BadRequestException for invalid amount_range', async () => {
      const invalidRulesJson = JSON.stringify({
        companies: [
          {
            company_id: 'com_1',
            company_name: 'Test Company',
            categories: [
              {
                category_id: 'cat_1',
                category_name: 'Test Category',
                keywords: ['test'],
                amount_range: { min: 5000, max: 1000 }, // min > max
              },
            ],
          },
        ],
      });

      await expect(
        service.parseAndValidateRulesFile(invalidRulesJson),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('saveRulesToDatabase', () => {
    const mockRulesData = {
      companies: [
        {
          company_id: 'com_1',
          company_name: 'Test Company',
          categories: [
            {
              category_id: 'cat_1',
              category_name: 'Test Category',
              keywords: ['test', 'keyword'],
              exclude_keywords: ['exclude'],
              amount_range: { min: 1000, max: 5000 },
              transaction_type: 'WITHDRAWAL' as const,
              priority: 1,
            },
          ],
        },
      ],
    };

    beforeEach(() => {
      queryRunner.manager.findOne.mockResolvedValue(null);
      queryRunner.manager.create.mockImplementation(
        (_entity: any, data: any) => data,
      );
      queryRunner.manager.save.mockImplementation(
        (_entity: any, data?: any) => ({
          ...data,
          rule_id: 1,
        }),
      );
    });

    it('should save rules to database successfully', async () => {
      await service.saveRulesToDatabase(mockRulesData);

      expect(queryRunner.connect).toHaveBeenCalled();
      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      queryRunner.manager.save.mockRejectedValue(new Error('Database error'));

      await expect(service.saveRulesToDatabase(mockRulesData)).rejects.toThrow(
        BadRequestException,
      );

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should create company if not exists', async () => {
      queryRunner.manager.findOne.mockResolvedValue(null);

      await service.saveRulesToDatabase(mockRulesData);

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 'com_1',
          company_name: 'Test Company',
        }),
      );
    });

    it('should save category and rules correctly', async () => {
      await service.saveRulesToDatabase(mockRulesData);

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          category_id: 'cat_1',
          company_id: 'com_1',
          category_name: 'Test Category',
        }),
      );

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 'com_1',
          category_id: 'cat_1',
          min_amount: 1000,
          max_amount: 5000,
          transaction_type: TransactionType.WITHDRAWAL,
          priority: 1,
          is_active: true,
        }),
      );
    });

    it('should save include and exclude keywords', async () => {
      await service.saveRulesToDatabase(mockRulesData);

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          rule_id: 1,
          keyword: 'test',
          keyword_type: KeywordType.INCLUDE,
        }),
      );

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          rule_id: 1,
          keyword: 'keyword',
          keyword_type: KeywordType.INCLUDE,
        }),
      );

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          rule_id: 1,
          keyword: 'exclude',
          keyword_type: KeywordType.EXCLUDE,
        }),
      );
    });
  });

  describe('getRulesByCompany', () => {
    it('should return rules for specific company', async () => {
      const mockRules = [
        {
          rule_id: 1,
          company_id: 'com_1',
          category_id: 'cat_1',
          is_active: true,
          priority: 1,
        },
      ];

      ruleRepository.find.mockResolvedValue(mockRules as any);

      const result = await service.getRulesByCompany('com_1');

      expect(ruleRepository.find).toHaveBeenCalledWith({
        where: { company_id: 'com_1', is_active: true },
        relations: ['keywords', 'category'],
        order: { priority: 'ASC' },
      });
      expect(result).toEqual(mockRules);
    });
  });

  describe('getAllActiveRules', () => {
    it('should return all active rules', async () => {
      const mockRules = [
        {
          rule_id: 1,
          company_id: 'com_1',
          is_active: true,
          priority: 1,
        },
        {
          rule_id: 2,
          company_id: 'com_2',
          is_active: true,
          priority: 2,
        },
      ];

      ruleRepository.find.mockResolvedValue(mockRules as any);

      const result = await service.getAllActiveRules();

      expect(ruleRepository.find).toHaveBeenCalledWith({
        where: { is_active: true },
        relations: ['keywords', 'category'],
        order: { priority: 'ASC' },
      });
      expect(result).toEqual(mockRules);
    });
  });
});
