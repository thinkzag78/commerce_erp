import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { validate, ValidationError } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { Category } from './entities/category.entity';
import {
  ClassificationRule,
  TransactionType,
} from './entities/classification-rule.entity';
import { RuleKeyword, KeywordType } from './entities/rule-keyword.entity';
import { Company } from '../auth/entities/company.entity';
import {
  RulesFileDto,
  CompanyRuleDto,
  CategoryRuleDto,
} from './dto/rules-file.dto';

@Injectable()
export class RuleDataService {
  private readonly logger = new Logger(RuleDataService.name);

  constructor(
    @InjectRepository(ClassificationRule)
    private ruleRepository: Repository<ClassificationRule>,
    private dataSource: DataSource,
  ) {}

  /**
   * rules.json 파일 내용을 파싱하고 검증합니다
   */
  async parseAndValidateRulesFile(fileContent: string): Promise<RulesFileDto> {
    try {
      const rulesData = plainToClass(RulesFileDto, JSON.parse(fileContent));

      await this.validateRulesStructure(rulesData);
      return rulesData;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new BadRequestException('Invalid JSON format in rules file');
      }
      throw error;
    }
  }

  /**
   * 규칙 데이터 구조를 검증합니다
   */
  private async validateRulesStructure(rulesData: RulesFileDto): Promise<void> {
    const errors = await validate(rulesData);

    if (errors.length > 0) {
      const errorMessages = this.formatValidationErrors(errors);
      throw new BadRequestException(
        `Validation failed: ${errorMessages.join(', ')}`,
      );
    }

    // 추가 비즈니스 로직 검증
    this.validateBusinessRules(rulesData);
  }

  /**
   * 검증 에러를 포맷팅합니다
   */
  private formatValidationErrors(errors: ValidationError[]): string[] {
    const messages: string[] = [];

    for (const error of errors) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints).map(String));
      }

      if (error.children && error.children.length > 0) {
        messages.push(...this.formatValidationErrors(error.children));
      }
    }

    return messages;
  }

  /**
   * 비즈니스 규칙을 검증합니다
   */
  private validateBusinessRules(rulesData: RulesFileDto): void {
    for (const company of rulesData.companies) {
      for (const category of company.categories) {
        // 금액 범위 검증
        if (category.amount_range) {
          this.validateAmountRange(category.amount_range);
        }
      }
    }
  }

  /**
   * 금액 범위 데이터를 검증합니다
   */
  private validateAmountRange(amountRange: {
    min?: number;
    max?: number;
  }): void {
    if (
      amountRange.min !== undefined &&
      amountRange.max !== undefined &&
      amountRange.min > amountRange.max
    ) {
      throw new BadRequestException(
        'amount_range.min cannot be greater than amount_range.max',
      );
    }
  }

  /**
   * 규칙 데이터를 데이터베이스에 저장합니다
   */
  async saveRulesToDatabase(rulesData: RulesFileDto): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const companyData of rulesData.companies) {
        await this.saveCompanyRules(companyData, queryRunner);
      }

      await queryRunner.commitTransaction();
      this.logger.log(
        `Successfully saved rules for ${rulesData.companies.length} companies`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to save rules to database', error);
      throw new BadRequestException('Failed to save rules to database');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 회사별 규칙 데이터를 저장합니다
   */
  private async saveCompanyRules(
    companyData: CompanyRuleDto,
    queryRunner: QueryRunner,
  ): Promise<void> {
    // 회사 존재 확인 및 생성
    let company = await queryRunner.manager.findOne(Company, {
      where: { company_id: companyData.company_id },
    });

    if (!company) {
      company = new Company();
      company.company_id = companyData.company_id;
      company.company_name = companyData.company_name;
      await queryRunner.manager.save(company);
    }

    // 기존 규칙 삭제 (업데이트를 위해) - 간단한 방식으로 변경
    await this.deleteExistingRulesSimple(companyData.company_id, queryRunner);

    // 새 규칙 저장
    for (const categoryData of companyData.categories) {
      await this.saveCategoryRules(
        companyData.company_id,
        categoryData,
        queryRunner,
      );
    }
  }

  /**
   * 기존 규칙들을 삭제합니다 (간단한 방식)
   */
  private async deleteExistingRulesSimple(
    companyId: string,
    queryRunner: QueryRunner,
  ): Promise<void> {
    try {
      // 1. 해당 회사의 모든 규칙 조회
      const existingRules = await this.ruleRepository.find({
        where: { company_id: companyId },
        select: ['rule_id'],
      });

      // 2. 각 규칙의 키워드 삭제
      if (existingRules && Array.isArray(existingRules)) {
        for (const rule of existingRules) {
          await queryRunner.manager.delete(RuleKeyword, {
            rule_id: rule.rule_id,
          });
        }
      }

      // 3. 분류 규칙 삭제
      await queryRunner.manager.delete(ClassificationRule, {
        company_id: companyId,
      });

      // 4. 카테고리 삭제
      await queryRunner.manager.delete(Category, {
        company_id: companyId,
      });

      this.logger.debug(`Deleted existing rules for company: ${companyId}`);
    } catch (error) {
      this.logger.error(`Failed to delete existing rules for company ${companyId}:`, error);
      // 삭제 실패는 무시하고 계속 진행 (새로운 데이터 삽입 시 덮어쓰기)
      this.logger.warn(`Continuing with rule insertion despite deletion failure for company: ${companyId}`);
    }
  }

  /**
   * 카테고리별 규칙을 저장합니다
   */
  private async saveCategoryRules(
    companyId: string,
    categoryData: CategoryRuleDto,
    queryRunner: QueryRunner,
  ): Promise<void> {
    // 카테고리 저장
    const category = new Category();
    category.category_id = categoryData.category_id;
    category.company_id = companyId;
    category.category_name = categoryData.category_name;
    await queryRunner.manager.save(category);

    // 분류 규칙 저장
    const rule = new ClassificationRule();
    rule.company_id = companyId;
    rule.category_id = categoryData.category_id;
    rule.min_amount = categoryData.amount_range?.min || null;
    rule.max_amount = categoryData.amount_range?.max || null;
    rule.transaction_type = this.mapTransactionType(
      categoryData.transaction_type,
    );
    rule.priority = categoryData.priority || 1;
    rule.is_active = true;
    const savedRule = await queryRunner.manager.save(rule);

    // 포함 키워드 저장
    for (const keyword of categoryData.keywords) {
      const ruleKeyword = new RuleKeyword();
      ruleKeyword.rule_id = savedRule.rule_id;
      ruleKeyword.keyword = keyword.trim();
      ruleKeyword.keyword_type = KeywordType.INCLUDE;
      await queryRunner.manager.save(ruleKeyword);
    }

    // 제외 키워드 저장
    if (categoryData.exclude_keywords) {
      for (const keyword of categoryData.exclude_keywords) {
        const ruleKeyword = new RuleKeyword();
        ruleKeyword.rule_id = savedRule.rule_id;
        ruleKeyword.keyword = keyword.trim();
        ruleKeyword.keyword_type = KeywordType.EXCLUDE;
        await queryRunner.manager.save(ruleKeyword);
      }
    }
  }

  /**
   * 거래 유형을 매핑합니다
   */
  private mapTransactionType(type?: string): TransactionType {
    switch (type) {
      case 'DEPOSIT':
        return TransactionType.DEPOSIT;
      case 'WITHDRAWAL':
        return TransactionType.WITHDRAWAL;
      default:
        return TransactionType.ALL;
    }
  }

  /**
   * 회사별 규칙을 조회합니다
   */
  async getRulesByCompany(companyId: string): Promise<ClassificationRule[]> {
    return this.ruleRepository.find({
      where: { company_id: companyId, is_active: true },
      relations: ['keywords', 'category'],
      order: { priority: 'ASC' },
    });
  }

  /**
   * 모든 활성 규칙을 조회합니다
   */
  async getAllActiveRules(): Promise<ClassificationRule[]> {
    return this.ruleRepository.find({
      where: { is_active: true },
      relations: ['keywords', 'category'],
      order: { priority: 'ASC' },
    });
  }

  /**
   * 규칙 파일을 처리하여 데이터베이스에 저장합니다
   */
  async processRulesFile(fileContent: string): Promise<void> {
    this.logger.log('Processing rules file');

    try {
      // 파일 파싱 및 검증
      const rulesData = await this.parseAndValidateRulesFile(fileContent);

      // 데이터베이스에 저장
      await this.saveRulesToDatabase(rulesData);

      this.logger.log('Rules file processed successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process rules file: ${errorMessage}`);
      throw error;
    }
  }
}
