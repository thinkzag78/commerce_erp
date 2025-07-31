import {
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  Request,
  Get,
  Query,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FileUploadService, FileUploadResult } from './file-upload.service';
import { AuthGuard } from '@nestjs/passport';
import { FileUploadLog } from './entities/file-upload-log.entity';
import { multerConfig } from './multer.config';

interface AuthenticatedRequest extends Request {
  user: {
    userId: number;
    username: string;
    userType: string;
    companyId?: string;
  };
}

@ApiExcludeController()
@Controller('api/v1/files')
@UseGuards(AuthGuard('jwt'))
export class FileController {
  constructor(private readonly fileUploadService: FileUploadService) {}

  /**
   * 거래 내역 파일과 규칙 파일을 동시에 업로드합니다.
   * @param files 업로드된 파일들 (transactions.txt, rules.json)
   * @param req 인증된 요청 객체
   * @returns 업로드 결과
   */
  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 2, multerConfig))
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: AuthenticatedRequest,
  ): Promise<{
    success: boolean;
    results: {
      transactions?: FileUploadResult;
      rules?: FileUploadResult;
    };
    message: string;
  }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('no-upload-files');
    }

    const results: {
      transactions?: FileUploadResult;
      rules?: FileUploadResult;
    } = {};

    // 거래 내역 파일 찾기 (.txt)
    const transactionFile = files.find(
      (file) =>
        file.originalname.toLowerCase().endsWith('.txt') ||
        file.fieldname === 'transactions',
    );

    // 규칙 파일 찾기 (.json)
    const rulesFile = files.find(
      (file) =>
        file.originalname.toLowerCase().endsWith('.json') ||
        file.fieldname === 'rules',
    );

    // 거래 내역 파일 처리
    if (transactionFile) {
      results.transactions = await this.fileUploadService.uploadTransactionFile(
        transactionFile,
        req.user.userId,
      );
    }

    // 규칙 파일 처리
    if (rulesFile) {
      results.rules = await this.fileUploadService.uploadRulesFile(
        rulesFile,
        req.user.userId,
      );
    }

    const allSuccessful =
      (!transactionFile || results.transactions?.success === true) &&
      (!rulesFile || results.rules?.success === true);

    return {
      success: !!allSuccessful,
      results,
      message: allSuccessful
        ? '파일 업로드가 성공적으로 완료되었습니다.'
        : '일부 파일 업로드에 실패했습니다.',
    };
  }

  /**
   * 사용자의 파일 업로드 로그를 조회합니다.
   * @param req 인증된 요청 객체
   * @param limit 조회할 로그 수
   * @returns 파일 업로드 로그 목록
   */
  @Get('logs')
  async getUploadLogs(
    @Request() req: AuthenticatedRequest,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<FileUploadLog[]> {
    return this.fileUploadService.getUploadLogs(req.user.userId, limit);
  }

  /**
   * 파일 업로드 통계를 조회합니다.
   * @param req 인증된 요청 객체
   * @returns 업로드 통계
   */
  @Get('stats')
  async getUploadStats(@Request() req: AuthenticatedRequest): Promise<{
    totalUploads: number;
    successfulUploads: number;
    failedUploads: number;
    successRate: number;
  }> {
    return this.fileUploadService.getUploadStats(req.user.userId);
  }
}
