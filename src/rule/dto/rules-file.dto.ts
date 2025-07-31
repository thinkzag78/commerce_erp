import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsIn,
  Min,
  ValidateNested,
  ArrayMinSize,
  IsObject,
  IsNotEmpty,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class AmountRangeDto {
  @IsOptional()
  @IsNumber({}, { message: 'min must be a number' })
  @Min(0, { message: 'min must be non-negative' })
  min?: number;

  @IsOptional()
  @IsNumber({}, { message: 'max must be a number' })
  @Min(0, { message: 'max must be non-negative' })
  max?: number;
}

export class CategoryRuleDto {
  @IsString({ message: 'category_id must be a string' })
  @IsNotEmpty({ message: 'category_id cannot be empty' })
  category_id: string;

  @IsString({ message: 'category_name must be a string' })
  @IsNotEmpty({ message: 'category_name cannot be empty' })
  category_name: string;

  @IsArray({ message: 'keywords must be an array' })
  @ArrayMinSize(1, { message: 'keywords must have at least one item' })
  @IsString({ each: true, message: 'each keyword must be a string' })
  @Transform(({ value }) => value?.map((keyword: string) => keyword.trim()))
  keywords: string[];

  @IsOptional()
  @IsArray({ message: 'exclude_keywords must be an array' })
  @IsString({ each: true, message: 'each exclude keyword must be a string' })
  @Transform(({ value }) => value?.map((keyword: string) => keyword.trim()))
  exclude_keywords?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AmountRangeDto)
  @IsObject({ message: 'amount_range must be an object' })
  amount_range?: AmountRangeDto;

  @IsOptional()
  @IsIn(['DEPOSIT', 'WITHDRAWAL', 'ALL'], {
    message: 'transaction_type must be DEPOSIT, WITHDRAWAL, or ALL',
  })
  transaction_type?: 'DEPOSIT' | 'WITHDRAWAL' | 'ALL';

  @IsOptional()
  @IsNumber({}, { message: 'priority must be a number' })
  @Min(1, { message: 'priority must be a positive number' })
  priority?: number;
}

export class CompanyRuleDto {
  @IsString({ message: 'company_id must be a string' })
  @IsNotEmpty({ message: 'company_id cannot be empty' })
  company_id: string;

  @IsString({ message: 'company_name must be a string' })
  @IsNotEmpty({ message: 'company_name cannot be empty' })
  company_name: string;

  @IsArray({ message: 'categories must be an array' })
  @ArrayMinSize(1, { message: 'categories must have at least one item' })
  @ValidateNested({ each: true })
  @Type(() => CategoryRuleDto)
  categories: CategoryRuleDto[];
}

export class RulesFileDto {
  @IsArray({ message: 'companies must be an array' })
  @ArrayMinSize(1, { message: 'companies must have at least one item' })
  @ValidateNested({ each: true })
  @Type(() => CompanyRuleDto)
  companies: CompanyRuleDto[];
}