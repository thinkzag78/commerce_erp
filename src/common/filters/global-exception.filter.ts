import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  HttpStatusMessage,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

export interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request);

    // 로그 기록
    this.logError(exception, request, errorResponse);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(
    exception: unknown,
    request: Request,
  ): ErrorResponse {
    const timestamp = new Date().toISOString();
    const path = request.url;

    if (exception instanceof HttpException) {
      return this.handleHttpException(exception, timestamp, path);
    }

    if (exception instanceof QueryFailedError) {
      return this.handleDatabaseError(exception, timestamp, path);
    }

    // 알 수 없는 오류는 500으로 처리
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
      timestamp,
      path,
    };
  }

  private handleHttpException(
    exception: HttpException,
    timestamp: string,
    path: string,
  ): ErrorResponse {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string;
    let error: string;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
      error = this.getErrorNameByStatus(status);
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const responseObj = exceptionResponse as Record<string, string>;
      message = responseObj.message || exception.message;
      error = responseObj.error || this.getErrorNameByStatus(status);
    } else {
      message = exception.message;
      error = this.getErrorNameByStatus(status);
    }

    return {
      statusCode: status,
      message,
      error,
      timestamp,
      path,
    };
  }

  private handleDatabaseError(
    exception: QueryFailedError,
    timestamp: string,
    path: string,
  ): ErrorResponse {
    // 데이터베이스 연결 오류 처리
    if (
      exception.message.includes('ECONNREFUSED') ||
      exception.message.includes('Connection lost')
    ) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database service is temporarily unavailable',
        error: 'Service Unavailable',
        timestamp,
        path,
      };
    }

    // 기타 데이터베이스 오류는 500으로 처리
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Database operation failed',
      error: 'Internal Server Error',
      timestamp,
      path,
    };
  }

  private getErrorNameByStatus(status: HttpStatus): string {
    return HttpStatusMessage[status] ?? 'Error';
  }

  private logError(
    exception: unknown,
    request: Request,
    errorResponse: ErrorResponse,
  ): void {
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || '';

    const logMessage = `${method} ${url} - ${errorResponse.statusCode} - ${ip} - ${userAgent}`;

    if (errorResponse.statusCode >= 500) {
      // 서버 오류는 ERROR 레벨로 로깅
      this.logger.error(
        `${logMessage} - ${errorResponse.message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (errorResponse.statusCode >= 400) {
      // 클라이언트 오류는 WARN 레벨로 로깅
      this.logger.warn(`${logMessage} - ${errorResponse.message}`);
    }
  }
}
