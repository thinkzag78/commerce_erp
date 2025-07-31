import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User, UserType } from '../src/auth/entities/user.entity';
import { Company } from '../src/auth/entities/company.entity';
import { Category } from '../src/rule/entities/category.entity';
import { Transaction } from '../src/accounting/entities/transaction.entity';
import { AuthService } from '../src/auth/auth.service';
import * as path from 'path';
import * as fs from 'fs';

describe('Accounting Integration Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let authService: AuthService;
  let adminToken: string;
  let businessToken: string;

  // Test data
  const testCompany = {
    company_id: 'test_company_acc',
    company_name: 'Test Accounting Company',
  };

  const testAdmin = {
    username: 'admin_acc_test',
    password: 'admin123!',
    userType: UserType.ADMIN,
  };

  const testBusinessOwner = {
    username: 'business_acc_test',
    password: 'business123!',
    userType: UserType.BUSINESS_OWNER,
    companyId: testCompany.company_id,
  };

  const testCategory = {
    category_id: 'cat_test_001',
    company_id: testCompany.company_id,
    category_name: '테스트 카테고리',
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
    await getAuthTokens();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  async function setupTestData() {
    // Create test company
    const companyRepository = dataSource.getRepository(Company);
    await companyRepository.save(testCompany);

    // Create test category
    const categoryRepository = dataSource.getRepository(Category);
    await categoryRepository.save(testCategory);

    // Create test users
    await authService.createUser(
      testAdmin.username,
      testAdmin.password,
      testAdmin.userType,
    );

    await authService.createUser(
      testBusinessOwner.username,
      testBusinessOwner.password,
      testBusinessOwner.userType,
      testBusinessOwner.companyId,
    );
  }

  async function getAuthTokens() {
    // Get admin token
    const adminResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        username: testAdmin.username,
        password: testAdmin.password,
      });
    adminToken = adminResponse.body.access_token;

    // Get business owner token
    const businessResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        username: testBusinessOwner.username,
        password: testBusinessOwner.password,
      });
    businessToken = businessResponse.body.access_token;
  }

  async function cleanupTestData() {
    const userRepository = dataSource.getRepository(User);
    const companyRepository = dataSource.getRepository(Company);
    const categoryRepository = dataSource.getRepository(Category);
    const transactionRepository = dataSource.getRepository(Transaction);

    await transactionRepository.delete({ company_id: testCompany.company_id });
    await categoryRepository.delete({ company_id: testCompany.company_id });
    await userRepository.delete({ username: testAdmin.username });
    await userRepository.delete({ username: testBusinessOwner.username });
    await companyRepository.delete({ company_id: testCompany.company_id });
  }

  function createTestTransactionFile(): Buffer {
    const content = `거래일시,적요,입금액,출금액,거래후잔액,거래점
2025-07-20 13:45:11,스타벅스 강남2호점,0,5500,994500,강남지점
2025-07-20 14:30:22,급여입금,3000000,0,3994500,본점
2025-07-20 15:15:33,사무용품 구매,0,25000,3969500,강남지점`;
    return Buffer.from(content, 'utf-8');
  }

  function createTestRulesFile(): Buffer {
    const rules = {
      companies: [
        {
          company_id: testCompany.company_id,
          categories: [
            {
              category_id: testCategory.category_id,
              category_name: testCategory.category_name,
              keywords: ['스타벅스', '카페'],
              exclude_keywords: ['환불'],
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

  describe('POST /api/v1/accounting/process', () => {
    it('should process transaction files successfully (Admin)', async () => {
      const transactionFile = createTestTransactionFile();
      const rulesFile = createTestRulesFile();

      const response = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.processed_count).toBeGreaterThan(0);
      expect(response.body.classified_count).toBeGreaterThanOrEqual(0);
      expect(response.body.unclassified_count).toBeGreaterThanOrEqual(0);
      expect(response.body.message).toContain('성공적으로 완료');
    });

    it('should process transaction files successfully (Business Owner)', async () => {
      const transactionFile = createTestTransactionFile();
      const rulesFile = createTestRulesFile();

      const response = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${businessToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.processed_count).toBeGreaterThan(0);
    });

    it('should reject request without authentication', async () => {
      const transactionFile = createTestTransactionFile();
      const rulesFile = createTestRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(401);
    });

    it('should reject request without files', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('should reject request with missing transaction file', async () => {
      const rulesFile = createTestRulesFile();

      const response = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', rulesFile, 'rules.json')
        .expect(400);

      expect(response.body.message).toContain('거래 내역 파일(.txt)이 필요합니다');
    });

    it('should reject request with missing rules file', async () => {
      const transactionFile = createTestTransactionFile();

      const response = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .expect(400);

      expect(response.body.message).toContain('규칙 파일(.json)이 필요합니다');
    });

    it('should reject invalid file extensions', async () => {
      const invalidFile = Buffer.from('invalid content', 'utf-8');

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', invalidFile, 'invalid.pdf')
        .expect(400);
    });

    it('should reject malformed transaction file', async () => {
      const invalidTransactionFile = Buffer.from('invalid,csv,format', 'utf-8');
      const rulesFile = createTestRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', invalidTransactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(400);
    });

    it('should reject malformed rules file', async () => {
      const transactionFile = createTestTransactionFile();
      const invalidRulesFile = Buffer.from('invalid json', 'utf-8');

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', invalidRulesFile, 'rules.json')
        .expect(400);
    });
  });

  describe('GET /api/v1/accounting/records', () => {
    beforeAll(async () => {
      // Process some test transactions first
      const transactionFile = createTestTransactionFile();
      const rulesFile = createTestRulesFile();

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json');
    });

    it('should get transaction records for admin', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany.company_id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.transactions).toBeInstanceOf(Array);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(0);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(50);
    });

    it('should get transaction records for business owner (own company)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany.company_id}`)
        .set('Authorization', `Bearer ${businessToken}`)
        .expect(200);

      expect(response.body.transactions).toBeInstanceOf(Array);
      expect(response.body.pagination).toBeDefined();
    });

    it('should reject business owner accessing other company data', async () => {
      const otherCompanyId = 'other_company_id';

      const response = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${otherCompanyId}`)
        .set('Authorization', `Bearer ${businessToken}`)
        .expect(400);

      expect(response.body.message).toContain('다른 회사의 데이터에 접근할 수 없습니다');
    });

    it('should reject request without companyId', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/accounting/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.message).toContain('companyId 파라미터가 필요합니다');
    });

    it('should reject request without authentication', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany.company_id}`)
        .expect(401);
    });

    it('should support pagination parameters', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany.company_id}&page=1&limit=10`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });

    it('should validate pagination parameters', async () => {
      // Invalid page number
      await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany.company_id}&page=0`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      // Invalid limit
      await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany.company_id}&limit=101`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('should filter by classification status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany.company_id}&status=unclassified`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.transactions).toBeInstanceOf(Array);
      // All returned transactions should be unclassified (company_id should be null)
      response.body.transactions.forEach((transaction: any) => {
        expect(transaction.company_id).toBeNull();
      });
    });

    it('should include statistics on first page', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany.company_id}&page=1`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.stats).toBeDefined();
      expect(response.body.stats.totalTransactions).toBeGreaterThanOrEqual(0);
      expect(response.body.stats.classifiedCount).toBeGreaterThanOrEqual(0);
      expect(response.body.stats.unclassifiedCount).toBeGreaterThanOrEqual(0);
      expect(response.body.stats.classificationRate).toBeGreaterThanOrEqual(0);
    });

    it('should not include statistics on subsequent pages', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany.company_id}&page=2`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.stats).toBeUndefined();
    });

    it('should decrypt transaction data properly', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany.company_id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      if (response.body.transactions.length > 0) {
        const transaction = response.body.transactions[0];
        expect(transaction.description).toBeDefined();
        expect(transaction.branch).toBeDefined();
        expect(transaction.description).not.toContain('[복호화 실패]');
        expect(transaction.branch).not.toContain('[복호화 실패]');
      }
    });
  });

  describe('Transaction Classification Logic', () => {
    it('should classify transactions based on keywords', async () => {
      // Create rules with specific keywords
      const rulesWithKeywords = {
        companies: [
          {
            company_id: testCompany.company_id,
            categories: [
              {
                category_id: 'cat_coffee',
                category_name: '카페비',
                keywords: ['스타벅스', '카페'],
                exclude_keywords: [],
                amount_range: { min: 1000, max: 50000 },
                transaction_type: 'WITHDRAWAL',
                priority: 1,
              },
            ],
          },
        ],
      };

      const transactionFile = createTestTransactionFile();
      const rulesFile = Buffer.from(JSON.stringify(rulesWithKeywords, null, 2), 'utf-8');

      const processResponse = await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);

      expect(processResponse.body.classified_count).toBeGreaterThan(0);

      // Verify classification
      const recordsResponse = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany.company_id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const classifiedTransactions = recordsResponse.body.transactions.filter(
        (t: any) => t.company_id !== null
      );

      expect(classifiedTransactions.length).toBeGreaterThan(0);
      
      // Check if Starbucks transaction was classified
      const starbucksTransaction = classifiedTransactions.find(
        (t: any) => t.description.includes('스타벅스')
      );
      expect(starbucksTransaction).toBeDefined();
      expect(starbucksTransaction.category_name).toBe('카페비');
    });

    it('should exclude transactions with exclude keywords', async () => {
      const rulesWithExclusion = {
        companies: [
          {
            company_id: testCompany.company_id,
            categories: [
              {
                category_id: 'cat_office',
                category_name: '사무용품비',
                keywords: ['사무용품'],
                exclude_keywords: ['환불'],
                amount_range: { min: 1000, max: 100000 },
                transaction_type: 'WITHDRAWAL',
                priority: 1,
              },
            ],
          },
        ],
      };

      // Create transaction with exclude keyword
      const transactionWithExclusion = `거래일시,적요,입금액,출금액,거래후잔액,거래점
2025-07-20 16:00:00,사무용품 구매,0,30000,3939500,강남지점
2025-07-20 16:30:00,사무용품 환불,15000,0,3954500,강남지점`;

      const transactionFile = Buffer.from(transactionWithExclusion, 'utf-8');
      const rulesFile = Buffer.from(JSON.stringify(rulesWithExclusion, null, 2), 'utf-8');

      await request(app.getHttpServer())
        .post('/api/v1/accounting/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('files', transactionFile, 'transactions.txt')
        .attach('files', rulesFile, 'rules.json')
        .expect(201);

      const recordsResponse = await request(app.getHttpServer())
        .get(`/api/v1/accounting/records?companyId=${testCompany.company_id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const transactions = recordsResponse.body.transactions;
      
      // Purchase should be classified (company_id should be set)
      const purchaseTransaction = transactions.find(
        (t: any) => t.description.includes('사무용품 구매')
      );
      expect(purchaseTransaction?.company_id).not.toBeNull();

      // Refund should not be classified due to exclude keyword (company_id should be null)
      const refundTransaction = transactions.find(
        (t: any) => t.description.includes('사무용품 환불')
      );
      expect(refundTransaction?.company_id).toBeNull();
    });
  });
});