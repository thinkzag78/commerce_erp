import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Readable } from 'stream';
import {
  BadRequestException,
  UnsupportedMediaTypeException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileUploadService } from './file-upload.service';
import { FileValidationService } from './file-validation.service';
import { FileUploadLog, FileType, UploadStatus } from './entities/file-upload-log.entity';

describe('FileUploadService', () => {
  let service: FileUploadService;
  let fileValidationService: FileValidationService;
  let repository: Repository<FileUploadLog>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  };

  const mockFileValidationService = {
    validateFile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileUploadService,
        {
          provide: FileValidationService,
          useValue: mockFileValidationService,
        },
        {
          provide: getRepositoryToken(FileUploadLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<FileUploadService>(FileUploadService);
    fileValidationService = module.get<FileValidationService>(FileValidationService);
    repository = module.get<Repository<FileUploadLog>>(getRepositoryToken(FileUploadLog));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadTransactionFile', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'transactions.txt',
      encoding: '7bit',
      mimetype: 'text/plain',
      size: 1024,
      buffer: Buffer.from('test content'),
      destination: '',
      filename: '',
      path: '',
      stream: new Readable(),
    };

    it('성공적으로 거래 내역 파일을 업로드해야 합니다', async () => {
      // Given
      const userId = 1;
      const fileHash = 'test-hash';
      const logId = 123;

      mockFileValidationService.validateFile.mockResolvedValue({
        isValid: true,
        errors: [],
        fileHash,
      });

      mockRepository.create.mockReturnValue({ log_id: logId });
      mockRepository.save.mockResolvedValue({ log_id: logId });

      // When
      const result = await service.uploadTransactionFile(mockFile, userId);

      // Then
      expect(result).toEqual({
        success: true,
        fileHash,
        logId,
      });

      expect(fileValidationService.validateFile).toHaveBeenCalledWith(mockFile, 'csv');
      expect(repository.create).toHaveBeenCalledWith({
        user_id: userId,
        file_name: mockFile.originalname,
        file_hash: fileHash,
        file_size: mockFile.size,
        file_type: FileType.TRANSACTIONS,
        status: UploadStatus.SUCCESS,
        error_message: null,
      });
    });

    it('파일 검증 실패 시 적절한 예외를 발생시켜야 합니다', async () => {
      // Given
      const userId = 1;
      const errors = ['File size exceeds maximum limit'];

      mockFileValidationService.validateFile.mockResolvedValue({
        isValid: false,
        errors,
      });

      mockRepository.create.mockReturnValue({ log_id: 1 });
      mockRepository.save.mockResolvedValue({ log_id: 1 });

      // When & Then
      await expect(service.uploadTransactionFile(mockFile, userId)).rejects.toThrow(
        PayloadTooLargeException,
      );

      expect(repository.create).toHaveBeenCalledWith({
        user_id: userId,
        file_name: mockFile.originalname,
        file_hash: '',
        file_size: mockFile.size,
        file_type: FileType.TRANSACTIONS,
        status: UploadStatus.FAILED,
        error_message: errors.join(', '),
      });
    });

    it('파일 확장자 오류 시 UnsupportedMediaTypeException을 발생시켜야 합니다', async () => {
      // Given
      const userId = 1;
      const errors = ['File extension not allowed'];

      mockFileValidationService.validateFile.mockResolvedValue({
        isValid: false,
        errors,
      });

      mockRepository.create.mockReturnValue({ log_id: 1 });
      mockRepository.save.mockResolvedValue({ log_id: 1 });

      // When & Then
      await expect(service.uploadTransactionFile(mockFile, userId)).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
    });

    it('기타 검증 오류 시 BadRequestException을 발생시켜야 합니다', async () => {
      // Given
      const userId = 1;
      const errors = ['Invalid file format'];

      mockFileValidationService.validateFile.mockResolvedValue({
        isValid: false,
        errors,
      });

      mockRepository.create.mockReturnValue({ log_id: 1 });
      mockRepository.save.mockResolvedValue({ log_id: 1 });

      // When & Then
      await expect(service.uploadTransactionFile(mockFile, userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('uploadRulesFile', () => {
    const mockJsonFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'rules.json',
      encoding: '7bit',
      mimetype: 'application/json',
      size: 512,
      buffer: Buffer.from('{"test": "content"}'),
      destination: '',
      filename: '',
      path: '',
      stream: new Readable(),
    };

    it('성공적으로 규칙 파일을 업로드해야 합니다', async () => {
      // Given
      const userId = 1;
      const fileHash = 'test-hash';
      const logId = 124;

      mockFileValidationService.validateFile.mockResolvedValue({
        isValid: true,
        errors: [],
        fileHash,
      });

      mockRepository.create.mockReturnValue({ log_id: logId });
      mockRepository.save.mockResolvedValue({ log_id: logId });

      // When
      const result = await service.uploadRulesFile(mockJsonFile, userId);

      // Then
      expect(result).toEqual({
        success: true,
        fileHash,
        logId,
      });

      expect(fileValidationService.validateFile).toHaveBeenCalledWith(mockJsonFile, 'json');
      expect(repository.create).toHaveBeenCalledWith({
        user_id: userId,
        file_name: mockJsonFile.originalname,
        file_hash: fileHash,
        file_size: mockJsonFile.size,
        file_type: FileType.RULES,
        status: UploadStatus.SUCCESS,
        error_message: null,
      });
    });
  });

  describe('getUploadLogs', () => {
    it('사용자의 업로드 로그를 조회해야 합니다', async () => {
      // Given
      const userId = 1;
      const limit = 10;
      const mockLogs = [
        { log_id: 1, file_name: 'test1.txt' },
        { log_id: 2, file_name: 'test2.json' },
      ];

      mockRepository.find.mockResolvedValue(mockLogs);

      // When
      const result = await service.getUploadLogs(userId, limit);

      // Then
      expect(result).toEqual(mockLogs);
      expect(repository.find).toHaveBeenCalledWith({
        where: { user_id: userId },
        order: { uploaded_at: 'DESC' },
        take: limit,
      });
    });
  });

  describe('getLogByFileHash', () => {
    it('파일 해시로 로그를 조회해야 합니다', async () => {
      // Given
      const fileHash = 'test-hash';
      const mockLog = { log_id: 1, file_hash: fileHash };

      mockRepository.findOne.mockResolvedValue(mockLog);

      // When
      const result = await service.getLogByFileHash(fileHash);

      // Then
      expect(result).toEqual(mockLog);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { file_hash: fileHash },
        order: { uploaded_at: 'DESC' },
      });
    });
  });

  describe('getUploadStats', () => {
    it('업로드 통계를 조회해야 합니다', async () => {
      // Given
      const userId = 1;
      const totalUploads = 10;
      const successfulUploads = 8;

      mockRepository.count
        .mockResolvedValueOnce(totalUploads)
        .mockResolvedValueOnce(successfulUploads);

      // When
      const result = await service.getUploadStats(userId);

      // Then
      expect(result).toEqual({
        totalUploads,
        successfulUploads,
        failedUploads: 2,
        successRate: 80,
      });

      expect(repository.count).toHaveBeenCalledWith({
        where: { user_id: userId },
      });
      expect(repository.count).toHaveBeenCalledWith({
        where: { user_id: userId, status: UploadStatus.SUCCESS },
      });
    });

    it('전체 통계를 조회해야 합니다 (userId 없음)', async () => {
      // Given
      const totalUploads = 100;
      const successfulUploads = 85;

      mockRepository.count
        .mockResolvedValueOnce(totalUploads)
        .mockResolvedValueOnce(successfulUploads);

      // When
      const result = await service.getUploadStats();

      // Then
      expect(result).toEqual({
        totalUploads,
        successfulUploads,
        failedUploads: 15,
        successRate: 85,
      });

      expect(repository.count).toHaveBeenCalledWith({ where: {} });
      expect(repository.count).toHaveBeenCalledWith({
        where: { status: UploadStatus.SUCCESS },
      });
    });
  });
});