import { Test, TestingModule } from '@nestjs/testing';
import {
  AppLoggerService,
  FileUploadLogData,
  ClassificationLogData,
  SecurityLogData,
} from './app-logger.service';

describe('AppLoggerService', () => {
  let service: AppLoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppLoggerService],
    }).compile();

    service = module.get<AppLoggerService>(AppLoggerService);

    // 로그 출력을 모킹하여 테스트 중 콘솔 출력 방지
    jest.spyOn(service, 'log').mockImplementation();
    jest.spyOn(service, 'error').mockImplementation();
    jest.spyOn(service, 'warn').mockImplementation();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('파일 업로드 로그', () => {
    it('성공한 파일 업로드를 로그해야 함', () => {
      const logData: FileUploadLogData = {
        userId: 1,
        fileName: 'transactions.txt',
        fileSize: 1024,
        fileHash: 'abc123',
        fileType: 'TRANSACTIONS',
        status: 'SUCCESS',
      };

      service.logFileUpload(logData);

      expect(service.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'File Upload - User: 1, File: transactions.txt (1024 bytes), Type: TRANSACTIONS, Status: SUCCESS, Hash: abc123',
        ),
      );
    });

    it('실패한 파일 업로드를 로그해야 함', () => {
      const logData: FileUploadLogData = {
        userId: 1,
        fileName: 'invalid.txt',
        fileSize: 2048,
        fileHash: 'def456',
        fileType: 'RULES',
        status: 'FAILED',
        errorMessage: 'Invalid file format',
      };

      service.logFileUpload(logData);

      expect(service.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'File Upload - User: 1, File: invalid.txt (2048 bytes), Type: RULES, Status: FAILED, Error: Invalid file format',
        ),
      );
    });
  });

  describe('거래 분류 결과 로그', () => {
    it('거래 분류 결과를 로그해야 함', () => {
      const logData: ClassificationLogData = {
        userId: 1,
        companyId: 'com_1',
        totalTransactions: 100,
        classifiedCount: 85,
        unclassifiedCount: 15,
        processingTimeMs: 1500,
      };

      service.logClassificationResult(logData);

      expect(service.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Transaction Classification - User: 1, Company: com_1, Total: 100, Classified: 85, Unclassified: 15, Processing Time: 1500ms',
        ),
      );
    });

    it('낮은 분류 성공률에 대해 경고를 로그해야 함', () => {
      const logData: ClassificationLogData = {
        userId: 1,
        companyId: 'com_1',
        totalTransactions: 100,
        classifiedCount: 70, // 70% 분류 성공률
        unclassifiedCount: 30,
        processingTimeMs: 1500,
      };

      service.logClassificationResult(logData);

      expect(service.log).toHaveBeenCalled();
      expect(service.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Low classification rate: 70.00% for company com_1',
        ),
      );
    });
  });

  describe('보안 이벤트 로그', () => {
    it('로그인 성공 이벤트를 로그해야 함', () => {
      const logData: SecurityLogData = {
        userId: 1,
        event: 'LOGIN_SUCCESS',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      service.logSecurityEvent(logData);

      expect(service.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Security Event - LOGIN_SUCCESS, IP: 192.168.1.1, User-Agent: Mozilla/5.0, User: 1',
        ),
      );
    });

    it('로그인 실패 이벤트를 경고로 로그해야 함', () => {
      const logData: SecurityLogData = {
        event: 'LOGIN_FAILED',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        details: 'Invalid credentials',
      };

      service.logSecurityEvent(logData);

      expect(service.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Security Event - LOGIN_FAILED, IP: 192.168.1.1, User-Agent: Mozilla/5.0, Details: Invalid credentials',
        ),
      );
    });

    it('권한 없는 접근 이벤트를 경고로 로그해야 함', () => {
      const logData: SecurityLogData = {
        userId: 2,
        event: 'UNAUTHORIZED_ACCESS',
        ipAddress: '192.168.1.2',
        userAgent: 'curl/7.68.0',
        details: 'Invalid JWT token',
      };

      service.logSecurityEvent(logData);

      expect(service.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Security Event - UNAUTHORIZED_ACCESS, IP: 192.168.1.2, User-Agent: curl/7.68.0, User: 2, Details: Invalid JWT token',
        ),
      );
    });

    it('금지된 접근 이벤트를 경고로 로그해야 함', () => {
      const logData: SecurityLogData = {
        userId: 3,
        event: 'FORBIDDEN_ACCESS',
        ipAddress: '192.168.1.3',
        userAgent: 'PostmanRuntime/7.28.4',
        details: 'Insufficient permissions',
      };

      service.logSecurityEvent(logData);

      expect(service.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Security Event - FORBIDDEN_ACCESS, IP: 192.168.1.3, User-Agent: PostmanRuntime/7.28.4, User: 3, Details: Insufficient permissions',
        ),
      );
    });

    it('파일 검증 실패 이벤트를 경고로 로그해야 함', () => {
      const logData: SecurityLogData = {
        userId: 1,
        event: 'FILE_VALIDATION_FAILED',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        details: 'Malicious file detected',
      };

      service.logSecurityEvent(logData);

      expect(service.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Security Event - FILE_VALIDATION_FAILED, IP: 192.168.1.1, User-Agent: Mozilla/5.0, User: 1, Details: Malicious file detected',
        ),
      );
    });
  });

  describe('기타 로그 메서드', () => {
    it('데이터베이스 작업을 로그해야 함', () => {
      service.logDatabaseOperation('INSERT', 'transactions', 50, 250);

      expect(service.log).toHaveBeenCalledWith(
        'Database INSERT - Table: transactions, Records: 50, Duration: 250ms',
      );
    });

    it('API 요청을 로그해야 함', () => {
      service.logApiRequest('POST', '/api/v1/accounting/process', 200, 1500, 1);

      expect(service.log).toHaveBeenCalledWith(
        'API POST /api/v1/accounting/process - 200 - 1500ms, User: 1',
      );
    });

    it('사용자 정보 없이 API 요청을 로그해야 함', () => {
      service.logApiRequest('GET', '/api/v1/health', 200, 50);

      expect(service.log).toHaveBeenCalledWith(
        'API GET /api/v1/health - 200 - 50ms',
      );
    });

    it('암호화 작업을 로그해야 함', () => {
      service.logEncryptionOperation(
        'ENCRYPT',
        'transaction_description',
        true,
      );

      expect(service.log).toHaveBeenCalledWith(
        'Encryption ENCRYPT - Type: transaction_description, Status: SUCCESS',
      );
    });

    it('규칙 엔진 작업을 로그해야 함', () => {
      service.logRuleEngineOperation('com_1', 15, 100);

      expect(service.log).toHaveBeenCalledWith(
        'Rule Engine - Company: com_1, Rules Loaded: 15, Transactions Processed: 100',
      );
    });
  });
});
