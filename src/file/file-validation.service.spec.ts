import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FileValidationService } from './file-validation.service';

describe('FileValidationService', () => {
  let service: FileValidationService;

  const mockFile = (
    originalname: string,
    buffer: Buffer,
    size: number = 1000
  ): Express.Multer.File => ({
    originalname,
    buffer,
    size,
    fieldname: 'file',
    encoding: '7bit',
    mimetype: 'text/plain',
    destination: '',
    filename: '',
    path: '',
    stream: {} as any,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileValidationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              switch (key) {
                case 'ALLOWED_FILE_EXTENSIONS':
                  return 'txt,json';
                case 'FILE_UPLOAD_MAX_SIZE':
                  return '10485760';
                default:
                  return defaultValue;
              }
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FileValidationService>(FileValidationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateFileExtension', () => {
    it('should allow txt files', () => {
      const file = mockFile('test.txt', Buffer.from('test'));
      expect(service.validateFileExtension(file)).toBe(true);
    });

    it('should allow json files', () => {
      const file = mockFile('test.json', Buffer.from('{}'));
      expect(service.validateFileExtension(file)).toBe(true);
    });

    it('should reject exe files', () => {
      const file = mockFile('malware.exe', Buffer.from('test'));
      expect(service.validateFileExtension(file)).toBe(false);
    });

    it('should reject files without extension', () => {
      const file = mockFile('noextension', Buffer.from('test'));
      expect(service.validateFileExtension(file)).toBe(false);
    });

    it('should handle undefined file', () => {
      expect(service.validateFileExtension(undefined as any)).toBe(false);
    });
  });

  describe('calculateFileHash', () => {
    it('should calculate SHA-256 hash correctly', () => {
      const content = 'test content';
      const file = mockFile('test.txt', Buffer.from(content));
      const hash = service.calculateFileHash(file);
      
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(64); // SHA-256 produces 64-character hex string
    });

    it('should produce different hashes for different content', () => {
      const file1 = mockFile('test1.txt', Buffer.from('content1'));
      const file2 = mockFile('test2.txt', Buffer.from('content2'));
      
      const hash1 = service.calculateFileHash(file1);
      const hash2 = service.calculateFileHash(file2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should throw error for invalid file', () => {
      expect(() => service.calculateFileHash(undefined as any)).toThrow('Invalid file or file buffer');
    });
  });

  describe('scanForMalware', () => {
    it('should pass scan for safe file hash', async () => {
      const safeHash = 'safe_file_hash_12345';
      const result = await service.scanForMalware(safeHash);
      expect(result).toBe(true);
    });

    it('should fail scan for known malware hash', async () => {
      const malwareHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const result = await service.scanForMalware(malwareHash);
      expect(result).toBe(false);
    });
  });

  describe('validateFileSize', () => {
    it('should allow files within size limit', () => {
      const file = mockFile('test.txt', Buffer.from('small content'), 1000);
      expect(service.validateFileSize(file)).toBe(true);
    });

    it('should reject files exceeding size limit', () => {
      const file = mockFile('large.txt', Buffer.from('content'), 20000000); // 20MB
      expect(service.validateFileSize(file)).toBe(false);
    });

    it('should handle undefined file', () => {
      expect(service.validateFileSize(undefined as any)).toBe(false);
    });
  });

  describe('validateFileContent', () => {
    it('should validate valid JSON content', () => {
      const jsonContent = JSON.stringify({ test: 'data' });
      const file = mockFile('test.json', Buffer.from(jsonContent));
      expect(service.validateFileContent(file, 'json')).toBe(true);
    });

    it('should reject invalid JSON content', () => {
      const invalidJson = '{ invalid json }';
      const file = mockFile('test.json', Buffer.from(invalidJson));
      expect(service.validateFileContent(file, 'json')).toBe(false);
    });

    it('should validate CSV content', () => {
      const csvContent = 'header1,header2,header3\nvalue1,value2,value3';
      const file = mockFile('test.txt', Buffer.from(csvContent));
      expect(service.validateFileContent(file, 'csv')).toBe(true);
    });

    it('should reject empty file content', () => {
      const file = mockFile('empty.txt', Buffer.from(''));
      expect(service.validateFileContent(file, 'csv')).toBe(false);
    });
  });

  describe('validateFile', () => {
    it('should pass validation for valid JSON file', async () => {
      const jsonContent = JSON.stringify({ companies: [] });
      const file = mockFile('rules.json', Buffer.from(jsonContent), 1000);
      
      const result = await service.validateFile(file, 'json');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.fileHash).toBeTruthy();
    });

    it('should pass validation for valid TXT file', async () => {
      const txtContent = 'date,description,amount\n2025-01-01,test,1000';
      const file = mockFile('transactions.txt', Buffer.from(txtContent), 1000);
      
      const result = await service.validateFile(file, 'csv');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.fileHash).toBeTruthy();
    });

    it('should fail validation for file with wrong extension', async () => {
      const file = mockFile('malware.exe', Buffer.from('content'), 1000);
      
      const result = await service.validateFile(file, 'csv');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File extension not allowed. Allowed extensions: txt, json');
    });

    it('should fail validation for oversized file', async () => {
      const content = 'a'.repeat(20000000); // 20MB
      const file = mockFile('large.txt', Buffer.from(content), 20000000);
      
      const result = await service.validateFile(file, 'csv');
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('File size exceeds'))).toBe(true);
    });

    it('should fail validation for undefined file', async () => {
      const result = await service.validateFile(undefined as any, 'csv');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File is required');
    });
  });
});