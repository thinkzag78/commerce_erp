import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  fileHash?: string;
}

@Injectable()
export class FileValidationService {
  private readonly logger = new Logger(FileValidationService.name);
  private readonly allowedExtensions: string[];
  private readonly maxFileSize: number;

  constructor(private configService: ConfigService) {
    this.allowedExtensions = this.configService
      .get<string>('ALLOWED_FILE_EXTENSIONS', 'txt,json')
      .split(',')
      .map((ext) => ext.trim().toLowerCase());

    this.maxFileSize = parseInt(
      this.configService.get<string>('FILE_UPLOAD_MAX_SIZE', '10485760'),
    ); // 기본값: 10MB
  }

  /**
   * 파일 확장자가 허용된 형식인지 검증합니다.
   * @param file 업로드된 파일
   * @returns 검증 결과
   */
  validateFileExtension(file: Express.Multer.File): boolean {
    if (!file || !file.originalname) {
      return false;
    }

    const fileExtension = file.originalname.split('.').pop()?.toLowerCase();

    if (!fileExtension) {
      return false;
    }

    const isValid = this.allowedExtensions.includes(fileExtension);

    if (isValid) {
      this.logger.debug(`File extension '${fileExtension}' is allowed`);
    } else {
      this.logger.warn(
        `File extension '${fileExtension}' is not allowed. Allowed: ${this.allowedExtensions.join(', ')}`,
      );
    }

    return isValid;
  }

  /**
   * 파일의 SHA-256 해시를 계산합니다.
   * @param file 업로드된 파일
   * @returns 파일 해시값
   */
  calculateFileHash(file: Express.Multer.File): string {
    let fileBuffer: Buffer;

    // 메모리에 있는 경우 buffer 사용, 디스크에 저장된 경우 파일 읽기
    if (file.buffer) {
      fileBuffer = file.buffer;
    } else if (file.path) {
      try {
        const fs = require('fs');
        fileBuffer = fs.readFileSync(file.path);
      } catch (error) {
        throw new Error(`Failed to read file from disk: ${error.message}`);
      }
    } else {
      throw new Error('Invalid file: no buffer or path available');
    }

    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    const fileHash = hash.digest('hex');

    this.logger.debug(`File hash calculated: ${fileHash.substring(0, 16)}...`);
    return fileHash;
  }

  /**
   * 파일 해시를 기반으로 악성코드 검증을 수행합니다.
   * 실제 운영 환경에서는 외부 악성코드 검사 API와 연동해야 합니다.
   * @param fileHash 파일 해시값
   * @returns 악성코드 검사 결과 (true: 안전, false: 위험)
   */
  async scanForMalware(fileHash: string): Promise<boolean> {
    try {
      // 알려진 악성 파일 해시 목록 (예시)
      const knownMalwareHashes = [
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // 예시 해시
        '5d41402abc4b2a76b9719d911017c592', // 예시 해시
      ];

      const isMalware = knownMalwareHashes.includes(fileHash.toLowerCase());

      if (isMalware) {
        this.logger.error(`Malware detected with hash: ${fileHash}`);
        return false;
      }

      // 실제 구현에서는 여기서 외부 API 호출
      // 예: VirusTotal API, Windows Defender API 등
      this.logger.debug(
        `File hash ${fileHash.substring(0, 16)}... passed malware scan`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Malware scan failed: ${error.message}`);
      // 검사 실패 시 보안상 false 반환
      return false;
    }
  }

  /**
   * 파일 크기가 허용 한도 내인지 검증합니다.
   * @param file 업로드된 파일
   * @returns 크기 검증 결과
   */
  validateFileSize(file: Express.Multer.File): boolean {
    if (!file) {
      return false;
    }

    const isValid = file.size <= this.maxFileSize;

    if (isValid) {
      this.logger.debug(`File size ${file.size} bytes is within limit`);
    } else {
      this.logger.warn(
        `File size ${file.size} bytes exceeds limit of ${this.maxFileSize} bytes`,
      );
    }

    return isValid;
  }

  /**
   * 파일 내용의 형식을 검증합니다.
   * @param file 업로드된 파일
   * @param expectedType 예상되는 파일 타입 ('csv' | 'json')
   * @returns 형식 검증 결과
   */
  validateFileContent(
    file: Express.Multer.File,
    expectedType: 'csv' | 'json',
  ): boolean {
    let content: string;

    try {
      // 메모리에 있는 경우 buffer 사용, 디스크에 저장된 경우 파일 읽기
      if (file.buffer) {
        content = file.buffer.toString('utf-8');
      } else if (file.path) {
        const fs = require('fs');
        content = fs.readFileSync(file.path, 'utf-8');
      } else {
        return false;
      }

      if (expectedType === 'json') {
        // JSON 형식 검증
        JSON.parse(content);
        this.logger.debug('JSON file content validation passed');
        return true;
      } else if (expectedType === 'csv') {
        // CSV/TXT 형식 검증 (기본적인 구조 확인)
        const lines = content.split('\n').filter((line) => line.trim());
        if (lines.length === 0) {
          return false;
        }

        // 첫 번째 줄이 헤더인지 확인 (CSV의 경우)
        const firstLine = lines[0];
        const hasCommas = firstLine.includes(',');

        if (hasCommas && lines.length > 1) {
          this.logger.debug('CSV/TXT file content validation passed');
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error(`File content validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 파일에 대한 종합적인 보안 검증을 수행합니다.
   * @param file 업로드된 파일
   * @param expectedType 예상되는 파일 타입
   * @returns 종합 검증 결과
   */
  async validateFile(
    file: Express.Multer.File,
    expectedType: 'csv' | 'json',
  ): Promise<FileValidationResult> {
    const errors: string[] = [];
    let fileHash: string;

    try {
      // 1. 파일 존재 여부 확인
      if (!file) {
        errors.push('File is required');
        return { isValid: false, errors };
      }

      // 2. 파일 확장자 검증
      if (!this.validateFileExtension(file)) {
        errors.push(
          `File extension not allowed. Allowed extensions: ${this.allowedExtensions.join(', ')}`,
        );
      }

      // 3. 파일 크기 검증
      if (!this.validateFileSize(file)) {
        errors.push(
          `File size exceeds maximum limit of ${this.maxFileSize} bytes`,
        );
      }

      // 4. 파일 해시 계산
      try {
        fileHash = this.calculateFileHash(file);
      } catch (error) {
        errors.push('Failed to calculate file hash');
        return { isValid: false, errors };
      }

      // 5. 악성코드 검사
      const isSafe = await this.scanForMalware(fileHash);
      if (!isSafe) {
        errors.push('File failed malware scan');
      }

      // 6. 파일 내용 형식 검증
      if (!this.validateFileContent(file, expectedType)) {
        errors.push(`Invalid ${expectedType.toUpperCase()} file format`);
      }

      const isValid = errors.length === 0;

      if (isValid) {
        this.logger.log(`File validation passed: ${file.originalname}`);
      } else {
        this.logger.warn(
          `File validation failed: ${file.originalname}, errors: ${errors.join(', ')}`,
        );
      }

      return {
        isValid,
        errors,
        fileHash,
      };
    } catch (error) {
      this.logger.error(`File validation error: ${error.message}`);
      return {
        isValid: false,
        errors: ['File validation failed due to internal error'],
      };
    }
  }
}
