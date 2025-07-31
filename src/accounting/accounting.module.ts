import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionParserService } from './services/transaction-parser.service';
import { TransactionClassificationService } from './services/transaction-classification.service';
import { EncryptionModule } from '../encryption/encryption.module';
import { RuleModule } from '../rule/rule.module';
import { FileModule } from '../file/file.module';
import { AccountingController } from './accounting.controller';
import { RuleEngineService } from '../rule/rule-engine.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    EncryptionModule,
    RuleModule,
    FileModule,
  ],
  providers: [
    TransactionParserService,
    TransactionClassificationService,
    RuleEngineService,
  ],
  exports: [TransactionParserService, TransactionClassificationService],
  controllers: [AccountingController],
})
export class AccountingModule {}
