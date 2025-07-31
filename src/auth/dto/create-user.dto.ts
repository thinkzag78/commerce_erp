import { IsString, IsNotEmpty, MinLength, IsEnum, IsOptional } from 'class-validator';
import { UserType } from '../entities/user.entity';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: '사용자명은 필수입니다.' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '비밀번호는 필수입니다.' })
  @MinLength(6, { message: '비밀번호는 최소 6자 이상이어야 합니다.' })
  password: string;

  @IsEnum(UserType, { message: '유효한 사용자 타입을 선택해주세요.' })
  userType: UserType;

  @IsOptional()
  @IsString()
  companyId?: string;
}