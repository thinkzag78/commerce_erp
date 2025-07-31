import { Injectable, Logger } from '@nestjs/common';

export interface FileUploadLogData {
  userId: number;
  fileName: string;
  fileSize: number;
  fileHash: string;
  fileType: 'TRANSACTIONS' | 'RULES';
  status: 'SUCCESS' | 'FAILED';
  errorMessage?: string;
}

export interface ClassificationLogData {
  userId: number;
  companyId: string;
  totalTransactions: number;
  classifiedCount: number;
  unclassifiedCount: number;
  processingTimeMs: number;
}

export interface SecurityLogData {
  userId?: number;
  event: SecurityLogEvent;
  ipAddress: string;
  userAgent: string;
  details?: string;
}

export const enum SecurityLogEvent {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  FORBIDDEN_ACCESS = 'FORBIDDEN_ACCESS',
  FILE_VALIDATION_FAILED = 'FILE_VALIDATION_FAILED',
}

@Injectable()
export class AppLoggerService extends Logger {
  constructor() {
    super('AppLogger');
  }

  /**
   * 파일 업로드 로그 기록
   */
  logFileUpload(data: FileUploadLogData): void {
    const logMessage = `File Upload - User: ${data.userId}, File: ${data.fileName} (${data.fileSize} bytes), Type: ${data.fileType}, Status: ${data.status}`;

    if (data.status === 'SUCCESS') {
      this.log(`${logMessage}, Hash: ${data.fileHash}`);
    } else {
      this.error(
        `${logMessage}, Error: ${data.errorMessage || 'Unknown error'}`,
      );
    }
  }

  /**
   * 거래 분류 결과 로그 기록
   */
  logClassificationResult(data: ClassificationLogData): void {
    const logMessage = `Transaction Classification - User: ${data.userId}, Company: ${data.companyId}, Total: ${data.totalTransactions}, Classified: ${data.classifiedCount}, Unclassified: ${data.unclassifiedCount}, Processing Time: ${data.processingTimeMs}ms`;

    this.log(logMessage);

    // 분류 성공률이 낮은 경우 경고 로그
    const classificationRate =
      data.totalTransactions > 0
        ? (data.classifiedCount / data.totalTransactions) * 100
        : 0;
    if (classificationRate < 80 && data.totalTransactions > 0) {
      this.warn(
        `Low classification rate: ${classificationRate.toFixed(2)}% for company ${data.companyId}`,
      );
    }
  }

  /**
   * 보안 관련 이벤트 로그 기록
   */
  logSecurityEvent(data: SecurityLogData): void {
    const baseMessage = `Security Event - ${data.event}, IP: ${data.ipAddress}, User-Agent: ${data.userAgent}`;
    const fullMessage = data.userId
      ? `${baseMessage}, User: ${data.userId}`
      : baseMessage;

    const messageWithDetails = data.details
      ? `${fullMessage}, Details: ${data.details}`
      : fullMessage;

    switch (data.event) {
      case SecurityLogEvent.LOGIN_SUCCESS:
        this.log(messageWithDetails);
        break;
      case SecurityLogEvent.LOGIN_FAILED:
      case SecurityLogEvent.UNAUTHORIZED_ACCESS:
      case SecurityLogEvent.FORBIDDEN_ACCESS:
      case SecurityLogEvent.FILE_VALIDATION_FAILED:
        this.warn(messageWithDetails);
        break;
      default:
        this.log(messageWithDetails);
    }
  }

  /**
   * 데이터베이스 작업 로그 기록
   */
  logDatabaseOperation(
    operation: string,
    table: string,
    recordCount: number,
    durationMs: number,
  ): void {
    this.log(
      `Database ${operation} - Table: ${table}, Records: ${recordCount}, Duration: ${durationMs}ms`,
    );
  }

  /**
   * API 요청 로그 기록
   */
  logApiRequest(
    method: string,
    url: string,
    statusCode: number,
    responseTimeMs: number,
    userId?: number,
  ): void {
    const userInfo = userId ? `, User: ${userId}` : '';
    this.log(
      `API ${method} ${url} - ${statusCode} - ${responseTimeMs}ms${userInfo}`,
    );
  }

  /**
   * 암호화/복호화 작업 로그 기록
   */
  logEncryptionOperation(
    operation: 'ENCRYPT' | 'DECRYPT',
    dataType: string,
    success: boolean,
  ): void {
    const status = success ? 'SUCCESS' : 'FAILED';
    this.log(`Encryption ${operation} - Type: ${dataType}, Status: ${status}`);
  }

  /**
   * 규칙 엔진 작업 로그 기록
   */
  logRuleEngineOperation(
    companyId: string,
    rulesLoaded: number,
    transactionsProcessed: number,
  ): void {
    this.log(
      `Rule Engine - Company: ${companyId}, Rules Loaded: ${rulesLoaded}, Transactions Processed: ${transactionsProcessed}`,
    );
  }
}
