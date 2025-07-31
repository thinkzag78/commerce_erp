# 자동 회계 처리 시스템 개발 가이드

## 개요

이 문서는 자동 회계 처리 시스템의 개발 환경 구성 및 개발 프로세스를 설명합니다.

## 개발 환경 요구사항

### 필수 소프트웨어

- **Node.js**: 18.x 이상
- **npm**: 9.x 이상
- **Docker**: 20.10 이상
- **Docker Compose**: 2.0 이상
- **Git**: 최신 버전

### 권장 개발 도구

- **IDE**: Visual Studio Code, WebStorm, 또는 IntelliJ IDEA
- **API 테스트**: Postman, Insomnia, 또는 REST Client
- **데이터베이스 클라이언트**: DBeaver, MySQL Workbench, 또는 phpMyAdmin
- **Git 클라이언트**: GitKraken, SourceTree, 또는 터미널

## 개발 환경 설정

### 1. 저장소 클론 및 초기 설정

```bash
# 저장소 클론
git clone <repository-url>
cd commerce_erp

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
```

### 2. 환경 변수 구성

`.env` 파일을 편집하여 개발 환경에 맞게 설정:

```bash
# 개발 환경 설정
NODE_ENV=development

# 데이터베이스 설정
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USERNAME=root
DATABASE_PASSWORD=root@1234
DATABASE_NAME=commerce_erp

# JWT 설정
JWT_SECRET=D5ykOxDWMWAQvAG0ELBb1KpHRgBoUYAK
JWT_EXPIRES_IN=24h

# 암호화 설정
ENCRYPTION_KEY=unDdhElxQ3aWabIvJGHiCzAgWzw2ZMAr

# 파일 업로드 설정
FILE_UPLOAD_MAX_SIZE=10485760
ALLOWED_FILE_EXTENSIONS=txt,json

# 서버 설정
PORT=3000

# 로깅 설정
LOG_LEVEL=debug
```

### 3. 데이터베이스 설정

#### Docker를 사용한 MariaDB 설정 (권장)

```bash
# MariaDB 컨테이너만 시작
docker-compose up -d mariadb

# 데이터베이스 연결 확인
docker-compose exec mariadb mysql -u root -p
```

#### 로컬 MariaDB 설정

```bash
# MariaDB 설치 (macOS)
brew install mariadb
brew services start mariadb

# MariaDB 설치 (Ubuntu)
sudo apt update
sudo apt install mariadb-server
sudo systemctl start mariadb

# 데이터베이스 생성
mysql -u root -p
```

```sql
CREATE DATABASE commerce_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'accounting_user'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON commerce_erp.* TO 'accounting_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 4. 애플리케이션 실행

```bash
# 개발 모드로 실행 (핫 리로드)
npm run start:dev

# 디버그 모드로 실행
npm run start:debug

# 프로덕션 빌드 후 실행
npm run build
npm run start:prod
```

## 프로젝트 구조

```
src/
├── accounting/              # 회계 처리 모듈
│   ├── entities/           # 엔티티 클래스
│   ├── services/           # 비즈니스 로직
│   └── accounting.controller.ts
├── auth/                   # 인증 모듈
│   ├── decorators/         # 커스텀 데코레이터
│   ├── dto/               # 데이터 전송 객체
│   ├── entities/          # 사용자 엔티티
│   ├── guards/            # 인증/권한 가드
│   └── strategies/        # Passport 전략
├── common/                # 공통 모듈
│   ├── filters/           # 예외 필터
│   └── logger/            # 로깅 서비스
├── encryption/            # 암호화 서비스
├── file/                  # 파일 처리 모듈
├── rule/                  # 규칙 엔진 모듈
└── main.ts               # 애플리케이션 진입점

test/                      # 테스트 파일
├── integration/           # 통합 테스트
└── e2e/                  # E2E 테스트

docs/                     # 문서
├── API_DOCUMENTATION.md
├── DEPLOYMENT_GUIDE.md
└── DEVELOPMENT_GUIDE.md

docker/                   # Docker 설정
├── mariadb/
└── nginx/
```

## 개발 워크플로우

### 1. 기능 개발 프로세스

```bash
# 새 기능 브랜치 생성
git checkout -b feature/new-feature

# 개발 진행
# ... 코드 작성 ...

# 테스트 실행
npm test
npm run test:e2e

# 코드 품질 검사
npm run lint
npm run format

# 커밋 및 푸시
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature

# Pull Request 생성
```

### 2. 코드 스타일 및 품질

#### ESLint 설정

```bash
# 린트 검사
npm run lint

# 자동 수정
npm run lint -- --fix
```

#### Prettier 설정

```bash
# 코드 포맷팅
npm run format

# 포맷팅 검사
npm run format -- --check
```

#### 커밋 메시지 규칙

```
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 수정
style: 코드 스타일 변경 (기능 변경 없음)
refactor: 코드 리팩토링
test: 테스트 추가 또는 수정
chore: 빌드 프로세스 또는 도구 변경
```

## 테스트

### 1. 단위 테스트

```bash
# 모든 단위 테스트 실행
npm test

# 특정 파일 테스트
npm test -- auth.service.spec.ts

# 테스트 커버리지 확인
npm run test:cov

# 테스트 감시 모드
npm run test:watch
```

### 2. 통합 테스트

```bash
# 통합 테스트 실행
npm run test:e2e

# 특정 통합 테스트 실행
npm run test:e2e -- --testNamePattern="Auth"
```

### 3. 테스트 작성 가이드

#### 단위 테스트 예시

```typescript
// auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('signIn', () => {
    it('should return JWT token for valid credentials', async () => {
      // 테스트 구현
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      // 테스트 구현
    });
  });
});
```

#### 통합 테스트 예시

```typescript
// auth.integration.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/auth/login (POST)', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('access_token');
      });
  });
});
```

## 데이터베이스 작업

### 1. TypeORM 설정

```typescript
// app.module.ts
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mariadb',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT),
      username: process.env.DATABASE_USERNAME,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV === 'development',
    }),
  ],
})
export class AppModule {}
```

### 2. 엔티티 작성

```typescript
// user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  user_id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password_hash: string;

  @Column({ type: 'enum', enum: ['ADMIN', 'BUSINESS_OWNER'] })
  user_type: string;

  @Column({ nullable: true })
  company_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
```

### 3. 마이그레이션

```bash
# 마이그레이션 생성
npm run typeorm:migration:generate -- -n CreateUserTable

# 마이그레이션 실행
npm run typeorm:migration:run

# 마이그레이션 롤백
npm run typeorm:migration:revert
```

## API 개발

### 1. 컨트롤러 작성

```typescript
// auth.controller.ts
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: '사용자 로그인' })
  @ApiResponse({ status: 200, description: '로그인 성공' })
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.signIn(loginDto.username, loginDto.password);
  }
}
```

### 2. DTO 작성

```typescript
// login.dto.ts
import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '사용자명', example: 'admin' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ description: '비밀번호', example: 'admin123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
```

### 3. 서비스 작성

```typescript
// auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async signIn(username: string, password: string) {
    const user = await this.userRepository.findOne({ where: { username } });
    
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { 
      userId: user.user_id, 
      username: user.username,
      userType: user.user_type,
      companyId: user.company_id 
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: payload,
    };
  }
}
```

## 디버깅

### 1. VS Code 디버깅 설정

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug NestJS",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/main.ts",
      "args": [],
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "restart": true,
      "protocol": "inspector",
      "envFile": "${workspaceFolder}/.env"
    }
  ]
}
```

### 2. 로깅

```typescript
// 로거 사용 예시
import { Logger } from '@nestjs/common';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  async signIn(username: string, password: string) {
    this.logger.log(`Login attempt for user: ${username}`);
    
    try {
      // 로그인 로직
      this.logger.log(`Login successful for user: ${username}`);
    } catch (error) {
      this.logger.error(`Login failed for user: ${username}`, error.stack);
      throw error;
    }
  }
}
```

### 3. 데이터베이스 쿼리 로깅

```typescript
// app.module.ts
TypeOrmModule.forRoot({
  // ... 기타 설정
  logging: process.env.NODE_ENV === 'development',
  logger: 'advanced-console',
}),
```

## 성능 최적화

### 1. 데이터베이스 최적화

```typescript
// 인덱스 추가
@Entity('transactions')
@Index(['company_id', 'transaction_date'])
export class Transaction {
  // 엔티티 정의
}

// 쿼리 최적화
async getTransactionsByCompany(companyId: string) {
  return this.transactionRepository
    .createQueryBuilder('transaction')
    .leftJoinAndSelect('transaction.category', 'category')
    .where('transaction.company_id = :companyId', { companyId })
    .orderBy('transaction.transaction_date', 'DESC')
    .limit(100)
    .getMany();
}
```

### 2. 캐싱

```typescript
// Redis 캐싱 (선택사항)
import { CACHE_MANAGER, Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';

@Injectable()
export class RuleService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getRules(companyId: string) {
    const cacheKey = `rules:${companyId}`;
    let rules = await this.cacheManager.get(cacheKey);
    
    if (!rules) {
      rules = await this.ruleRepository.find({ where: { companyId } });
      await this.cacheManager.set(cacheKey, rules, 300); // 5분 캐시
    }
    
    return rules;
  }
}
```

## 보안 고려사항

### 1. 입력 검증

```typescript
// DTO에서 검증
import { IsString, IsNotEmpty, IsEmail, Length } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 50)
  username: string;

  @IsString()
  @Length(8, 100)
  password: string;
}
```

### 2. SQL 인젝션 방지

```typescript
// 파라미터화된 쿼리 사용
async findUserByUsername(username: string) {
  return this.userRepository
    .createQueryBuilder('user')
    .where('user.username = :username', { username })
    .getOne();
}
```

### 3. 암호화

```typescript
// 비밀번호 해싱
import * as bcrypt from 'bcrypt';

async hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

// 데이터 암호화
import * as CryptoJS from 'crypto-js';

encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, process.env.ENCRYPTION_KEY).toString();
}
```

## 문제 해결

### 1. 일반적인 개발 문제

#### 포트 충돌
```bash
# 포트 사용 중인 프로세스 확인
lsof -i :3000

# 프로세스 종료
kill -9 <PID>
```

#### 의존성 문제
```bash
# node_modules 재설치
rm -rf node_modules package-lock.json
npm install
```

#### 데이터베이스 연결 문제
```bash
# 데이터베이스 컨테이너 재시작
docker-compose restart mariadb

# 연결 테스트
docker-compose exec mariadb mysql -u root -p -e "SELECT 1;"
```

### 2. 디버깅 팁

```typescript
// 요청/응답 로깅 미들웨어
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const userAgent = req.get('User-Agent') || '';

    res.on('close', () => {
      const { statusCode } = res;
      this.logger.log(`${method} ${originalUrl} ${statusCode} - ${userAgent}`);
    });

    next();
  }
}
```

## 기여 가이드

### 1. 코드 기여 프로세스

1. 이슈 생성 또는 기존 이슈 확인
2. 기능 브랜치 생성
3. 코드 작성 및 테스트
4. Pull Request 생성
5. 코드 리뷰 및 수정
6. 머지

### 2. 코드 리뷰 체크리스트

- [ ] 코드 스타일 준수 (ESLint, Prettier)
- [ ] 테스트 커버리지 확인
- [ ] API 문서 업데이트
- [ ] 보안 취약점 검토
- [ ] 성능 영향 검토
- [ ] 에러 처리 적절성

## 추가 리소스

- **NestJS 공식 문서**: https://docs.nestjs.com/
- **TypeORM 문서**: https://typeorm.io/
- **Jest 테스팅 가이드**: https://jestjs.io/docs/getting-started
- **Docker 문서**: https://docs.docker.com/
- **MariaDB 문서**: https://mariadb.org/documentation/