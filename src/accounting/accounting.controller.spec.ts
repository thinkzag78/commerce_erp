import { Test, TestingModule } from '@nestjs/testing';
import { AccountingController } from './accounting.controller';
import { TransactionClassificationService } from './services/transaction-classification.service';
import { TransactionParserService } from './services/transaction-parser.service';
import { FileUploadService } from '../file/file-upload.service';
import { RuleDataService } from '../rule/rule-data.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AppLoggerService } from '../common/logger/app-logger.service';

describe('AccountingController', () => {
  let controller: AccountingController;

  const mockTransactionClassificationService = {
    classifyAndSaveTransactions: jest.fn(),
    getTransactionsByCompany: jest.fn(),
    getUnclassifiedTransactions: jest.fn(),
    getClassificationStats: jest.fn(),
    reclassifyUnclassifiedTransactions: jest.fn(),
  };

  const mockTransactionParserService = {
    parseTransactionFile: jest.fn(),
  };

  const mockFileUploadService = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
  };

  const mockRuleDataService = {
    getRulesByCompany: jest.fn(),
    createRule: jest.fn(),
    updateRule: jest.fn(),
    deleteRule: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  };

  const mockAppLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingController],
      providers: [
        {
          provide: TransactionClassificationService,
          useValue: mockTransactionClassificationService,
        },
        {
          provide: TransactionParserService,
          useValue: mockTransactionParserService,
        },
        {
          provide: FileUploadService,
          useValue: mockFileUploadService,
        },
        {
          provide: RuleDataService,
          useValue: mockRuleDataService,
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
        {
          provide: AppLoggerService,
          useValue: mockAppLoggerService,
        },
      ],
    }).compile();

    controller = module.get<AccountingController>(AccountingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
