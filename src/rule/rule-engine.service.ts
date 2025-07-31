import { Injectable, Logger } from '@nestjs/common';
import {
  ClassificationRule,
  TransactionType,
} from './entities/classification-rule.entity';
import { KeywordType } from './entities/rule-keyword.entity';
import {
  ClassificationResult,
  TransactionData,
  ClassificationContext,
} from './interfaces/classification.interface';
import { RuleDataService } from './rule-data.service';

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);
  private readonly rulesCache = new Map<string, ClassificationRule[]>();
  private readonly cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5분

  constructor(private ruleDataService: RuleDataService) {}

  /**
   * 거래 내역을 분류합니다
   */
  async classifyTransaction(
    context: ClassificationContext,
  ): Promise<ClassificationResult> {
    try {
      // 관리자인 경우 모든 회사의 규칙을 사용, 일반 사용자는 해당 회사 규칙만 사용
      const rules =
        context.userType === 'ADMIN'
          ? await this.getAllCompanyRules()
          : await this.getCachedRules(context.companyId);

      if (rules.length === 0) {
        return {
          isClassified: false,
          reason:
            context.userType === 'ADMIN'
              ? 'No active rules found for any company'
              : 'No active rules found for company',
        };
      }

      // 매칭되는 규칙들 찾기
      const matchedRules = this.findMatchingRules(
        context.transactionData,
        rules,
      );

      if (matchedRules.length === 0) {
        return {
          isClassified: false,
          reason: 'No matching rules found',
        };
      }

      // 우선순위 기반으로 최적의 규칙 선택
      const selectedRule = this.selectBestRule(matchedRules);
      const matchedKeywords = this.getMatchedKeywords(
        context.transactionData,
        selectedRule,
      );

      this.logger.debug(
        `Transaction classified: ${selectedRule.category?.category_name} (Rule ID: ${selectedRule.rule_id}, Company: ${selectedRule.company_id})`,
      );

      return {
        isClassified: true,
        categoryId: selectedRule.category_id,
        categoryName: selectedRule.category?.category_name,
        ruleId: selectedRule.rule_id,
        matchedKeywords,
        reason: 'Successfully classified',
        actualCompanyId: selectedRule.company_id, // 실제 매칭된 회사 ID
      };
    } catch (error) {
      this.logger.error('Error during transaction classification', error);
      return {
        isClassified: false,
        reason: 'Classification error occurred',
      };
    }
  }

  /**
   * 매칭되는 규칙들을 찾습니다
   */
  private findMatchingRules(
    transactionData: TransactionData,
    rules: ClassificationRule[],
  ): ClassificationRule[] {
    const matchedRules: ClassificationRule[] = [];

    for (const rule of rules) {
      if (this.evaluateRule(transactionData, rule)) {
        matchedRules.push(rule);
      }
    }

    return matchedRules;
  }

  /**
   * 개별 규칙을 평가합니다
   */
  private evaluateRule(
    transactionData: TransactionData,
    rule: ClassificationRule,
  ): boolean {
    // 1. 거래 유형 검증
    if (!this.checkTransactionType(transactionData, rule.transaction_type)) {
      return false;
    }

    // 2. 금액 구간 검증
    if (!this.checkAmountRange(transactionData, rule)) {
      return false;
    }

    // 3. 키워드 매칭 검증
    if (!this.checkKeywordMatching(transactionData, rule)) {
      return false;
    }

    return true;
  }

  /**
   * 거래 유형을 검증합니다
   */
  private checkTransactionType(
    transactionData: TransactionData,
    ruleTransactionType: TransactionType,
  ): boolean {
    if (ruleTransactionType === TransactionType.ALL) {
      return true;
    }

    const isDeposit = transactionData.depositAmount > 0;
    const isWithdrawal = transactionData.withdrawalAmount > 0;

    switch (ruleTransactionType) {
      case TransactionType.DEPOSIT:
        return isDeposit && !isWithdrawal;
      case TransactionType.WITHDRAWAL:
        return isWithdrawal && !isDeposit;
      default:
        return true;
    }
  }

  /**
   * 금액 구간을 검증합니다
   */
  private checkAmountRange(
    transactionData: TransactionData,
    rule: ClassificationRule,
  ): boolean {
    const transactionAmount = Math.max(
      transactionData.depositAmount,
      transactionData.withdrawalAmount,
    );

    // 최소 금액 검증
    if (rule.min_amount !== null && rule.min_amount !== undefined) {
      if (transactionAmount < rule.min_amount) {
        return false;
      }
    }

    // 최대 금액 검증
    if (rule.max_amount !== null && rule.max_amount !== undefined) {
      if (transactionAmount > rule.max_amount) {
        return false;
      }
    }

    return true;
  }

  /**
   * 키워드 매칭을 검증합니다
   */
  private checkKeywordMatching(
    transactionData: TransactionData,
    rule: ClassificationRule,
  ): boolean {
    if (!rule.keywords || rule.keywords.length === 0) {
      return true; // 키워드가 없으면 통과
    }

    const description = transactionData.description.toLowerCase().trim();
    const includeKeywords = rule.keywords.filter(
      (k) => k.keyword_type === KeywordType.INCLUDE,
    );
    const excludeKeywords = rule.keywords.filter(
      (k) => k.keyword_type === KeywordType.EXCLUDE,
    );

    // 제외 키워드 검사 (하나라도 매칭되면 제외)
    for (const excludeKeyword of excludeKeywords) {
      const keyword = excludeKeyword.keyword.toLowerCase().trim();
      if (this.isKeywordMatch(description, keyword)) {
        this.logger.debug(`Transaction excluded by keyword: ${keyword}`);
        return false;
      }
    }

    // 포함 키워드 검사 (하나라도 매칭되어야 함)
    if (includeKeywords.length === 0) {
      return true; // 포함 키워드가 없으면 통과
    }

    for (const includeKeyword of includeKeywords) {
      const keyword = includeKeyword.keyword.toLowerCase().trim();
      if (this.isKeywordMatch(description, keyword)) {
        this.logger.debug(`Transaction matched by keyword: ${keyword}`);
        return true;
      }
    }

    return false; // 포함 키워드가 있지만 매칭되지 않음
  }

  /**
   * 키워드 매칭 로직 (정확한 매칭과 부분 매칭 지원)
   */
  private isKeywordMatch(description: string, keyword: string): boolean {
    // 정확한 단어 매칭 (공백으로 구분된 단어)
    const words = description.split(/\s+/);
    if (words.some((word) => word === keyword)) {
      return true;
    }

    // 부분 문자열 매칭
    return description.includes(keyword);
  }

  /**
   * 우선순위 기반으로 최적의 규칙을 선택합니다
   */
  private selectBestRule(
    matchedRules: ClassificationRule[],
  ): ClassificationRule {
    // 우선순위 오름차순 정렬 (낮은 숫자가 높은 우선순위)
    const sortedRules = matchedRules.toSorted(
      (a, b) => a.priority - b.priority,
    );
    return sortedRules[0];
  }

  /**
   * 매칭된 키워드들을 반환합니다
   */
  private getMatchedKeywords(
    transactionData: TransactionData,
    rule: ClassificationRule,
  ): string[] {
    if (!rule.keywords || rule.keywords.length === 0) {
      return [];
    }

    const description = transactionData.description.toLowerCase();
    const matchedKeywords: string[] = [];

    const includeKeywords = rule.keywords.filter(
      (k) => k.keyword_type === KeywordType.INCLUDE,
    );

    for (const keyword of includeKeywords) {
      if (description.includes(keyword.keyword.toLowerCase())) {
        matchedKeywords.push(keyword.keyword);
      }
    }

    return matchedKeywords;
  }

  /**
   * 여러 거래를 일괄 분류합니다 (성능 최적화된 버전)
   */
  async classifyTransactionsBatch(
    companyId: string,
    transactions: TransactionData[],
  ): Promise<ClassificationResult[]> {
    if (transactions.length === 0) {
      return [];
    }

    const startTime = Date.now();
    this.logger.log(
      `Starting batch classification for ${transactions.length} transactions`,
    );

    // 규칙을 한 번만 조회하여 모든 거래에 재사용
    const rules = await this.getCachedRules(companyId);

    if (rules.length === 0) {
      this.logger.warn(`No active rules found for company: ${companyId}`);
      return transactions.map(() => ({
        isClassified: false,
        reason: 'No active rules found for company',
      }));
    }

    const results: ClassificationResult[] = [];
    let classifiedCount = 0;

    // 각 거래를 순차적으로 처리 (메모리 효율성을 위해)
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];

      try {
        // 매칭되는 규칙들 찾기
        const matchedRules = this.findMatchingRules(transaction, rules);

        if (matchedRules.length === 0) {
          results.push({
            isClassified: false,
            reason: 'No matching rules found',
          });
        } else {
          // 우선순위 기반으로 최적의 규칙 선택
          const selectedRule = this.selectBestRule(matchedRules);
          const matchedKeywords = this.getMatchedKeywords(
            transaction,
            selectedRule,
          );

          results.push({
            isClassified: true,
            categoryId: selectedRule.category_id,
            categoryName: selectedRule.category?.category_name,
            ruleId: selectedRule.rule_id,
            matchedKeywords,
            reason: 'Successfully classified',
          });

          classifiedCount++;
        }

        // 진행 상황 로깅 (1000건마다)
        if ((i + 1) % 1000 === 0) {
          this.logger.log(
            `Processed ${i + 1}/${transactions.length} transactions`,
          );
        }
      } catch (error) {
        this.logger.error(`Error classifying transaction ${i + 1}:`, error);
        results.push({
          isClassified: false,
          reason: 'Classification error occurred',
        });
      }
    }

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    this.logger.log(
      `Batch classification completed: ${results.length} transactions processed, ` +
        `${classifiedCount} classified, ${results.length - classifiedCount} unclassified ` +
        `in ${processingTime}ms (${(processingTime / results.length).toFixed(2)}ms per transaction)`,
    );

    return results;
  }

  /**
   * 분류 통계를 생성합니다
   */
  generateClassificationStats(results: ClassificationResult[]): {
    totalCount: number;
    classifiedCount: number;
    unclassifiedCount: number;
    categoryStats: Record<string, number>;
  } {
    const totalCount = results.length;
    const classifiedResults = results.filter((r) => r.isClassified);
    const classifiedCount = classifiedResults.length;
    const unclassifiedCount = totalCount - classifiedCount;

    const categoryStats: Record<string, number> = {};

    for (const result of classifiedResults) {
      if (result.categoryId) {
        categoryStats[result.categoryId] =
          (categoryStats[result.categoryId] || 0) + 1;
      }
    }

    return {
      totalCount,
      classifiedCount,
      unclassifiedCount,
      categoryStats,
    };
  }

  /**
   * 관리자용: 모든 회사의 규칙을 조회합니다
   */
  private async getAllCompanyRules(): Promise<ClassificationRule[]> {
    const now = Date.now();
    const cacheKey = 'rules_all_companies';

    // 캐시 확인
    if (this.rulesCache.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(cacheKey);
      if (expiry && expiry > now) {
        this.logger.debug('Using cached rules for all companies');
        return this.rulesCache.get(cacheKey)!;
      }
    }

    // 캐시 만료 또는 없음 - 데이터베이스에서 조회
    this.logger.debug('Loading rules from database for all companies');
    const rules = await this.ruleDataService.getAllActiveRules();

    this.logger.log(`Found ${rules.length} rules for all companies`);
    if (rules.length > 0) {
      const companyCounts = new Map<string, number>();
      rules.forEach((rule) => {
        const count = companyCounts.get(rule.company_id) || 0;
        companyCounts.set(rule.company_id, count + 1);
      });

      companyCounts.forEach((count, companyId) => {
        this.logger.debug(`Company ${companyId}: ${count} rules`);
      });
    }

    // 캐시 업데이트
    this.rulesCache.set(cacheKey, rules);
    this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL);

    return rules;
  }

  /**
   * 캐시된 규칙을 조회하거나 데이터베이스에서 새로 가져옵니다
   */
  private async getCachedRules(
    companyId: string,
  ): Promise<ClassificationRule[]> {
    const now = Date.now();
    const cacheKey = `rules_${companyId}`;

    // 캐시 확인
    if (this.rulesCache.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(cacheKey);
      if (expiry && expiry > now) {
        this.logger.debug(`Using cached rules for company: ${companyId}`);
        return this.rulesCache.get(cacheKey)!;
      }
    }

    // 캐시 만료 또는 없음 - 데이터베이스에서 조회
    this.logger.debug(`Loading rules from database for company: ${companyId}`);
    const rules = await this.ruleDataService.getRulesByCompany(companyId);

    this.logger.log(`Found ${rules.length} rules for company ${companyId}`);
    if (rules.length > 0) {
      rules.forEach((rule) => {
        this.logger.debug(
          `Rule: ${rule.rule_id}, Category: ${rule.category_id}, Keywords: ${rule.keywords?.length || 0}`,
        );
      });
    }

    // 캐시 업데이트
    this.rulesCache.set(cacheKey, rules);
    this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL);

    return rules;
  }

  /**
   * 특정 회사의 규칙 캐시를 무효화합니다
   */
  invalidateRulesCache(companyId: string): void {
    const cacheKey = `rules_${companyId}`;
    this.rulesCache.delete(cacheKey);
    this.cacheExpiry.delete(cacheKey);
    this.logger.debug(`Rules cache invalidated for company: ${companyId}`);
  }

  /**
   * 모든 규칙 캐시를 무효화합니다
   */
  clearAllCache(): void {
    this.rulesCache.clear();
    this.cacheExpiry.clear();
    this.logger.debug('All rules cache cleared');
  }
}
