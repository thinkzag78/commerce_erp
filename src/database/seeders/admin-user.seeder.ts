import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserType } from '../../auth/entities/user.entity';
import { Company } from '../../auth/entities/company.entity';

export class AdminUserSeeder {
  constructor(
    private dataSource: DataSource,
    private configService?: ConfigService,
  ) {}

  async run(): Promise<void> {
    const userRepository = this.dataSource.getRepository(User);
    const companyRepository = this.dataSource.getRepository(Company);

    // 환경변수에서 관리자 계정 정보 가져오기
    const adminUsername =
      this.configService?.get('ADMIN_USERNAME') ||
      process.env.ADMIN_USERNAME ||
      'admin';
    const adminPassword =
      this.configService?.get('ADMIN_PASSWORD') ||
      process.env.ADMIN_PASSWORD ||
      'admin123!';
    const adminCompanyId =
      this.configService?.get('ADMIN_COMPANY_ID') ||
      process.env.ADMIN_COMPANY_ID ||
      'admin_company';
    const adminCompanyName =
      this.configService?.get('ADMIN_COMPANY_NAME') ||
      process.env.ADMIN_COMPANY_NAME ||
      'Admin Company';

    // 환경변수 검증
    if (!adminUsername || !adminPassword) {
      console.error(
        'ADMIN_USERNAME and ADMIN_PASSWORD must be set in environment variables',
      );
      throw new Error(
        'Missing required admin credentials in environment variables',
      );
    }

    // 비밀번호 강도 검증
    if (adminPassword.length < 8) {
      console.error('Admin password must be at least 8 characters long');
      throw new Error('Admin password does not meet minimum requirements');
    }

    // 기존 admin 계정이 있는지 확인
    const existingAdmin = await userRepository.findOne({
      where: { username: adminUsername },
    });

    if (existingAdmin) {
      console.log(
        `Admin user '${adminUsername}' already exists, skipping seeder`,
      );
      return;
    }

    // 기본 회사 생성 (admin용)
    let adminCompany = await companyRepository.findOne({
      where: { company_id: adminCompanyId },
    });

    if (!adminCompany) {
      adminCompany = companyRepository.create({
        company_id: adminCompanyId,
        company_name: adminCompanyName,
      });
      await companyRepository.save(adminCompany);
      console.log(
        `Admin company '${adminCompanyName}' created with ID: ${adminCompanyId}`,
      );
    }

    // Admin 계정 생성
    const saltRounds = 12; // 보안 강화를 위해 salt rounds 증가
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    const adminUser = userRepository.create({
      username: adminUsername,
      password_hash: hashedPassword,
      user_type: UserType.ADMIN,
      company_id: adminCompany.company_id,
    });

    await userRepository.save(adminUser);
    console.log('Admin user created successfully');
    console.log(`Username: ${adminUsername}`);
    console.log('Password: [HIDDEN FOR SECURITY]');
    console.log('Company ID:', adminCompanyId);
    console.log('Please change the password after first login');

    // 개발 환경에서만 비밀번호 힌트 표시
    const nodeEnv = this.configService?.get('NODE_ENV') || process.env.NODE_ENV;
    if (nodeEnv === 'development') {
      console.log(
        `Development mode - Password hint: ${adminPassword.substring(0, 3)}***`,
      );
    }
  }
}
