import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { DataSource } from 'typeorm';
import { User, UserType } from '../src/auth/entities/user.entity';
import { Company } from '../src/auth/entities/company.entity';
import { Category } from '../src/rule/entities/category.entity';
import { Transaction } from '../src/accounting/entities/transaction.entity';
import { AuthService } from '../src/auth/auth.service';

describe('Automatic Accounting Processor E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let authService: AuthService;

  // Test data
  const testCompany1 = {
    company_id: 'e2e_company_1',
    company_name: 'E2E Test Company 1',
  };

  const testCompany2 = {
    company_id: 'e2e_company_2',
    company_name: 'E2E Test Company 2',
  };

  const testAdmin = {
    username: 'e2e_admin',
    password: 'admin123!',
    userType: UserType.ADMIN,
  };

  const testBusinessOwner1 = {
    username: 'e2e_business1',
    password: 'business123!',
    userType: UserType.BUSINESS_OWNER,
    companyId: testCompany1.company_id,
  };

  const testBusinessOwner2 = {
    username: 'e2e_business2',
    password: 'business123!',
    userType: UserType.BUSINESS_OWNER,
    companyId: testCompany2.company_id,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    authService = moduleFixture.get<AuthService>(AuthService);

    // Clean up any existing test data first
    await cleanupTestData();
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  async function setupTestData() {
    // Create test companies
    const companyRepository = dataSource.getRepository(Company);
    await companyRepository.save([testCompany1, testCompany2]);

    // Create test users
    await authService.createUser(
      testAdmin.username,
      testAdmin.password,
      testAdmin.userType,
    );

    await authService.createUser(
      testBusinessOwner1.username,
      testBusinessOwner1.password,
      testBusinessOwner1.userType,
      testBusinessOwner1.companyId,
    );

    await authService.createUser(
      testBusinessOwner2.username,
      testBusinessOwner2.password,
      testBusinessOwner2.userType,
      testBusinessOwner2.companyId,
    );
  }

  async function cleanupTestData() {
    try {
      const userRepository = dataSource.getRepository(User);
      const companyRepository = dataSource.getRepository(Company);
      const categoryRepository = dataSource.getRepository(Category);
      const transactionRepository = dataSource.getRepository(Transaction);

      // Delete in proper order to avoid foreign key constraints
      await transactionRepository
        .createQueryBuilder()
        .delete()
        .where('company_id IN (:...companyIds) OR company_id IS NULL', {
          companyIds: [testCompany1.company_id, testCompany2.company_id],
        })
        .execute();

      await categoryRepository
        .createQueryBuilder()
        .delete()
        .where('company_id IN (:...companyIds)', {
          companyIds: [testCompany1.company_id, testCompany2.company_id],
        })
        .execute();

      // Delete users
      const usernames = [
        testAdmin.username,
        testBusinessOwner1.username,
        testBusinessOwner2.username,
      ];
      for (const username of usernames) {
        await userRepository
          .createQueryBuilder()
          .delete()
          .where('username = :username', { username })
          .execute();
      }

      // Delete companies
      const companyIds = [testCompany1.company_id, testCompany2.company_id];
      for (const companyId of companyIds) {
        await companyRepository
          .createQueryBuilder()
          .delete()
          .where('company_id = :companyId', { companyId })
          .execute();
      }
    } catch (error) {
      console.warn('Cleanup error (may be expected):', error.message);
    }
  }

  function createTransactionFile(companyId: string): Buffer {
    const content = `거래일시,적요,입금액,출금액,거래후잔액,거래점
2025-07-20 09:00:00,스타벅스 강남점,0,4500,995500,강남지점
2025-07-20 10:30:00,급여입금,3000000,0,3995500,본점
2025-07-20 11:15:00,사무용품 구매,0,25000,3970500,강남지점
2025-07-20 12:00:00,점심식사,0,12000,3958500,강남지점
2025-07-20 14:30:00,카페베네 음료,0,3800,3954700,강남지점
2025-07-20 16:00:00,택시비,0,8500,3946200,강남지점`;
    return Buffer.from(content, 'utf-8');
  }

  function createRulesFile(companyId: string): Buffer {
    const rules = {
      companies: [
        {
          company_id: companyId,
          company_name: `Test Company ${companyId}`,
          categories: [
            {
              category_id: `${companyId}_coffee`,
              category_name: '카페비',
              keywords: ['스타벅스', '카페베네', '카페'],
              exclude_keywords: ['환불'],
              amount_range: { min: 1000, max: 10000 },
              transaction_type: 'WITHDRAWAL',
              priority: 1,
            },
            {
              category_id: `${companyId}_office`,
              category_name: '사무용품비',
              keywords: ['사무용품', '문구'],
              exclude_keywords: [],
              amount_range: { min: 5000, max: 100000 },
              transaction_type: 'WITHDRAWAL',
              priority: 2,
            },
            {
              category_id: `${companyId}_meal`,
              category_name: '식비',
              keywords: ['식사', '점심', '저녁'],
              exclude_keywords: [],
              amount_range: { min: 5000, max: 50000 },
              transaction_type: 'WITHDRAWAL',
              priority: 3,
            },
            {
              category_id: `${companyId}_transport`,
              category_name: '교통비',
              keywords: ['택시', '버스', '지하철'],
              exclude_keywords: [],
              amount_range: { min: 1000, max: 50000 },
              transaction_type: 'WITHDRAWAL',
              priority: 4,
            },
            {
              category_id: `${companyId}_salary`,
              category_name: '급여',
              keywords: ['급여', '월급', '보너스'],
              exclude_keywords: [],
              amount_range: { min: 1000000, max: 10000000 },
              transaction_type: 'DEPOSIT',
              priority: 1,
            },
          ],
        },
      ],
    };
    return Buffer.from(JSON.stringify(rules, null, 2), 'utf-8');
  }

  describe('Complete Workflow: File Upload → Classification → Retrieval', () => {
    let adminToken: string;
    let business1Token: string;
    let business2Token: string;

    beforeAll(async () => {
      // Get authentication tokens
      const adminResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testAdmin.username,
          password: testAdmin.password,
        })
        .expect(200);

      console.log('Admin login response:', adminResponse.body);
      adminToken = adminResponse.body.access_token;

      if (!adminToken) {
        throw new Error('Failed to get admin token');
      }

      const business1Response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testBusinessOwner1.username,
          password: testBusinessOwner1.password,
        })
        .expect(200);
      business1Token = business1Response.body.access_token;

      const business2Response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testBusinessOwner2.username,
          password: testBusinessOwner2.password,
        })
        .expect(200);
      business2Token = business2Response.body.access_token;
    });

    it('should complete full workflow for admin user', async () => {
      // Step 1: Upload and process files
      const transactionFile = createTransactionFile(testCompany1.company_id);
      const rulesFile = createRulesFile(testCompany1.company_id);

      const processResponse = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.csv')
        .attach('files', rulesFile, 'rules.json');

      console.log('Process response status:', processResponse.status);
      console.log('Process response body:', processResponse.body);

      expect(processResponse.status).toBe(201);

      // Verify processing results
      expect(processResponse.body.success).toBe(true);
      expect(processResponse.body.processed_count).toBe(6);
      expect(processResponse.body.classified_count).toBeGreaterThan(0);
      expect(processResponse.body.unclassified_count).toBeGreaterThanOrEqual(0);

      // Step 2: Retrieve and verify classified transactions
      const recordsResponse = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany1.company_id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(recordsResponse.body.transactions).toHaveLength(6);
      expect(recordsResponse.body.pagination.total).toBe(6);
      expect(recordsResponse.body.stats).toBeDefined();

      // Step 3: Verify specific classifications
      const transactions = recordsResponse.body.transactions;

      // Check coffee transaction classification
      const coffeeTransaction = transactions.find((t: any) =>
        t.description.includes('스타벅스'),
      );
      expect(coffeeTransaction).toBeDefined();
      expect(coffeeTransaction.company_id).not.toBeNull();
      expect(coffeeTransaction.category_name).toBe('카페비');

      // Check salary transaction classification
      const salaryTransaction = transactions.find((t: any) =>
        t.description.includes('급여입금'),
      );
      expect(salaryTransaction).toBeDefined();
      expect(salaryTransaction.company_id).not.toBeNull();
      expect(salaryTransaction.category_name).toBe('급여');

      // Step 4: Test filtering by classification status
      const unclassifiedResponse = await request(app.getHttpServer())
        .get(
          `/api/v1/accounting/records?companyId=${testCompany1.company_id}&status=unclassified`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      unclassifiedResponse.body.transactions.forEach((transaction: any) => {
        expect(transaction.company_id).toBeNull();
      });
    });

    it('should complete full workflow for business owner (own company)', async () => {
      // Step 1: Process transactions for business owner's company
      const transactionFile = createTransactionFile(testCompany1.company_id);
      const rulesFile = createRulesFile(testCompany1.company_id);

      const processResponse = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${business1Token}`)
        .attach('files', transactionFile, 'transactions.csv')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);

      expect(processResponse.body.success).toBe(true);

      // Step 2: Retrieve own company's data
      const recordsResponse = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany1.company_id}`)
        .set('Authorization', `Bearer ${business1Token}`)
        .expect(200);

      expect(recordsResponse.body.transactions).toBeInstanceOf(Array);
      expect(recordsResponse.body.pagination).toBeDefined();

      // Step 3: Verify data belongs to correct company
      recordsResponse.body.transactions.forEach((transaction: any) => {
        expect(transaction.company_id).toBe(testCompany1.company_id);
      });
    });

    it('should handle multiple companies independently', async () => {
      // Process transactions for both companies
      const company1TransactionFile = createTransactionFile(
        testCompany1.company_id,
      );
      const company1RulesFile = createRulesFile(testCompany1.company_id);
      const company2TransactionFile = createTransactionFile(
        testCompany2.company_id,
      );
      const company2RulesFile = createRulesFile(testCompany2.company_id);

      // Process for company 1
      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', company1TransactionFile, 'transactions.csv')
        .attach('files', company1RulesFile, 'rules.json')
        .expect(201);

      // Process for company 2
      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', company2TransactionFile, 'transactions.csv')
        .attach('files', company2RulesFile, 'rules.json')
        .expect(201);

      // Verify company 1 data
      const company1Response = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany1.company_id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify company 2 data
      const company2Response = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany2.company_id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Ensure data separation
      company1Response.body.transactions.forEach((transaction: any) => {
        expect(transaction.company_id).toBe(testCompany1.company_id);
      });

      company2Response.body.transactions.forEach((transaction: any) => {
        expect(transaction.company_id).toBe(testCompany2.company_id);
      });
    });

    it('should handle pagination correctly in full workflow', async () => {
      // Process transactions
      const transactionFile = createTransactionFile(testCompany1.company_id);
      const rulesFile = createRulesFile(testCompany1.company_id);

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.csv')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);

      // Test pagination
      const page1Response = await request(app.getHttpServer())
        .get(
          `/api/v1/accounting/records?companyId=${testCompany1.company_id}&page=1&limit=3`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(page1Response.body.transactions).toHaveLength(3);
      expect(page1Response.body.pagination.page).toBe(1);
      expect(page1Response.body.pagination.limit).toBe(3);
      expect(page1Response.body.stats).toBeDefined(); // Stats only on first page

      const page2Response = await request(app.getHttpServer())
        .get(
          `/api/v1/accounting/records?companyId=${testCompany1.company_id}&page=2&limit=3`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(page2Response.body.transactions).toHaveLength(3);
      expect(page2Response.body.pagination.page).toBe(2);
      expect(page2Response.body.stats).toBeUndefined(); // No stats on subsequent pages
    });
  });

  describe('Access Control and Security E2E Tests', () => {
    let adminToken: string;
    let business1Token: string;
    let business2Token: string;

    beforeAll(async () => {
      // Get authentication tokens
      const adminResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testAdmin.username,
          password: testAdmin.password,
        });
      adminToken = adminResponse.body.access_token;

      const business1Response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testBusinessOwner1.username,
          password: testBusinessOwner1.password,
        });
      business1Token = business1Response.body.access_token;

      const business2Response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testBusinessOwner2.username,
          password: testBusinessOwner2.password,
        });
      business2Token = business2Response.body.access_token;
    });

    it('should enforce company-level access control', async () => {
      // Business owner 1 tries to access company 2 data
      await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany2.company_id}`)
        .set('Authorization', `Bearer ${business1Token}`)
        .expect(400);

      // Business owner 2 tries to access company 1 data
      await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany1.company_id}`)
        .set('Authorization', `Bearer ${business2Token}`)
        .expect(400);

      // Admin can access both companies
      await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany1.company_id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany2.company_id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should enforce authentication on all endpoints', async () => {
      // Test without token
      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .expect(401);

      await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany1.company_id}`)
        .expect(401);

      await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .expect(401);

      // Test with invalid token
      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany1.company_id}`)
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);
    });

    it('should enforce role-based access control', async () => {
      // Business owners cannot create users
      await request(app.getHttpServer())
        .post('/api/v1/auth/users')
        .set('Authorization', `Bearer ${business1Token}`)
        .send({
          username: 'new_user',
          password: 'password123!',
          userType: UserType.BUSINESS_OWNER,
        })
        .expect(403);

      // Business owners cannot list all users
      await request(app.getHttpServer())
        .get('/api/v1/auth/users')
        .set('Authorization', `Bearer ${business1Token}`)
        .expect(403);

      // Admin can create users and list users
      await request(app.getHttpServer())
        .post('/api/v1/auth/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'test_new_user',
          password: 'password123!',
          userType: UserType.BUSINESS_OWNER,
          companyId: testCompany1.company_id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .get('/api/v1/auth/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Cleanup
      const userRepository = dataSource.getRepository(User);
      await userRepository.delete({ username: 'test_new_user' });
    });
  });

  describe('Error Scenarios E2E Tests', () => {
    let adminToken: string;

    beforeAll(async () => {
      const adminResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testAdmin.username,
          password: testAdmin.password,
        });
      adminToken = adminResponse.body.access_token;
    });

    it('should handle invalid file formats gracefully', async () => {
      const invalidTransactionFile = Buffer.from(
        'invalid,format,data',
        'utf-8',
      );
      const validRulesFile = createRulesFile(testCompany1.company_id);

      const response = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', invalidTransactionFile, 'transactions.csv')
        .attach('files', validRulesFile, 'rules.json')
        .expect(400);

      expect(response.body.message).toBeDefined();
      expect(response.body.statusCode).toBe(400);
    });

    it('should handle malformed JSON rules file', async () => {
      const validTransactionFile = createTransactionFile(
        testCompany1.company_id,
      );
      const invalidRulesFile = Buffer.from('invalid json content', 'utf-8');

      const response = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', validTransactionFile, 'transactions.csv')
        .attach('files', invalidRulesFile, 'rules.json')
        .expect(400);

      expect(response.body.message).toBeDefined();
      expect(response.body.statusCode).toBe(400);
    });

    it('should handle missing required parameters', async () => {
      // Missing companyId parameter
      const response = await request(app.getHttpServer())
        .get('/api/v1/accounting/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.message).toContain(
        'companyId 파라미터가 필요합니다',
      );
    });

    it('should handle invalid pagination parameters', async () => {
      // Invalid page number
      await request(app.getHttpServer())
        .get(
          `/api/v1/accounting/records?companyId=${testCompany1.company_id}&page=0`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      // Invalid limit
      await request(app.getHttpServer())
        .get(
          `/api/v1/accounting/records?companyId=${testCompany1.company_id}&limit=101`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('should handle non-existent company gracefully', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/accounting/records?companyId=non_existent_company')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.transactions).toHaveLength(0);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should handle file upload without files', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.message).toContain('업로드된 파일이 없습니다');
    });

    it('should handle partial file uploads', async () => {
      const transactionFile = createTransactionFile(testCompany1.company_id);

      // Only transaction file, missing rules file
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.csv')
        .expect(400);

      expect(response.body.message).toContain('규칙 파일(.json)이 필요합니다');
    });
  });

  describe('Data Integrity and Encryption E2E Tests', () => {
    let adminToken: string;

    beforeAll(async () => {
      const adminResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testAdmin.username,
          password: testAdmin.password,
        });
      adminToken = adminResponse.body.access_token;
    });

    it('should encrypt and decrypt sensitive data correctly', async () => {
      const transactionFile = createTransactionFile(testCompany1.company_id);
      const rulesFile = createRulesFile(testCompany1.company_id);

      // Process transactions
      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.csv')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);

      // Retrieve and verify decryption
      const response = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany1.company_id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const transactions = response.body.transactions;
      expect(transactions.length).toBeGreaterThan(0);

      // Verify that sensitive data is properly decrypted
      transactions.forEach((transaction: any) => {
        expect(transaction.description).toBeDefined();
        expect(transaction.branch).toBeDefined();
        expect(transaction.description).not.toContain('[복호화 실패]');
        expect(transaction.branch).not.toContain('[복호화 실패]');

        // Verify that the data makes sense (not encrypted gibberish)
        expect(typeof transaction.description).toBe('string');
        expect(typeof transaction.branch).toBe('string');
      });

      // Verify that data in database is actually encrypted
      const transactionRepository = dataSource.getRepository(Transaction);
      const rawTransactions = await transactionRepository.find({
        where: { company_id: testCompany1.company_id },
      });

      rawTransactions.forEach((transaction) => {
        // Raw data should be encrypted (different from decrypted data)
        expect(transaction.description_encrypted).toBeDefined();
        expect(transaction.branch_encrypted).toBeDefined();

        // Find corresponding decrypted transaction
        const decryptedTransaction = transactions.find(
          (t: any) => t.transaction_id === transaction.transaction_id,
        );

        if (decryptedTransaction) {
          // Encrypted data should be different from decrypted data
          expect(transaction.description_encrypted).not.toBe(
            decryptedTransaction.description,
          );
          expect(transaction.branch_encrypted).not.toBe(
            decryptedTransaction.branch,
          );
        }
      });
    });

    it('should maintain data consistency across operations', async () => {
      const transactionFile = createTransactionFile(testCompany1.company_id);
      const rulesFile = createRulesFile(testCompany1.company_id);

      // Process transactions
      const processResponse = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.csv')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);

      const processedCount = processResponse.body.processed_count;

      // Retrieve all transactions
      const allTransactionsResponse = await request(app.getHttpServer())
        .get(
          `/api/v1/accounting/records?companyId=${testCompany1.company_id}&limit=100`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify count consistency
      expect(allTransactionsResponse.body.pagination.total).toBe(
        processedCount,
      );

      // Retrieve classified transactions
      const classifiedResponse = await request(app.getHttpServer())
        .get(
          `/api/v1/accounting/records?companyId=${testCompany1.company_id}&status=classified&limit=100`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Retrieve unclassified transactions
      const unclassifiedResponse = await request(app.getHttpServer())
        .get(
          `/api/v1/accounting/records?companyId=${testCompany1.company_id}&status=unclassified&limit=100`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify that classified + unclassified = total
      const classifiedCount = classifiedResponse.body.transactions.length;
      const unclassifiedCount = unclassifiedResponse.body.transactions.length;

      expect(classifiedCount + unclassifiedCount).toBe(processedCount);

      // Verify statistics consistency
      if (allTransactionsResponse.body.stats) {
        expect(allTransactionsResponse.body.stats.totalTransactions).toBe(
          processedCount,
        );
        expect(allTransactionsResponse.body.stats.classifiedCount).toBe(
          classifiedCount,
        );
        expect(allTransactionsResponse.body.stats.unclassifiedCount).toBe(
          unclassifiedCount,
        );
      }
    });
  });

  it('should handle basic app endpoint', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
