import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { Readable } from 'stream';
import * as csv from 'csv-parser';
import { EncryptionService } from '../../encryption/encryption.service';
import {
  TransactionRowDto,
  ParsedTransactionDto,
} from '../dto/transaction-row.dto';

export interface ParsedTransaction {
  transaction_date: Date;
  description_encrypted: string;
  deposit_amount: number;
  withdrawal_amount: number;
  balance_after: number;
  branch_encrypted: string;
}

export interface TransactionParseResult {
  transactions: ParsedTransaction[];
  totalCount: number;
  validCount: number;
  errors: string[];
}

@Injectable()
export class TransactionParserService {
  private readonly logger = new Logger(TransactionParserService.name);

  constructor(private readonly encryptionService: EncryptionService) {}

  /**
   * bank_transactions.csv 파일을 파싱하여 거래 내역을 추출합니다.
   * @param fileContent 파일 내용 (CSV 형식)
   * @returns 파싱된 거래 내역 배열
   */
  async parseTransactionFile(
    fileContent: string,
  ): Promise<TransactionParseResult> {
    this.logger.log('Starting transaction file parsing');

    const result: TransactionParseResult = {
      transactions: [],
      totalCount: 0,
      validCount: 0,
      errors: [],
    };

    try {
      if (!fileContent || fileContent.trim().length === 0) {
        throw new BadRequestException('파일이 비어있습니다.');
      }

      const rawRows = await this.parseCsvContent(fileContent);
      result.totalCount = rawRows.length;

      if (rawRows.length === 0) {
        throw new BadRequestException('유효한 데이터가 없습니다.');
      }

      // 각 행을 검증하고 변환
      for (let i = 0; i < rawRows.length; i++) {
        try {
          console.log('validateAndTransformRow :::' + rawRows[i]);
          const validatedRow = await this.validateAndTransformRow(rawRows[i]);
          const transaction = this.convertToTransaction(validatedRow);
          result.transactions.push(transaction);
          result.validCount++;
        } catch (error) {
          const errorMessage = `Row ${i + 1}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMessage);
          this.logger.warn(errorMessage);
        }
      }

      this.logger.log(
        `Parsing completed. Valid: ${result.validCount}, Errors: ${result.errors.length}`,
      );

      if (result.validCount === 0) {
        throw new BadRequestException('유효한 거래 내역이 없습니다.');
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Transaction parsing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        '거래 내역 파일 파싱 중 오류가 발생했습니다.',
      );
    }
  }

  /**
   * CSV 내용을 파싱하여 원시 데이터 배열을 반환합니다.
   */
  private async parseCsvContent(fileContent: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      const stream = Readable.from([fileContent]);
      let isFirstRow = true;

      stream
        .pipe(
          csv({
            headers: [
              '거래일시',
              '적요',
              '입금액',
              '출금액',
              '거래후잔액',
              '거래점',
            ],
          }),
        )
        .on('data', (data) => {
          // 첫 번째 행이 헤더인지 확인하고 건너뛰기
          if (isFirstRow && this.isHeaderRow(data)) {
            isFirstRow = false;
            return;
          }
          isFirstRow = false;

          // 빈 행 건너뛰기
          if (this.isEmptyRow(data)) {
            return;
          }
          results.push(data);
        })
        .on('end', () => {
          this.logger.log(
            `CSV parsing completed. ${results.length} rows found`,
          );
          resolve(results);
        })
        .on('error', (error) => {
          this.logger.error(`CSV parsing error: ${error.message}`);
          reject(new BadRequestException(`CSV 파싱 오류: ${error.message}`));
        });
    });
  }

  /**
   * 헤더 행인지 확인합니다.
   */
  private isHeaderRow(row: any): boolean {
    const expectedHeaders = [
      '거래일시',
      '적요',
      '입금액',
      '출금액',
      '거래후잔액',
      '거래점',
    ];
    const values = Object.values(row);

    return expectedHeaders.every((header, index) => values[index] === header);
  }

  /**
   * 빈 행인지 확인합니다.
   */
  private isEmptyRow(row: any): boolean {
    return Object.values(row).every(
      (value) => !value || value.toString().trim() === '',
    );
  }

  /**
   * 행 데이터를 검증하고 변환합니다.
   */
  private async validateAndTransformRow(
    rawRow: any,
  ): Promise<TransactionRowDto> {
    // class-transformer를 사용하여 DTO로 변환
    const transactionRow = plainToClass(TransactionRowDto, rawRow);

    // class-validator를 사용하여 검증 (먼저 수행)
    const errors = await validate(transactionRow);

    if (errors.length > 0) {
      const errorMessages = this.formatValidationErrors(errors);
      throw new Error(`검증 실패: ${errorMessages.join(', ')}`);
    }

    // 비즈니스 로직 검증 (class-validator 통과 후 수행)
    this.validateBusinessLogic(transactionRow);

    return transactionRow;
  }

  /**
   * 비즈니스 로직을 검증합니다.
   */
  private validateBusinessLogic(row: TransactionRowDto): void {
    // 입금액과 출금액이 동시에 존재하는지 확인
    if (row.입금액 > 0 && row.출금액 > 0) {
      throw new Error('입금액과 출금액이 동시에 존재할 수 없습니다');
    }

    // 입금액 또는 출금액 중 하나는 0보다 커야 함
    if (row.입금액 === 0 && row.출금액 === 0) {
      throw new Error('입금액 또는 출금액 중 하나는 0보다 커야 합니다');
    }

    // 소수점 둘째 자리까지만 허용
    if (row.입금액 !== parseFloat(row.입금액.toFixed(2))) {
      throw new Error('입금액은 소수점 둘째 자리까지만 허용됩니다');
    }

    if (row.출금액 !== parseFloat(row.출금액.toFixed(2))) {
      throw new Error('출금액은 소수점 둘째 자리까지만 허용됩니다');
    }

    if (row.거래후잔액 !== parseFloat(row.거래후잔액.toFixed(2))) {
      throw new Error('거래후잔액은 소수점 둘째 자리까지만 허용됩니다');
    }
  }

  /**
   * 검증 에러를 포맷팅합니다.
   */
  private formatValidationErrors(errors: any[]): string[] {
    const messages: string[] = [];

    for (const error of errors) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints).map(String));
      }

      if (error.children && error.children.length > 0) {
        messages.push(...this.formatValidationErrors(error.children));
      }
    }

    return messages;
  }

  /**
   * 검증된 행 데이터를 ParsedTransaction으로 변환합니다.
   */
  private convertToTransaction(row: TransactionRowDto): ParsedTransaction {
    // 날짜 파싱
    const transactionDate = this.parseDate(row.거래일시);
    if (!transactionDate) {
      throw new Error(`유효하지 않은 날짜 형식: ${row.거래일시}`);
    }

    // 개인정보 암호화
    const encryptedDescription = this.encryptPersonalData(row.적요);
    const encryptedBranch = this.encryptPersonalData(row.거래점);

    return {
      transaction_date: transactionDate,
      description_encrypted: encryptedDescription,
      deposit_amount: row.입금액,
      withdrawal_amount: row.출금액,
      balance_after: row.거래후잔액,
      branch_encrypted: encryptedBranch,
    };
  }

  /**
   * 날짜 문자열을 Date 객체로 파싱합니다.
   */
  private parseDate(dateStr: string): Date | null {
    try {
      // "2025-07-20 13:45:11" 형식 파싱
      const dateRegex = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
      const match = dateStr.match(dateRegex);

      if (!match) {
        return null;
      }

      const [, year, month, day, hour, minute, second] = match;
      const date = new Date(
        parseInt(year),
        parseInt(month) - 1, // JavaScript의 월은 0부터 시작
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second),
      );

      // 유효한 날짜인지 확인
      if (isNaN(date.getTime())) {
        return null;
      }

      // 미래 날짜 검증 (현재 시간보다 1시간 이후까지 허용)
      const now = new Date();
      const maxAllowedDate = new Date(now.getTime() + 60 * 60 * 1000);

      if (date > maxAllowedDate) {
        throw new Error('미래 날짜는 허용되지 않습니다.');
      }

      return date;
    } catch (error) {
      return null;
    }
  }

  /**
   * 개인정보가 포함된 데이터를 암호화합니다.
   */
  private encryptPersonalData(data: string): string {
    if (!data || data.trim() === '') {
      return '';
    }

    try {
      // 개인정보 여부와 관계없이 적요와 거래점 정보는 모두 암호화
      return this.encryptionService.encrypt(data.trim());
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Personal data encryption failed: ${errorMessage}`);
      throw new Error('개인정보 암호화 중 오류가 발생했습니다.');
    }
  }

  /**
   * 파싱 결과의 유효성을 검증합니다.
   */
  validateParseResult(result: TransactionParseResult): void {
    if (result.errors.length > result.validCount) {
      throw new BadRequestException(
        `파싱 오류가 너무 많습니다. 유효: ${result.validCount}, 오류: ${result.errors.length}`,
      );
    }

    if (result.validCount === 0) {
      throw new BadRequestException('유효한 거래 내역이 없습니다.');
    }
  }
}
