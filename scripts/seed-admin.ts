import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DatabaseSeederService } from '../src/database/database-seeder.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const seederService = app.get(DatabaseSeederService);
    await seederService.runAdminSeeder();
    console.log('Admin seeder completed successfully');
  } catch (error) {
    console.error('Failed to run admin seeder:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();