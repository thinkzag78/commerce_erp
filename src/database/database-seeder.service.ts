import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AdminUserSeeder } from './seeders/admin-user.seeder';

@Injectable()
export class DatabaseSeederService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseSeederService.name);

  constructor(
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    // 개발 환경이거나 ENABLE_SEEDER가 true로 설정된 경우 seeder 실행
    const nodeEnv = this.configService.get('NODE_ENV');
    const enableSeeder = this.configService.get('ENABLE_SEEDER', 'false');

    if (nodeEnv === 'development' || enableSeeder === 'true') {
      await this.runSeeders();
    }
  }

  async runSeeders(): Promise<void> {
    try {
      this.logger.log('Running database seeders...');

      const adminUserSeeder = new AdminUserSeeder(this.dataSource);
      await adminUserSeeder.run();

      this.logger.log('Database seeders completed successfully');
    } catch (error) {
      this.logger.error('Failed to run database seeders', error);
    }
  }

  // 수동으로 seeder를 실행할 수 있는 메서드
  async runAdminSeeder(): Promise<void> {
    try {
      this.logger.log('Running admin user seeder...');

      const adminUserSeeder = new AdminUserSeeder(this.dataSource);
      await adminUserSeeder.run();

      this.logger.log('Admin user seeder completed successfully');
    } catch (error) {
      this.logger.error('Failed to run admin user seeder', error);
      throw error;
    }
  }
}
