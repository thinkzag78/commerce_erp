import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { ClassificationRule } from './entities/classification-rule.entity';
import { RuleKeyword } from './entities/rule-keyword.entity';
import { Company } from '../auth/entities/company.entity';
import { RuleDataService } from './rule-data.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Category,
      ClassificationRule,
      RuleKeyword,
      Company,
    ]),
  ],
  providers: [RuleDataService],
  exports: [RuleDataService],
})
export class RuleModule {}
