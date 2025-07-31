import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

describe('Database Connection', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: '.env',
        }),
        TypeOrmModule.forRoot({
          type: 'mysql',
          host: process.env.DATABASE_HOST || 'localhost',
          port: parseInt(process.env.DATABASE_PORT) || 3306,
          username: process.env.DATABASE_USERNAME || 'root',
          password: process.env.DATABASE_PASSWORD || '',
          database: process.env.DATABASE_NAME || 'test',
          entities: [],
          synchronize: true,
          logging: false,
        }),
      ],
    }).compile();

    dataSource = module.get<DataSource>(DataSource);
  });

  it('should connect to database', async () => {
    expect(dataSource).toBeDefined();
    expect(dataSource.isInitialized).toBe(true);
  });

  it('should execute simple query', async () => {
    const result = await dataSource.query('SELECT 1 as test');
    expect(result).toEqual([{ test: 1 }]);
  });

  afterEach(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });
});