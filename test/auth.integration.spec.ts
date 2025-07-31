import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User, UserType } from '../src/auth/entities/user.entity';
import { Company } from '../src/auth/entities/company.entity';
import { AuthService } from '../src/auth/auth.service';

describe('Auth Integration Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let authService: AuthService;

  // Test data
  const testCompany = {
    company_id: 'test_company_1',
    company_name: 'Test Company 1',
  };

  const testAdmin = {
    username: 'admin_test',
    password: 'admin123!',
    userType: UserType.ADMIN,
  };

  const testBusinessOwner = {
    username: 'business_test',
    password: 'business123!',
    userType: UserType.BUSINESS_OWNER,
    companyId: testCompany.company_id,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    authService = moduleFixture.get<AuthService>(AuthService);

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  async function setupTestData() {
    // Create test company
    const companyRepository = dataSource.getRepository(Company);
    await companyRepository.save(testCompany);

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

  async function cleanupTestData() {
    const userRepository = dataSource.getRepository(User);
    const companyRepository = dataSource.getRepository(Company);

    await userRepository.delete({ username: testAdmin.username });
    await userRepository.delete({ username: testBusinessOwner.username });
    await companyRepository.delete({ company_id: testCompany.company_id });
  }

  describe('POST /api/v1/auth/login', () => {
    it('should login admin user successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testAdmin.username,
          password: testAdmin.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.userType).toBe(UserType.ADMIN);
      expect(response.body.user.username).toBe(testAdmin.username);
    });

    it('should login business owner successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testBusinessOwner.username,
          password: testBusinessOwner.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.userType).toBe(UserType.BUSINESS_OWNER);
      expect(response.body.user.companyId).toBe(testBusinessOwner.companyId);
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testAdmin.username,
          password: 'wrong_password',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('인증에 실패했습니다');
    });

    it('should reject non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: 'non_existent_user',
          password: 'any_password',
        })
        .expect(401);
    });

    it('should validate request body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: '',
          password: '',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/auth/profile', () => {
    let adminToken: string;
    let businessToken: string;

    beforeAll(async () => {
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
    });

    it('should return admin profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.user.username).toBe(testAdmin.username);
      expect(response.body.user.user_type).toBe(UserType.ADMIN);
    });

    it('should return business owner profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${businessToken}`)
        .expect(200);

      expect(response.body.user.username).toBe(testBusinessOwner.username);
      expect(response.body.user.user_type).toBe(UserType.BUSINESS_OWNER);
      expect(response.body.user.company_id).toBe(testBusinessOwner.companyId);
    });

    it('should reject request without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .expect(401);
    });

    it('should reject request with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/profile')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/verify', () => {
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

    it('should verify valid token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.user).toBeDefined();
    });

    it('should reject invalid token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);
    });
  });

  describe('Role-based Access Control', () => {
    let adminToken: string;
    let businessToken: string;

    beforeAll(async () => {
      // Get tokens
      const adminResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testAdmin.username,
          password: testAdmin.password,
        });
      adminToken = adminResponse.body.access_token;

      const businessResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testBusinessOwner.username,
          password: testBusinessOwner.password,
        });
      businessToken = businessResponse.body.access_token;
    });

    describe('POST /api/v1/auth/users (Admin only)', () => {
      it('should allow admin to create users', async () => {
        const newUser = {
          username: 'new_test_user',
          password: 'password123!',
          userType: UserType.BUSINESS_OWNER,
          companyId: testCompany.company_id,
        };

        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(newUser)
          .expect(201);

        expect(response.body.message).toContain('성공적으로 생성');
        expect(response.body.user.username).toBe(newUser.username);

        // Cleanup
        const userRepository = dataSource.getRepository(User);
        await userRepository.delete({ username: newUser.username });
      });

      it('should reject business owner from creating users', async () => {
        const newUser = {
          username: 'unauthorized_user',
          password: 'password123!',
          userType: UserType.BUSINESS_OWNER,
        };

        await request(app.getHttpServer())
          .post('/api/v1/auth/users')
          .set('Authorization', `Bearer ${businessToken}`)
          .send(newUser)
          .expect(403);
      });
    });

    describe('GET /api/v1/auth/users (Admin only)', () => {
      it('should allow admin to get all users', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/auth/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.users).toBeInstanceOf(Array);
        expect(response.body.users.length).toBeGreaterThan(0);
      });

      it('should reject business owner from getting all users', async () => {
        await request(app.getHttpServer())
          .get('/api/v1/auth/users')
          .set('Authorization', `Bearer ${businessToken}`)
          .expect(403);
      });
    });
  });
});