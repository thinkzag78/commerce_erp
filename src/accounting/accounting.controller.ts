import { FilesInterceptor } from '@nestjs/platform-express';
import { TransactionClassificationService } from './services/transaction-classification.service';
import { TransactionParserService } from './services/transaction-parser.service';
import {
  BadRequestException,
  Controller,
  Post,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Logger,
  Get,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { multerConfig } from '../file/multer.config';
import { AuthGuard } from '@nestjs/passport';
import { FileUploadService } from '../file/file-upload.service';
import { RuleDataService } from '../rule/rule-data.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AppLoggerService } from '../common/logger/app-logger.service';

interface AuthenticatedRequest extends Request {
  user: {
    userId: number;
    username: string;
    userType: string;
    companyId?: string;
  };
}

export interface ProcessTransactionResponse {
  processed_count: number;
  classified_count: number;
  unclassified_count: number;
  success: boolean;
  message: string;
  errors?: string[];
}

export interface TransactionRecord {
  transaction_id: number;
  company_id: string;
  category_id: string | null;
  category_name: string | null;
  transaction_date: Date;
  description: string;
  deposit_amount: number;
  withdrawal_amount: number;
  balance_after: number;
  branch: string;
  processed_at: Date;
  created_at: Date;
  updated_at: Date;
}

@ApiTags('accounting')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/accounting')
@UseGuards(AuthGuard('jwt'))
export class AccountingController {
  private readonly logger = new Logger(AccountingController.name);

  constructor(
    private readonly transactionClassificationService: TransactionClassificationService,
    private readonly transactionParserService: TransactionParserService,
    private readonly fileUploadService: FileUploadService,
    private readonly ruleDataService: RuleDataService,
    private readonly encryptionService: EncryptionService,
    private readonly appLoggerService: AppLoggerService,
  ) {}

  @ApiOperation({
    summary: '거래 내역 자동 분류 처리',
    description:
      '은행 거래 내역 파일(.csv)과 분류 규칙 파일(.json)을 업로드하여 자동으로 거래를 분류합니다.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: '거래 내역 파일(.csv)과 규칙 파일(.json)',
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: '업로드할 파일들 (bank_transactions.csv, rules.json)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '거래 내역 처리 성공',
    schema: {
      type: 'object',
      properties: {
        processed_count: { type: 'number', description: '처리된 거래 건수' },
        classified_count: { type: 'number', description: '분류된 거래 건수' },
        unclassified_count: { type: 'number', description: '미분류 거래 건수' },
        success: { type: 'boolean', description: '처리 성공 여부' },
        message: { type: 'string', description: '처리 결과 메시지' },
        errors: {
          type: 'array',
          items: { type: 'string' },
          description: '오류 목록 (선택사항)',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: '잘못된 요청 - 파일 누락, 형식 오류 등',
  })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  @ApiForbiddenResponse({ description: '권한 없음' })
  @Post('process')
  @UseInterceptors(FilesInterceptor('files', 2, multerConfig))
  async processTransactions(
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: AuthenticatedRequest,
  ): Promise<ProcessTransactionResponse> {
    this.logger.log(`Processing transactions for user ${req.user.userId}`);

    if (!files || files.length === 0) {
      throw new BadRequestException('업로드된 파일이 없습니다.');
    }

    // 필수 파일 확인
    const transactionFile = files.find((file) =>
      file.originalname.toLowerCase().endsWith('.csv'),
    );
    const rulesFile = files.find((file) =>
      file.originalname.toLowerCase().endsWith('.json'),
    );

    if (!transactionFile) {
      throw new BadRequestException('거래 내역 파일(.csv)이 필요합니다.');
    }

    if (!rulesFile) {
      throw new BadRequestException('규칙 파일(.json)이 필요합니다.');
    }

    try {
      // 1. 파일 업로드 및 검증
      const [transactionUploadResult, rulesUploadResult] = await Promise.all([
        this.fileUploadService.uploadTransactionFile(
          transactionFile,
          req.user.userId,
        ),
        this.fileUploadService.uploadRulesFile(rulesFile, req.user.userId),
      ]);

      if (!transactionUploadResult.success || !rulesUploadResult.success) {
        throw new BadRequestException('파일 검증에 실패했습니다.');
      }

      // 2. 규칙 파일 처리 및 데이터베이스 저장
      const rulesContent = this.fileUploadService.readUploadedFile(
        rulesUploadResult.filePath!,
      );
      await this.ruleDataService.processRulesFile(rulesContent);

      // 3. 거래 내역 파일 파싱
      const transactionContent = this.fileUploadService.readUploadedFile(
        transactionUploadResult.filePath!,
      );
      const parseResult =
        await this.transactionParserService.parseTransactionFile(
          transactionContent,
        );

      // 파싱 결과 검증
      this.transactionParserService.validateParseResult(parseResult);

      // 4. 회사 ID 결정 (관리자는 모든 회사 규칙 사용, 사업자는 본인 회사만)
      let companyId: string;
      if (req.user.userType === 'ADMIN') {
        // 관리자의 경우 특별한 식별자 사용 (모든 회사 규칙 적용을 위해)
        companyId = 'ADMIN_ALL_COMPANIES';
      } else {
        if (!req.user.companyId) {
          throw new BadRequestException('사용자의 회사 정보가 없습니다.');
        }
        companyId = req.user.companyId;
      }

      // 5. 거래 분류 및 저장
      const startTime = Date.now();
      const classificationResult =
        await this.transactionClassificationService.classifyAndSaveTransactions(
          {
            companyId,
            transactions: parseResult.transactions,
            userType: req.user.userType,
          },
        );
      const processingTime = Date.now() - startTime;

      // AppLoggerService를 사용한 구조화된 로깅
      this.appLoggerService.logClassificationResult({
        userId: req.user.userId,
        companyId,
        totalTransactions: classificationResult.totalProcessed,
        classifiedCount: classificationResult.classifiedCount,
        unclassifiedCount: classificationResult.unclassifiedCount,
        processingTimeMs: processingTime,
      });

      this.logger.log(
        `Transaction processing completed for company ${companyId}. ` +
          `Processed: ${classificationResult.totalProcessed}, ` +
          `Classified: ${classificationResult.classifiedCount}, ` +
          `Unclassified: ${classificationResult.unclassifiedCount}`,
      );

      return {
        processed_count: classificationResult.totalProcessed,
        classified_count: classificationResult.classifiedCount,
        unclassified_count: classificationResult.unclassifiedCount,
        success: true,
        message: '거래 내역 처리가 성공적으로 완료되었습니다.',
        errors:
          classificationResult.errors.length > 0
            ? classificationResult.errors
            : undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Transaction processing failed: ${errorMessage}`);

      // HTTP 예외는 그대로 전파
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `거래 내역 처리 중 오류가 발생했습니다: ${errorMessage}`,
      );
    }
  }

  @ApiOperation({
    summary: '거래 내역 조회',
    description:
      '사업체별 거래 내역을 페이징하여 조회합니다. 권한에 따라 접근 가능한 데이터가 제한됩니다.',
  })
  @ApiQuery({
    name: 'companyId',
    description: '조회할 사업체 ID',
    required: true,
  })
  @ApiQuery({
    name: 'page',
    description: '페이지 번호 (기본값: 1)',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    description: '페이지당 항목 수 (기본값: 50, 최대: 100)',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'status',
    description: '분류 상태 필터',
    required: false,
    enum: ['classified', 'unclassified'],
  })
  @ApiResponse({
    status: 200,
    description: '거래 내역 조회 성공',
    schema: {
      type: 'object',
      properties: {
        transactions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              transaction_id: { type: 'number' },
              company_id: { type: 'string' },
              category_id: { type: 'string', nullable: true },
              category_name: { type: 'string', nullable: true },
              transaction_date: { type: 'string', format: 'date-time' },
              description: { type: 'string' },
              deposit_amount: { type: 'number' },
              withdrawal_amount: { type: 'number' },
              balance_after: { type: 'number' },
              branch: { type: 'string' },
              processed_at: { type: 'string', format: 'date-time' },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
            totalPages: { type: 'number' },
          },
        },
        stats: {
          type: 'object',
          properties: {
            totalTransactions: { type: 'number' },
            classifiedCount: { type: 'number' },
            unclassifiedCount: { type: 'number' },
            classificationRate: { type: 'number' },
          },
          nullable: true,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: '잘못된 요청 - companyId 누락, 잘못된 페이징 파라미터 등',
  })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  @ApiForbiddenResponse({
    description: '권한 없음 - 다른 사업체 데이터 접근 시도',
  })
  @Get('records')
  async getTransactionRecords(
    @Request() req: AuthenticatedRequest,
    @Query('companyId') companyId?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 50,
    @Query('status') status?: 'classified' | 'unclassified',
  ): Promise<{
    transactions: TransactionRecord[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
    stats?: {
      totalTransactions: number;
      classifiedCount: number;
      unclassifiedCount: number;
      classificationRate: number;
    };
  }> {
    this.logger.log(`Fetching transaction records for user ${req.user.userId}`);

    // companyId 파라미터 검증
    if (!companyId) {
      throw new BadRequestException('companyId 파라미터가 필요합니다.');
    }

    // 권한 검증: 사업자는 본인 회사만, 관리자는 모든 회사 접근 가능
    if (req.user.userType !== 'ADMIN') {
      if (!req.user.companyId) {
        throw new BadRequestException('사용자의 회사 정보가 없습니다.');
      }
      if (companyId !== req.user.companyId) {
        throw new BadRequestException(
          '다른 회사의 데이터에 접근할 수 없습니다.',
        );
      }
    }

    // 페이징 파라미터 검증
    if (page < 1) {
      throw new BadRequestException('페이지 번호는 1 이상이어야 합니다.');
    }
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('limit은 1-100 사이의 값이어야 합니다.');
    }

    try {
      let result;

      // 상태별 조회
      if (status === 'unclassified') {
        result =
          await this.transactionClassificationService.getUnclassifiedTransactions(
            page,
            limit,
          );
      } else {
        result =
          await this.transactionClassificationService.getTransactionsByCompany(
            companyId,
            page,
            limit,
          );
      }

      // 암호화된 데이터 복호화
      const decryptedTransactions = this.decryptTransactionData(
        result.transactions,
      );

      // 분류 통계 조회 (첫 페이지일 때만)
      let stats;
      if (page === 1) {
        stats =
          await this.transactionClassificationService.getClassificationStats(
            companyId,
          );
      }

      return {
        transactions: decryptedTransactions,
        pagination: {
          total: result.total,
          page: result.page,
          limit,
          totalPages: result.totalPages,
        },
        stats,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch transaction records: ${errorMessage}`);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `거래 내역 조회 중 오류가 발생했습니다: ${errorMessage}`,
      );
    }
  }

  /**
   * 거래 내역의 암호화된 데이터를 복호화합니다.
   */
  private decryptTransactionData(transactions: any[]): TransactionRecord[] {
    return transactions.map((transaction) => {
      try {
        const description = transaction.description_encrypted
          ? this.encryptionService.decrypt(transaction.description_encrypted)
          : '';

        const branch = transaction.branch_encrypted
          ? this.encryptionService.decrypt(transaction.branch_encrypted)
          : '';

        return {
          transaction_id: transaction.transaction_id,
          company_id: transaction.company_id,
          category_id: transaction.category_id,
          category_name: transaction.category?.category_name || null,
          transaction_date: transaction.transaction_date,
          description,
          deposit_amount: transaction.deposit_amount,
          withdrawal_amount: transaction.withdrawal_amount,
          balance_after: transaction.balance_after,
          branch,
          processed_at: transaction.processed_at,
          created_at: transaction.created_at,
          updated_at: transaction.updated_at,
        };
      } catch (error) {
        this.logger.warn(
          `Failed to decrypt transaction ${transaction.transaction_id}: ${error.message}`,
        );
        // 복호화 실패 시 안전한 기본값으로 반환
        return {
          transaction_id: transaction.transaction_id,
          company_id: transaction.company_id,
          category_id: transaction.category_id,
          category_name: transaction.category?.category_name || null,
          transaction_date: transaction.transaction_date,
          description: '[복호화 실패]',
          deposit_amount: transaction.deposit_amount,
          withdrawal_amount: transaction.withdrawal_amount,
          balance_after: transaction.balance_after,
          branch: '[복호화 실패]',
          processed_at: transaction.processed_at,
          created_at: transaction.created_at,
          updated_at: transaction.updated_at,
        };
      }
    });
  }
}
