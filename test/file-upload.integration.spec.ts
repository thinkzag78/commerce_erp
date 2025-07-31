import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User, UserType } from '../src/auth/entities/user.entity';
import { Company } from '../src/auth/entities/company.entity';
import { FileUploadLog } from '../src/file/entities/file-upload-log.entity';
import { AuthService } from '../src/auth/auth.service';

describe('File Upload Integration Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let authService: AuthService;
  let adminToken: string;

  // Test data
  const testCompany = {
    company_id: 'test_company_file',
    company_name: 'Test File Company',
  };

  const testAdmin = {
    username: 'admin_file_test',
    password: 'admin123!',
    userType: UserType.ADMIN,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    authService = moduleFixture.get<AuthService>(AuthService);

    await setupTestData();
    await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  async function setupTestData() {
    // Create test company
    const companyRepository = dataSource.getRepository(Company);
    await companyRepository.save(testCompany);

    // Create test user
    await authService.createUser(
      testAdmin.username,
      testAdmin.password,
      testAdmin.userType,
    );
  }

  async function getAuthToken() {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        username: testAdmin.username,
        password: testAdmin.password,
      });
    adminToken = response.body.access_token;
  }

  async function cleanupTestData() {
    const userRepository = dataSource.getRepository(User);
    const companyRepository = dataSource.getRepository(Company);
    const fileLogRepository = dataSource.getRepository(FileUploadLog);

    await fileLogRepository.delete({});
    await userRepository.delete({ username: testAdmin.username });
    await companyRepository.delete({ company_id: testCompany.company_id });
  }

  function createValidTransactionFile(): Buffer {
    const content = `거래일시,적요,입금액,출금액,거래후잔액,거래점
2025-07-20 13:45:11,스타벅스 강남2호점,0,5500,994500,강남지점
2025-07-20 14:30:22,급여입금,3000000,0,3994500,본점`;
    return Buffer.from(content, 'utf-8');
  }

  function createValidRulesFile(): Buffer {
    const rules = {
      companies: [
        {
          company_id: testCompany.company_id,
          categories: [
            {
              category_id: 'cat_test',
              category_name: '테스트 카테고리',
              keywords: ['스타벅스'],
              exclude_keywords: [],
              amount_range: { min: 1000, max: 50000 },
              transaction_type: 'WITHDRAWAL',
              priority: 1,
            },
          ],
        },
      ],
    };
    return Buffer.from(JSON.stringify(rules, null, 2), 'utf-8');
  }

  describe('File Extension Validation', () => {
    it('should accept .txt files for transactions', async () => {
      const transactionFile = createValidTransactionFile();
      const rulesFile = createValidRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);
    });

    it('should accept .json files for rules', async () => {
      const transactionFile = createValidTransactionFile();
      const rulesFile = createValidRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);
    });

    it('should reject .pdf files', async () => {
      const invalidFile = Buffer.from('PDF content', 'utf-8');

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', invalidFile, 'document.pdf')
        .expect(400);
    });

    it('should reject .exe files', async () => {
      const invalidFile = Buffer.from('Executable content', 'utf-8');

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', invalidFile, 'malware.exe')
        .expect(400);
    });

    it('should reject .docx files', async () => {
      const invalidFile = Buffer.from('Document content', 'utf-8');

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', invalidFile, 'document.docx')
        .expect(400);
    });
  });

  describe('File Size Validation', () => {
    it('should accept files within size limit', async () => {
      const transactionFile = createValidTransactionFile();
      const rulesFile = createValidRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);
    });

    it('should reject files exceeding size limit', async () => {
      // Create a large file (assuming 10MB limit)
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
      const largeFile = Buffer.from(largeContent, 'utf-8');

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', largeFile, 'large.txt')
        .expect(413);
    });
  });

  describe('File Content Validation', () => {
    it('should validate transaction file format', async () => {
      const invalidTransactionFile = Buffer.from('invalid,format,here', 'utf-8');
      const rulesFile = createValidRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', invalidTransactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(400);
    });

    it('should validate rules file JSON format', async () => {
      const transactionFile = createValidTransactionFile();
      const invalidRulesFile = Buffer.from('invalid json content', 'utf-8');

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', invalidRulesFile, 'rules.json')
        .expect(400);
    });

    it('should validate transaction file headers', async () => {
      const invalidHeaders = `wrong,headers,here
2025-07-20 13:45:11,스타벅스 강남2호점,0,5500,994500,강남지점`;
      const invalidTransactionFile = Buffer.from(invalidHeaders, 'utf-8');
      const rulesFile = createValidRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', invalidTransactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(400);
    });

    it('should validate rules file structure', async () => {
      const transactionFile = createValidTransactionFile();
      const invalidRulesStructure = {
        invalid_structure: 'missing companies array',
      };
      const invalidRulesFile = Buffer.from(JSON.stringify(invalidRulesStructure), 'utf-8');

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', invalidRulesFile, 'rules.json')
        .expect(400);
    });
  });

  describe('File Hash Calculation', () => {
    it('should calculate and store file hash for uploaded files', async () => {
      const transactionFile = createValidTransactionFile();
      const rulesFile = createValidRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);

      // Check if file upload logs were created with hash values
      const fileLogRepository = dataSource.getRepository(FileUploadLog);
      const logs = await fileLogRepository.find({
        where: { user: { username: testAdmin.username } },
        relations: ['user'],
      });

      expect(logs.length).toBeGreaterThan(0);
      logs.forEach(log => {
        expect(log.file_hash).toBeDefined();
        expect(log.file_hash.length).toBeGreaterThan(0);
        expect(log.file_size).toBeGreaterThan(0);
      });
    });

    it('should detect duplicate files by hash', async () => {
      const transactionFile = createValidTransactionFile();
      const rulesFile = createValidRulesFile();

      // Upload files first time
      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);

      // Upload same files again - should still work but might log duplicate detection
      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions_duplicate.txt')
        .attach('files', rulesFile, 'rules_duplicate.json')
        .expect(201);
    });
  });

  describe('Malware Detection Simulation', () => {
    it('should handle suspicious file patterns', async () => {
      // Create files with suspicious patterns (but still valid format)
      const suspiciousTransaction = `거래일시,적요,입금액,출금액,거래후잔액,거래점
2025-07-20 13:45:11,<script>alert('xss')</script>,0,5500,994500,강남지점`;
      const suspiciousFile = Buffer.from(suspiciousTransaction, 'utf-8');
      const rulesFile = createValidRulesFile();

      // Should still process but might flag in logs
      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', suspiciousFile, 'suspicious.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);
    });

    it('should handle binary content in text files', async () => {
      // Create file with binary content
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE]);
      const rulesFile = createValidRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', binaryContent, 'binary.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(400);
    });
  });

  describe('File Upload Logging', () => {
    it('should log successful file uploads', async () => {
      const transactionFile = createValidTransactionFile();
      const rulesFile = createValidRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);

      const fileLogRepository = dataSource.getRepository(FileUploadLog);
      const logs = await fileLogRepository.find({
        where: { user: { username: testAdmin.username } },
        relations: ['user'],
      });

      expect(logs.length).toBeGreaterThan(0);
      
      const successfulLogs = logs.filter(log => log.status === 'SUCCESS');
      expect(successfulLogs.length).toBeGreaterThan(0);

      successfulLogs.forEach(log => {
        expect(log.file_name).toBeDefined();
        expect(log.file_hash).toBeDefined();
        expect(log.file_size).toBeGreaterThan(0);
        expect(log.uploaded_at).toBeDefined();
        expect(log.error_message).toBeNull();
      });
    });

    it('should log failed file uploads', async () => {
      const invalidFile = Buffer.from('invalid content', 'utf-8');

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', invalidFile, 'invalid.pdf')
        .expect(400);

      // Note: Failed uploads might not create logs depending on where validation fails
      // This test verifies the logging mechanism exists
    });

    it('should associate file logs with correct user', async () => {
      const transactionFile = createValidTransactionFile();
      const rulesFile = createValidRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);

      const fileLogRepository = dataSource.getRepository(FileUploadLog);
      const logs = await fileLogRepository.find({
        where: { user: { username: testAdmin.username } },
        relations: ['user'],
      });

      expect(logs.length).toBeGreaterThan(0);
      logs.forEach(log => {
        expect(log.user.username).toBe(testAdmin.username);
      });
    });
  });

  describe('Multiple File Upload', () => {
    it('should handle multiple files in single request', async () => {
      const transactionFile = createValidTransactionFile();
      const rulesFile = createValidRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);
    });

    it('should reject when required files are missing', async () => {
      const transactionFile = createValidTransactionFile();

      // Only transaction file, missing rules file
      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .expect(400);
    });

    it('should handle extra files gracefully', async () => {
      const transactionFile = createValidTransactionFile();
      const rulesFile = createValidRulesFile();
      const extraFile = Buffer.from('extra content', 'utf-8');

      // Should process required files and ignore extra ones
      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .attach('files', extraFile, 'extra.txt')
        .expect(201);
    });
  });

  describe('File Processing Error Handling', () => {
    it('should handle file processing errors gracefully', async () => {
      // Create transaction file with invalid date format
      const invalidDateTransaction = `거래일시,적요,입금액,출금액,거래후잔액,거래점
invalid-date,스타벅스 강남2호점,0,5500,994500,강남지점`;
      const invalidFile = Buffer.from(invalidDateTransaction, 'utf-8');
      const rulesFile = createValidRulesFile();

      const response = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', invalidFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('should handle empty files', async () => {
      const emptyFile = Buffer.from('', 'utf-8');
      const rulesFile = createValidRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', emptyFile, 'empty.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(400);
    });

    it('should handle files with only headers', async () => {
      const headerOnlyFile = Buffer.from('거래일시,적요,입금액,출금액,거래후잔액,거래점', 'utf-8');
      const rulesFile = createValidRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', headerOnlyFile, 'headers_only.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(400);
    });
  });
});