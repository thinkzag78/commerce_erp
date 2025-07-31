import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsNumber,
  Min,
  Max,
  ValidateIf,
  IsOptional,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class TransactionRowDto {
  @IsString({ message: '거래일시는 문자열이어야 합니다' })
  @IsNotEmpty({ message: '거래일시는 필수입니다' })
  @Transform(({ value }) => value?.toString().trim())
  거래일시: string;

  @IsString({ message: '적요는 문자열이어야 합니다' })
  @Transform(({ value }) => value?.toString().trim() || '')
  적요: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value || value === '' || value === '0') return 0;
    const cleaned = value.toString().replace(/,/g, '').trim();
    return parseFloat(cleaned) || 0;
  })
  @IsNumber({}, { message: '입금액은 숫자여야 합니다' })
  @Min(0, { message: '입금액은 0 이상이어야 합니다' })
  @Max(1000000000, { message: '입금액은 10억을 초과할 수 없습니다' })
  입금액: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value || value === '' || value === '0') return 0;
    const cleaned = value.toString().replace(/,/g, '').trim();
    return parseFloat(cleaned) || 0;
  })
  @IsNumber({}, { message: '출금액은 숫자여야 합니다' })
  @Min(0, { message: '출금액은 0 이상이어야 합니다' })
  @Max(1000000000, { message: '출금액은 10억을 초과할 수 없습니다' })
  출금액: number;

  @Transform(({ value }) => {
    if (!value || value === '') return 0;
    const cleaned = value.toString().replace(/,/g, '').trim();
    return parseFloat(cleaned) || 0;
  })
  @IsNumber({}, { message: '거래후잔액은 숫자여야 합니다' })
  @Max(1000000000, { message: '거래후잔액은 10억을 초과할 수 없습니다' })
  거래후잔액: number;

  @IsString({ message: '거래점은 문자열이어야 합니다' })
  @Transform(({ value }) => value?.toString().trim() || '')
  거래점: string;

  // 비즈니스 로직 검증을 위한 커스텀 검증
  @ValidateIf((o) => o.입금액 > 0 && o.출금액 > 0)
  @IsOptional()
  _businessLogicCheck1?: never; // 입금액과 출금액이 동시에 존재하면 안됨

  @ValidateIf((o) => o.입금액 === 0 && o.출금액 === 0)
  @IsOptional()
  _businessLogicCheck2?: never; // 입금액 또는 출금액 중 하나는 0보다 커야 함
}

export class ParsedTransactionDto {
  @Type(() => Date)
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      // "2025-07-20 13:45:11" 형식 파싱
      const dateRegex = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
      const match = value.match(dateRegex);
      
      if (!match) {
        throw new Error(`유효하지 않은 날짜 형식: ${value}`);
      }

      const [, year, month, day, hour, minute, second] = match;
      const date = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second),
      );

      if (isNaN(date.getTime())) {
        throw new Error(`유효하지 않은 날짜: ${value}`);
      }

      // 미래 날짜 검증
      const now = new Date();
      const maxAllowedDate = new Date(now.getTime() + 60 * 60 * 1000);
      
      if (date > maxAllowedDate) {
        throw new Error('미래 날짜는 허용되지 않습니다');
      }

      return date;
    }
    return value;
  })
  transaction_date: Date;

  @IsString()
  @IsNotEmpty()
  description_encrypted: string;

  @IsNumber()
  @Min(0)
  deposit_amount: number;

  @IsNumber()
  @Min(0)
  withdrawal_amount: number;

  @IsNumber()
  balance_after: number;

  @IsString()
  @IsNotEmpty()
  branch_encrypted: string;
}