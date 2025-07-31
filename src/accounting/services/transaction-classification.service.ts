import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { RuleEngineService } from '../../rule/rule-engine.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { ParsedTransaction } from './transaction-parser.service';
import { ClassificationContext } from '../../rule/interfaces/classification.interface';

export interface ClassificationResult {
  totalProcessed: number;
  classifiedCount: number;
  unclassifiedCount: number;
  errors: string[];
}

export interface TransactionClassificationRequest {
  companyId: string;
  transactions: ParsedTransaction[];
  userType: string;
}

@Injectable()
export class TransactionClassificationService {
  private readonly logger = new Logger(TransactionClassificationService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly ruleEngineService: RuleEngineService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * 파싱된 거래 내역을 분류하고 데이터베이스에 저장합니다.
   */
  async classifyAndSaveTransactions(
    request: TransactionClassificationRequest,
  ): Promise<ClassificationResult> {
    this.logger.log(
      `Starting transaction classification for company ${request.companyId}`,
    );

    const result: ClassificationResult = {
      totalProcessed: 0,
      classifiedCount: 0,
      unclassifiedCount: 0,
      errors: [],
    };

    try {
      // 배치 처리를 위한 청크 크기 설정
      const BATCH_SIZE = 100;
      const transactions = request.transactions;

      for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
        const batch = transactions.slice(i, i + BATCH_SIZE);
        const batchResult = await this.processBatch(request, batch);

        result.totalProcessed += batchResult.totalProcessed;
        result.classifiedCount += batchResult.classifiedCount;
        result.unclassifiedCount += batchResult.unclassifiedCount;
        result.errors.push(...batchResult.errors);
      }

      this.logger.log(
        `Classification completed. Total: ${result.totalProcessed}, ` +
          `Classified: ${result.classifiedCount}, ` +
          `Unclassified: ${result.unclassifiedCount}, ` +
          `Errors: ${result.errors.length}`,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Transaction classification failed: ${errorMessage}`);
      throw new Error('거래 분류 및 저장 중 오류가 발생했습니다.');
    }
  }

  /**
   * 거래 배치를 처리합니다.
   */
  private async processBatch(
    request: TransactionClassificationRequest,
    transactions: ParsedTransaction[],
  ): Promise<ClassificationResult> {
    const result: ClassificationResult = {
      totalProcessed: 0,
      classifiedCount: 0,
      unclassifiedCount: 0,
      errors: [],
    };

    const transactionEntities: Transaction[] = [];

    for (const parsedTransaction of transactions) {
      try {
        // 암호화된 적요를 복호화하여 분류에 사용
        const decryptedDescription = parsedTransaction.description_encrypted
          ? this.encryptionService.decrypt(
              parsedTransaction.description_encrypted,
            )
          : '';

        // 거래 분류를 위한 컨텍스트 생성
        const classificationContext: ClassificationContext = {
          companyId: request.companyId,
          userType: request.userType,
          transactionData: {
            description: decryptedDescription,
            depositAmount: parsedTransaction.deposit_amount,
            withdrawalAmount: parsedTransaction.withdrawal_amount,
            transactionDate: parsedTransaction.transaction_date,
            branch: parsedTransaction.branch_encrypted
              ? this.encryptionService.decrypt(
                  parsedTransaction.branch_encrypted,
                )
              : undefined,
          },
        };

        // 거래 분류 수행
        const classificationResult =
          await this.ruleEngineService.classifyTransaction(
            classificationContext,
          );

        // Transaction 엔티티 생성
        const transaction = new Transaction();
        transaction.transaction_date = parsedTransaction.transaction_date;
        transaction.description_encrypted =
          parsedTransaction.description_encrypted;
        transaction.deposit_amount = parsedTransaction.deposit_amount;
        transaction.withdrawal_amount = parsedTransaction.withdrawal_amount;
        transaction.balance_after = parsedTransaction.balance_after;
        transaction.branch_encrypted = parsedTransaction.branch_encrypted;
        transaction.processed_at = new Date();

        // 중요: 분류된 거래만 company_id와 category_id 설정
        if (
          classificationResult.isClassified &&
          classificationResult.categoryId
        ) {
          // 관리자인 경우 실제 매칭된 회사 ID 사용, 일반 사용자는 요청한 회사 ID 사용
          transaction.company_id =
            request.userType === 'ADMIN' && classificationResult.actualCompanyId
              ? classificationResult.actualCompanyId
              : request.companyId;
          transaction.category_id = classificationResult.categoryId;
          result.classifiedCount++;
        } else {
          // 미분류 거래는 company_id와 category_id를 null로 설정
          transaction.company_id = null;
          transaction.category_id = null;
          result.unclassifiedCount++;
        }

        transactionEntities.push(transaction);
        result.totalProcessed++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.errors.push(`거래 분류 오류: ${errorMessage}`);
        this.logger.warn(`Transaction classification error: ${errorMessage}`);
      }
    }

    // 배치로 데이터베이스에 저장
    if (transactionEntities.length > 0) {
      try {
        await this.transactionRepository.save(transactionEntities);
        this.logger.log(
          `Saved ${transactionEntities.length} transactions to database`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Database save error: ${errorMessage}`);
        throw new Error('데이터베이스 저장 중 오류가 발생했습니다.');
      }
    }

    return result;
  }

  /**
   * 특정 회사의 거래 내역을 조회합니다.
   * 분류된 거래만 조회됩니다 (company_id가 설정된 거래만).
   */
  async getTransactionsByCompany(
    companyId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    transactions: Transaction[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    this.logger.log(`Fetching transactions for company ${companyId}`);

    try {
      const [transactions, total] =
        await this.transactionRepository.findAndCount({
          where: {
            company_id: companyId,
          },
          relations: ['category'],
          order: { transaction_date: 'DESC' },
          skip: (page - 1) * limit,
          take: limit,
        });

      const totalPages = Math.ceil(total / limit);

      return {
        transactions,
        total,
        page,
        totalPages,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch transactions: ${errorMessage}`);
      throw new Error('거래 내역 조회 중 오류가 발생했습니다.');
    }
  }

  /**
   * 미분류 거래 내역을 조회합니다.
   * company_id가 null인 모든 미분류 거래를 조회합니다.
   */
  async getUnclassifiedTransactions(
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    transactions: Transaction[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    this.logger.log('Fetching unclassified transactions');

    try {
      const [transactions, total] =
        await this.transactionRepository.findAndCount({
          where: {
            company_id: IsNull(),
          },
          order: { transaction_date: 'DESC' },
          skip: (page - 1) * limit,
          take: limit,
        });

      const totalPages = Math.ceil(total / limit);

      return {
        transactions,
        total,
        page,
        totalPages,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to fetch unclassified transactions: ${errorMessage}`,
      );
      throw new Error('미분류 거래 내역 조회 중 오류가 발생했습니다.');
    }
  }

  /**
   * 거래 분류 통계를 조회합니다.
   */
  async getClassificationStats(companyId?: string): Promise<{
    totalTransactions: number;
    classifiedCount: number;
    unclassifiedCount: number;
    classificationRate: number;
  }> {
    this.logger.log(
      companyId
        ? `Fetching classification stats for company ${companyId}`
        : 'Fetching overall classification stats',
    );

    try {
      let totalTransactions: number;
      let classifiedCount: number;
      let unclassifiedCount: number;

      if (companyId) {
        // 특정 회사의 분류된 거래만 조회
        totalTransactions = await this.transactionRepository.count({
          where: { company_id: companyId },
        });

        classifiedCount = totalTransactions; // company_id가 있으면 모두 분류된 것

        unclassifiedCount = 0; // 특정 회사 조회 시 미분류는 0 (company_id가 null이므로)
      } else {
        // 전체 통계 조회
        totalTransactions = await this.transactionRepository.count();

        classifiedCount = await this.transactionRepository.count({
          where: {
            company_id: IsNull(),
          },
        });

        unclassifiedCount = await this.transactionRepository.count({
          where: {
            company_id: IsNull(),
          },
        });

        // 분류된 거래 수 = 전체 - 미분류
        classifiedCount = totalTransactions - unclassifiedCount;
      }

      const classificationRate =
        totalTransactions > 0 ? (classifiedCount / totalTransactions) * 100 : 0;

      return {
        totalTransactions,
        classifiedCount,
        unclassifiedCount,
        classificationRate: Math.round(classificationRate * 100) / 100, // 소수점 둘째 자리까지
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to fetch classification stats: ${errorMessage}`,
      );
      throw new Error('분류 통계 조회 중 오류가 발생했습니다.');
    }
  }

  /**
   * 미분류 거래를 특정 회사의 규칙으로 재분류를 시도합니다.
   */
  async reclassifyUnclassifiedTransactions(
    companyId: string,
    limit: number = 100,
  ): Promise<ClassificationResult> {
    this.logger.log(
      `Starting reclassification of unclassified transactions for company ${companyId}`,
    );

    const result: ClassificationResult = {
      totalProcessed: 0,
      classifiedCount: 0,
      unclassifiedCount: 0,
      errors: [],
    };

    try {
      // 미분류 거래들을 조회 (company_id가 null인 거래들)
      const unclassifiedTransactions = await this.transactionRepository.find({
        where: {
          company_id: IsNull(),
        },
        take: limit,
        order: { transaction_date: 'DESC' },
      });

      if (unclassifiedTransactions.length === 0) {
        this.logger.log(
          'No unclassified transactions found for reclassification',
        );
        return result;
      }

      this.logger.log(
        `Found ${unclassifiedTransactions.length} unclassified transactions for reclassification`,
      );

      // 각 거래를 재분류 시도
      for (const transaction of unclassifiedTransactions) {
        try {
          // 암호화된 적요를 복호화하여 분류에 사용
          const decryptedDescription = this.encryptionService.decrypt(
            transaction.description_encrypted,
          );

          // 거래 분류를 위한 컨텍스트 생성
          const classificationContext: ClassificationContext = {
            companyId,
            transactionData: {
              description: decryptedDescription,
              depositAmount: transaction.deposit_amount,
              withdrawalAmount: transaction.withdrawal_amount,
              transactionDate: transaction.transaction_date,
              branch: transaction.branch_encrypted
                ? this.encryptionService.decrypt(transaction.branch_encrypted)
                : undefined,
            },
          };

          // 거래 분류 수행
          const classificationResult =
            await this.ruleEngineService.classifyTransaction(
              classificationContext,
            );

          if (
            classificationResult.isClassified &&
            classificationResult.categoryId
          ) {
            // 분류 성공 - company_id와 category_id 설정
            transaction.company_id = companyId;
            transaction.category_id = classificationResult.categoryId;
            transaction.processed_at = new Date();

            await this.transactionRepository.save(transaction);
            result.classifiedCount++;

            this.logger.debug(
              `Transaction ${transaction.transaction_id} reclassified to category ${classificationResult.categoryId}`,
            );
          } else {
            result.unclassifiedCount++;
          }

          result.totalProcessed++;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          result.errors.push(
            `거래 ${transaction.transaction_id} 재분류 오류: ${errorMessage}`,
          );
          this.logger.warn(
            `Transaction ${transaction.transaction_id} reclassification error: ${errorMessage}`,
          );
        }
      }

      this.logger.log(
        `Reclassification completed. Processed: ${result.totalProcessed}, ` +
          `Newly classified: ${result.classifiedCount}, ` +
          `Still unclassified: ${result.unclassifiedCount}, ` +
          `Errors: ${result.errors.length}`,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Reclassification failed: ${errorMessage}`);
      throw new Error('거래 재분류 중 오류가 발생했습니다.');
    }
  }
}
