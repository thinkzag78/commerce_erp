import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { FileUploadService } from './file-upload.service';
import { FileValidationService } from './file-validation.service';
import { FileController } from './file.controller';
import { FileUploadLog } from './entities/file-upload-log.entity';
import { LoggerModule } from '../common/logger/logger.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FileUploadLog]),
    ConfigModule,
    LoggerModule,
  ],
  controllers: [FileController],
  providers: [FileUploadService, FileValidationService],
  exports: [FileUploadService, FileValidationService],
})
export class FileModule {}
