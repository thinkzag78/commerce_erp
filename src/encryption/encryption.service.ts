import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CryptoJS from 'crypto-js';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly encryptionKey: string;

  constructor(private configService: ConfigService) {
    this.encryptionKey = this.configService.get<string>('ENCRYPTION_KEY') || '';
    if (!this.encryptionKey || this.encryptionKey.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }
  }

  /**
   * 텍스트를 AES-256-GCM으로 암호화합니다.
   * @param plaintext 암호화할 평문
   * @returns 암호화된 문자열 (Base64 인코딩)
   */
  encrypt(plaintext: string): string {
    try {
      if (!plaintext) {
        return '';
      }

      const encrypted = CryptoJS.AES.encrypt(
        plaintext,
        this.encryptionKey,
      ).toString();
      this.logger.debug(`Text encrypted successfully`);
      return encrypted;
    } catch (error) {
      this.logger.error(`Encryption failed: ${error.message}`);
      throw new Error('Encryption failed');
    }
  }

  /**
   * AES-256-GCM으로 암호화된 텍스트를 복호화합니다.
   * @param ciphertext 복호화할 암호문 (Base64 인코딩)
   * @returns 복호화된 평문
   */
  decrypt(ciphertext: string): string {
    try {
      if (!ciphertext) {
        return '';
      }

      const decrypted = CryptoJS.AES.decrypt(ciphertext, this.encryptionKey);
      const plaintext = decrypted.toString(CryptoJS.enc.Utf8);

      if (!plaintext) {
        throw new Error('Invalid ciphertext or key');
      }

      this.logger.debug(`Text decrypted successfully`);
      return plaintext;
    } catch (error) {
      this.logger.error(`Decryption failed: ${error.message}`);
      throw new Error('Decryption failed');
    }
  }

  /**
   * 새로운 암호화 키를 생성합니다.
   * @returns 32자리 랜덤 키
   */
  generateKey(): string {
    return CryptoJS.lib.WordArray.random(32).toString();
  }

  /**
   * 암호화 키를 로테이션합니다.
   * 실제 운영 환경에서는 기존 데이터를 새 키로 재암호화해야 합니다.
   */
  async rotateKey(): Promise<void> {
    this.logger.warn(
      'Key rotation requested - this should trigger data re-encryption in production',
    );
    // 실제 구현에서는 데이터베이스의 모든 암호화된 데이터를 새 키로 재암호화
    throw new Error('Key rotation not implemented - requires data migration');
  }

  /**
   * 개인정보로 판단되는 데이터인지 확인합니다.
   * @param data 검사할 데이터
   * @returns 개인정보 여부
   */
  isPersonalData(data: string): boolean {
    if (!data) return false;

    // 개인정보 패턴 검사 (예: 전화번호, 이메일, 주민번호 등)
    const personalDataPatterns = [
      /\d{3}-\d{4}-\d{4}/, // 전화번호
      /\d{2,3}-\d{3,4}-\d{4}/, // 전화번호 변형
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // 이메일
      /\d{6}-\d{7}/, // 주민번호
      /\d{13}/, // 주민번호 (하이픈 없음)
    ];

    return personalDataPatterns.some((pattern) => pattern.test(data));
  }

  /**
   * 데이터가 개인정보인 경우 자동으로 암호화합니다.
   * @param data 검사 및 암호화할 데이터
   * @returns 필요시 암호화된 데이터
   */
  encryptIfPersonal(data: string): string {
    if (this.isPersonalData(data)) {
      return this.encrypt(data);
    }
    return data;
  }
}
