import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseSeederService } from './database-seeder.service';
import { User } from '../auth/entities/user.entity';
import { Company } from '../auth/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Company])],
  providers: [DatabaseSeederService],
  exports: [DatabaseSeederService],
})
export class DatabaseModule {}
