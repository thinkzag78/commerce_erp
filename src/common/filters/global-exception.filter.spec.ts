import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { GlobalExceptionFilter, ErrorResponse } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockArgumentsHost: ArgumentsHost;
  let mockResponse: any;
  let mockRequest: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GlobalExceptionFilter],
    }).compile();

    filter = module.get<GlobalExceptionFilter>(GlobalExceptionFilter);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      url: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
      },
    };

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('HTTP 예외 처리', () => {
    it('400 Bad Request 예외를 올바르게 처리해야 함', () => {
      const exception = new HttpException('Invalid input', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Invalid input',
          error: 'Bad Request',
          timestamp: expect.any(String),
          path: '/test',
        }),
      );
    });

    it('401 Unauthorized 예외를 올바르게 처리해야 함', () => {
      const exception = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: 'Unauthorized',
          error: 'Unauthorized',
        }),
      );
    });

    it('403 Forbidden 예외를 올바르게 처리해야 함', () => {
      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: 'Forbidden',
          error: 'Forbidden',
        }),
      );
    });

    it('413 Payload Too Large 예외를 올바르게 처리해야 함', () => {
      const exception = new HttpException(
        'File too large',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(413);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 413,
          message: 'File too large',
          error: 'Payload Too Large',
        }),
      );
    });

    it('415 Unsupported Media Type 예외를 올바르게 처리해야 함', () => {
      const exception = new HttpException(
        'Unsupported file type',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(415);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 415,
          message: 'Unsupported file type',
          error: 'Unsupported Media Type',
        }),
      );
    });
  });

  describe('데이터베이스 예외 처리', () => {
    it('데이터베이스 연결 오류를 503으로 처리해야 함', () => {
      const exception = new QueryFailedError(
        'SELECT * FROM users',
        [],
        new Error('ECONNREFUSED'),
      );

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          message: 'Database service is temporarily unavailable',
          error: 'Service Unavailable',
        }),
      );
    });

    it('기타 데이터베이스 오류를 500으로 처리해야 함', () => {
      const exception = new QueryFailedError(
        'SELECT * FROM users',
        [],
        new Error('Syntax error'),
      );

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Database operation failed',
          error: 'Internal Server Error',
        }),
      );
    });
  });

  describe('알 수 없는 예외 처리', () => {
    it('알 수 없는 예외를 500으로 처리해야 함', () => {
      const exception = new Error('Unknown error');

      filter.catch(exception, mockArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Internal server error',
          error: 'Internal Server Error',
        }),
      );
    });
  });

  describe('응답 형식', () => {
    it('모든 오류 응답이 표준 형식을 따라야 함', () => {
      const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost);

      const responseCall = mockResponse.json.mock.calls[0][0];
      expect(responseCall).toHaveProperty('statusCode');
      expect(responseCall).toHaveProperty('message');
      expect(responseCall).toHaveProperty('error');
      expect(responseCall).toHaveProperty('timestamp');
      expect(responseCall).toHaveProperty('path');
      expect(typeof responseCall.timestamp).toBe('string');
      expect(responseCall.path).toBe('/test');
    });
  });
});