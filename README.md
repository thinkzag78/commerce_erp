# 자동 회계 처리 시스템

은행 거래 내역과 분류 규칙을 입력받아 자동으로 회계 처리를 수행하는 NestJS 기반 RESTful API 시스템입니다.

## 주요 기능

- 🏦 **은행 거래 내역 자동 분류**: CSV 형식의 거래 내역을 규칙 기반으로 자동 분류
- 🔐 **보안 강화**: JWT 인증, 개인정보 암호화, 파일 검증
- 👥 **권한 관리**: 관리자/사업자 권한 분리, 사업체별 데이터 접근 제한
- 📊 **확장 가능한 규칙 엔진**: JSON 기반 분류 규칙, 키워드/금액/거래유형 조건
- 🚀 **Docker 지원**: 컨테이너 기반 배포, 개발/프로덕션 환경 분리
- 📖 **API 문서**: Swagger/OpenAPI 자동 문서 생성

## 기술 스택

- **Backend**: NestJS, TypeScript
- **Database**: MariaDB, TypeORM
- **Authentication**: JWT, Passport
- **Security**: AES-256-GCM 암호화, bcrypt
- **File Processing**: Multer, CSV 파싱
- **Documentation**: Swagger/OpenAPI
- **Deployment**: Docker, Docker Compose, Nginx
- **Testing**: Jest, Supertest

## 빠른 시작

### 1. Docker를 사용한 실행 (권장)

```bash
# 저장소 클론
git clone <repository-url>
cd commerce_erp

# 환경 변수 설정
cp .env.example .env

# Docker로 실행
./scripts/deploy.sh development
# 또는
docker-compose up -d
```

### 2. 로컬 개발 환경 설정

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일을 편집하여 데이터베이스 및 관리자 계정 정보 설정

# MariaDB 시작 (Docker)
docker-compose up -d mariadb

# 애플리케이션 실행 (초기 관리자 계정 자동 생성)
npm run start:dev

# 또는 수동으로 관리자 계정 생성
npm run seed:admin
```

### 3. 초기 관리자 계정 설정

애플리케이션 최초 실행 시 `.env` 파일의 설정에 따라 관리자 계정이 자동으로 생성됩니다.

#### 환경변수 설정 (.env 파일)

```bash
# 관리자 계정 정보 (필수)
ADMIN_USERNAME=admin                    # 사용자명 (3-50자)
ADMIN_PASSWORD=MySecureP@ssw0rd2024!   # 비밀번호 (8자 이상, 복합 문자)
ADMIN_COMPANY_ID=admin_company          # 회사 ID (선택사항)
ADMIN_COMPANY_NAME=Admin Company        # 회사명 (선택사항)
```

#### 비밀번호 보안 규칙

- **최소 길이**: 8자 이상 (12자 이상 권장)
- **문자 조합**: 대문자, 소문자, 숫자, 특수문자 포함
- **금지 사항**: 사전 단어, 개인정보, 단순 패턴 사용 금지

#### 수동 관리자 계정 생성

```bash
# 환경변수 기반 관리자 계정 생성
npm run seed:admin

# 프로덕션 환경에서 seeder 실행 (주의!)
ENABLE_SEEDER=true npm run seed:admin
```

## API 사용법

### 1. 로그인

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

### 2. 거래 내역 처리

```bash
curl -X POST http://localhost:3000/api/v1/accounting/process \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "files=@bank_transactions.txt" \
  -F "files=@rules.json"
```

### 3. 거래 내역 조회

```bash
curl -X GET "http://localhost:3000/api/v1/accounting/records?companyId=com_demo" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 테스트 데이터

프로젝트에는 테스트용 파일들이 포함되어 있습니다:

- `bank_transactions.csv`: 샘플 은행 거래 내역
- `rules.json`: 샘플 분류 규칙
- `postman_collection.json`: Postman API 테스트 컬렉션

### 기본 사용자 계정

- **관리자**: `.env` 파일의 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 설정값
- **기본값**: `admin` / `admin123!` (개발 환경 전용)

> ⚠️ **보안 주의**: 프로덕션 환경에서는 반드시 강력한 비밀번호로 변경하고, 최초 로그인 후 즉시 비밀번호를 변경하세요.

## 프로젝트 구조

```
src/
├── accounting/         # 회계 처리 모듈
├── auth/              # 인증 및 권한 관리
├── common/            # 공통 모듈 (필터, 로거)
├── encryption/        # 암호화 서비스
├── file/              # 파일 처리 모듈
├── rule/              # 규칙 엔진
└── main.ts           # 애플리케이션 진입점

docs/                  # 문서
├── API_DOCUMENTATION.md
├── DEPLOYMENT_GUIDE.md
└── DEVELOPMENT_GUIDE.md

docker/               # Docker 설정
├── mariadb/
└── nginx/
```

## 개발 명령어

```bash
# 개발 서버 실행 (핫 리로드)
npm run start:dev

# 디버그 모드 실행
npm run start:debug

# 프로덕션 빌드
npm run build

# 단위 테스트
npm test

# E2E 테스트
npm run test:e2e

# 테스트 커버리지
npm run test:cov

# 코드 린팅
npm run lint

# 코드 포맷팅
npm run format
```

## 배포

### 개발 환경

```bash
./scripts/deploy.sh development
```

### 프로덕션 환경

```bash
./scripts/deploy.sh production
```

## API 문서

- **Swagger UI**: http://localhost:3000/api/docs
- **상세 API 문서**: [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)
- **배포 가이드**: [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)
- **개발 가이드**: [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)

## 주요 특징

### 보안

- JWT 기반 인증 시스템
- AES-256-GCM 개인정보 암호화
- 파일 업로드 보안 검증 (SHA-256 해시 기반 악성코드 검사)
- 권한 기반 데이터 접근 제어
- 업로드된 파일의 물리적 저장 및 경로 관리

### 확장성

- 모듈화된 아키텍처
- JSON 기반 규칙 엔진
- Docker 컨테이너 지원
- 수평 확장 가능한 설계

### 개발자 경험

- TypeScript 완전 지원
- 자동 API 문서 생성
- 포괄적인 테스트 커버리지
- 개발/프로덕션 환경 분리

## 문제 해결

### 일반적인 문제

1. **포트 충돌**: `lsof -i :3000`으로 확인 후 프로세스 종료
2. **데이터베이스 연결 실패**: `docker-compose logs mariadb`로 로그 확인
3. **파일 업로드 오류**: 파일 형식(.txt, .json)과 크기(10MB 이하) 확인

### 로그 확인

```bash
# 애플리케이션 로그
docker-compose logs app

# 데이터베이스 로그
docker-compose logs mariadb

# 실시간 로그 모니터링
docker-compose logs -f app
```

## 기여하기

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

## 지원

- 📖 **문서**: `docs/` 디렉토리의 상세 가이드 참조
- 🐛 **버그 리포트**: GitHub Issues 사용
- 💬 **질문 및 토론**: GitHub Discussions 활용
- 📧 **기술 지원**: 프로젝트 관리자에게 문의
