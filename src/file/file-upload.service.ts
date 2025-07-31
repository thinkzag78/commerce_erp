import {
  Injectable,
  Logger,
  BadRequestException,
  UnsupportedMediaTypeException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  FileValidationService,
  FileValidationResult,
} from './file-validation.service';
import {
  FileUploadLog,
  FileType,
  UploadStatus,
} from './entities/file-upload-log.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AppLoggerService } from '../common/logger/app-logger.service';
import { readFileSync } from 'fs';

export interface FileUploadResult {
  success: boolean;
  filePath?: string;
  errors?: string[];
  logId?: number;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);

  constructor(
    private fileValidationService: FileValidationService,
    @InjectRepository(FileUploadLog)
    private fileUploadLogRepository: Repository<FileUploadLog>,
    private appLoggerService: AppLoggerService,
  ) {}

  /**
   * 거래 내역 파일을 업로드하고 검증합니다.
   * @param file 업로드된 파일
   * @param userId 업로드한 사용자 ID
   * @returns 업로드 결과
   */
  async uploadTransactionFile(
    file: Express.Multer.File,
    userId: number,
  ): Promise<FileUploadResult> {
    return this.processFileUpload(file, userId, FileType.TRANSACTIONS, 'csv');
  }

  /**
   * 규칙 파일을 업로드하고 검증합니다.
   * @param file 업로드된 파일
   * @param userId 업로드한 사용자 ID
   * @returns 업로드 결과
   */
  async uploadRulesFile(
    file: Express.Multer.File,
    userId: number,
  ): Promise<FileUploadResult> {
    return this.processFileUpload(file, userId, FileType.RULES, 'json');
  }

  /**
   * 파일 업로드를 처리하고 로그를 기록합니다.
   * @param file 업로드된 파일
   * @param userId 업로드한 사용자 ID
   * @param fileType 파일 타입
   * @param expectedFormat 예상되는 파일 형식
   * @returns 업로드 결과
   */
  private async processFileUpload(
    file: Express.Multer.File,
    userId: number,
    fileType: FileType,
    expectedFormat: 'csv' | 'json',
  ): Promise<FileUploadResult> {
    let validationResult: FileValidationResult | undefined;
    let logId: number;

    try {
      // 1. 파일 검증 (해시는 보안 검증용으로만 사용)
      validationResult = await this.fileValidationService.validateFile(
        file,
        expectedFormat,
      );

      // 2. 검증 실패 시 적절한 HTTP 오류 발생
      if (!validationResult.isValid) {
        await this.logUploadFailure(
          file,
          userId,
          fileType,
          validationResult.errors,
        );
        this.throwAppropriateError(validationResult.errors);
      }

      // 3. 성공 로그 기록 (파일 경로 저장)
      logId = await this.logUploadSuccess(
        file,
        userId,
        fileType,
        file.path, // 파일 경로 저장
      );

      // AppLoggerService를 사용한 구조화된 로깅
      this.appLoggerService.logFileUpload({
        userId,
        fileName: file.originalname,
        fileSize: file.size,
        fileHash: validationResult.fileHash!, // 로깅용으로만 사용
        fileType: fileType === FileType.TRANSACTIONS ? 'TRANSACTIONS' : 'RULES',
        status: 'SUCCESS',
      });

      this.logger.log(
        `File upload successful: ${file.originalname} saved to ${file.path} by user ${userId}`,
      );

      return {
        success: true,
        filePath: file.path,
        logId,
      };
    } catch (error: any) {
      // 4. 예외 발생 시 실패 로그 기록
      if (!validationResult) {
        await this.logUploadFailure(file, userId, fileType, [error.message]);
      }

      // AppLoggerService를 사용한 구조화된 로깅
      this.appLoggerService.logFileUpload({
        userId,
        fileName: file?.originalname || 'unknown',
        fileSize: file?.size || 0,
        fileHash: '',
        fileType: fileType === FileType.TRANSACTIONS ? 'TRANSACTIONS' : 'RULES',
        status: 'FAILED',
        errorMessage: error.message,
      });

      this.logger.error(
        `File upload failed: ${file?.originalname} by user ${userId}, error: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * 검증 오류에 따라 적절한 HTTP 예외를 발생시킵니다.
   * @param errors 검증 오류 목록
   */
  private throwAppropriateError(errors: string[]): never {
    const errorMessage = errors.join(', ');

    // 파일 크기 오류
    if (errors.some((error) => error.includes('File size exceeds'))) {
      throw new PayloadTooLargeException(errorMessage);
    }

    // 파일 확장자 오류
    if (errors.some((error) => error.includes('File extension not allowed'))) {
      throw new UnsupportedMediaTypeException(errorMessage);
    }

    // 기타 검증 오류
    throw new BadRequestException(errorMessage);
  }

  /**
   * 성공적인 파일 업로드를 로그에 기록합니다.
   * @param file 업로드된 파일
   * @param userId 사용자 ID
   * @param fileType 파일 타입
   * @param filePath 파일 경로
   * @returns 로그 ID
   */
  private async logUploadSuccess(
    file: Express.Multer.File,
    userId: number,
    fileType: FileType,
    filePath: string,
  ): Promise<number> {
    const log = this.fileUploadLogRepository.create({
      user_id: userId,
      file_name: file.originalname,
      file_path: filePath,
      file_size: file.size,
      file_type: fileType,
      status: UploadStatus.SUCCESS,
      error_message: null,
    });

    const savedLog = await this.fileUploadLogRepository.save(log);
    return savedLog.log_id;
  }

  /**
   * 실패한 파일 업로드를 로그에 기록합니다.
   * @param file 업로드된 파일
   * @param userId 사용자 ID
   * @param fileType 파일 타입
   * @param errors 오류 목록
   * @returns 로그 ID
   */
  private async logUploadFailure(
    file: Express.Multer.File,
    userId: number,
    fileType: FileType,
    errors: string[],
  ): Promise<number> {
    try {
      const log = this.fileUploadLogRepository.create({
        user_id: userId,
        file_name: file?.originalname || 'unknown',
        file_path: '', // 검증 실패 시 경로 없음
        file_size: file?.size || 0,
        file_type: fileType,
        status: UploadStatus.FAILED,
        error_message: errors.join(', '),
      });

      const savedLog = await this.fileUploadLogRepository.save(log);
      return savedLog.log_id;
    } catch (logError) {
      this.logger.error(`Failed to log upload failure: ${logError.message}`);
      return 0;
    }
  }

  /**
   * 사용자의 파일 업로드 로그를 조회합니다.
   * @param userId 사용자 ID
   * @param limit 조회할 로그 수 (기본값: 50)
   * @returns 파일 업로드 로그 목록
   */
  async getUploadLogs(
    userId: number,
    limit: number = 50,
  ): Promise<FileUploadLog[]> {
    return this.fileUploadLogRepository.find({
      where: { user_id: userId },
      order: { uploaded_at: 'DESC' },
      take: limit,
    });
  }

  /**
   * 특정 파일 경로의 업로드 로그를 조회합니다.
   * @param filePath 파일 경로
   * @returns 파일 업로드 로그
   */
  async getLogByFilePath(filePath: string): Promise<FileUploadLog | null> {
    return this.fileUploadLogRepository.findOne({
      where: { file_path: filePath },
      order: { uploaded_at: 'DESC' },
    });
  }

  /**
   * 저장된 파일의 내용을 읽어옵니다.
   * @param filePath 파일 경로
   * @returns 파일 내용
   */
  readUploadedFile(filePath: string): string {
    try {
      return readFileSync(filePath, 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to read file ${filePath}: ${error.message}`);
      throw new BadRequestException(`파일을 읽을 수 없습니다: ${filePath}`);
    }
  }

  /**
   * 파일 업로드 통계를 조회합니다.
   * @param userId 사용자 ID (선택사항, 전체 통계 시 null)
   * @returns 업로드 통계
   */
  async getUploadStats(userId?: number): Promise<{
    totalUploads: number;
    successfulUploads: number;
    failedUploads: number;
    successRate: number;
  }> {
    const whereCondition = userId ? { user_id: userId } : {};

    const [totalUploads, successfulUploads] = await Promise.all([
      this.fileUploadLogRepository.count({ where: whereCondition }),
      this.fileUploadLogRepository.count({
        where: { ...whereCondition, status: UploadStatus.SUCCESS },
      }),
    ]);

    const failedUploads = totalUploads - successfulUploads;
    const successRate =
      totalUploads > 0 ? (successfulUploads / totalUploads) * 100 : 0;

    return {
      totalUploads,
      successfulUploads,
      failedUploads,
      successRate: Math.round(successRate * 100) / 100, // 소수점 2자리
    };
  }
}
