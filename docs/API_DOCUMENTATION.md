# 자동 회계 처리 시스템 API 문서

## 개요

자동 회계 처리 시스템은 은행 거래 내역과 분류 규칙을 입력받아 자동으로 회계 처리를 수행하는 RESTful API입니다.

## 기본 정보

- **Base URL**: `http://localhost:3000/api/v1`
- **API 문서**: `http://localhost:3000/api/docs` (Swagger UI)
- **인증 방식**: JWT Bearer Token
- **Content-Type**: `application/json` (파일 업로드 시 `multipart/form-data`)

## 인증

모든 API 엔드포인트는 JWT 토큰을 통한 인증이 필요합니다 (로그인 제외).

### 토큰 사용법

```http
Authorization: Bearer <your-jwt-token>
```

## API 엔드포인트

### 1. 인증 관련 API

#### 1.1 사용자 로그인

**POST** `/auth/login`

사용자명과 비밀번호로 로그인하여 JWT 토큰을 발급받습니다.

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": 1,
    "username": "admin",
    "userType": "ADMIN",
    "companyId": null
  }
}
```

**Error Responses:**
- `401 Unauthorized`: 잘못된 사용자명 또는 비밀번호

#### 1.2 사용자 프로필 조회

**GET** `/auth/profile`

현재 로그인한 사용자의 정보를 조회합니다.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "user": {
    "user_id": 1,
    "username": "admin",
    "user_type": "ADMIN",
    "company_id": null,
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z"
  }
}
```

#### 1.3 사용자 생성 (관리자 전용)

**POST** `/auth/users`

새로운 사용자를 생성합니다. 관리자 권한이 필요합니다.

**Headers:**
```http
Authorization: Bearer <admin-token>
```

**Request Body:**
```json
{
  "username": "business_user",
  "password": "password123",
  "userType": "BUSINESS_OWNER",
  "companyId": "com_demo"
}
```

**Response (201 Created):**
```json
{
  "message": "사용자가 성공적으로 생성되었습니다.",
  "user": {
    "userId": 2,
    "username": "business_user",
    "userType": "BUSINESS_OWNER",
    "companyId": "com_demo"
  }
}
```

### 2. 회계 처리 API

#### 2.1 거래 내역 자동 분류 처리

**POST** `/accounting/process`

은행 거래 내역 파일과 분류 규칙 파일을 업로드하여 자동으로 거래를 분류합니다.

**Headers:**
```http
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Request Body (Form Data):**
- `files`: 파일 배열
  - `bank_transactions.txt`: 은행 거래 내역 파일
  - `rules.json`: 분류 규칙 파일

**거래 내역 파일 형식 (bank_transactions.txt):**
```
거래일시,적요,입금액,출금액,거래후잔액,거래점
2025-07-20 13:45:11,스타벅스 강남2호점,0,5500,994500,강남지점
2025-07-20 14:30:22,월급 입금,3000000,0,3994500,본점
```

**규칙 파일 형식 (rules.json):**
```json
{
  "companies": [
    {
      "company_id": "com_demo",
      "categories": [
        {
          "category_id": "cat_demo_food",
          "category_name": "식비",
          "keywords": ["스타벅스", "카페", "맥도날드"],
          "exclude_keywords": ["환불"],
          "amount_range": {
            "min": 1000,
            "max": 50000
          },
          "transaction_type": "WITHDRAWAL",
          "priority": 1
        }
      ]
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "processed_count": 100,
  "classified_count": 85,
  "unclassified_count": 15,
  "success": true,
  "message": "거래 내역 처리가 성공적으로 완료되었습니다."
}
```

**Error Responses:**
- `400 Bad Request`: 파일 누락, 형식 오류, 검증 실패
- `401 Unauthorized`: 인증 실패
- `413 Payload Too Large`: 파일 크기 초과
- `415 Unsupported Media Type`: 지원하지 않는 파일 형식

#### 2.2 거래 내역 조회

**GET** `/accounting/records`

사업체별 거래 내역을 페이징하여 조회합니다.

**Headers:**
```http
Authorization: Bearer <token>
```

**Query Parameters:**
- `companyId` (required): 조회할 사업체 ID
- `page` (optional): 페이지 번호 (기본값: 1)
- `limit` (optional): 페이지당 항목 수 (기본값: 50, 최대: 100)
- `status` (optional): 분류 상태 필터 (`classified` | `unclassified`)

**Example Request:**
```http
GET /api/v1/accounting/records?companyId=com_demo&page=1&limit=20&status=classified
```

**Response (200 OK):**
```json
{
  "transactions": [
    {
      "transaction_id": 1,
      "company_id": "com_demo",
      "category_id": "cat_demo_food",
      "category_name": "식비",
      "transaction_date": "2025-07-20T13:45:11.000Z",
      "description": "스타벅스 강남2호점",
      "deposit_amount": 0,
      "withdrawal_amount": 5500,
      "balance_after": 994500,
      "branch": "강남지점",
      "processed_at": "2025-07-20T15:00:00.000Z",
      "created_at": "2025-07-20T15:00:00.000Z",
      "updated_at": "2025-07-20T15:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  },
  "stats": {
    "totalTransactions": 100,
    "classifiedCount": 85,
    "unclassifiedCount": 15,
    "classificationRate": 85.0
  }
}
```

**Error Responses:**
- `400 Bad Request`: companyId 누락, 잘못된 페이징 파라미터
- `401 Unauthorized`: 인증 실패
- `403 Forbidden`: 다른 사업체 데이터 접근 시도

## 권한 관리

### 사용자 유형

1. **ADMIN (시스템 관리자)**
   - 모든 사업체 데이터 접근 가능
   - 사용자 생성 권한
   - 모든 API 엔드포인트 접근 가능

2. **BUSINESS_OWNER (사업자)**
   - 본인 사업체 데이터만 접근 가능
   - 거래 내역 처리 및 조회 가능
   - 사용자 생성 권한 없음

### 권한 검증

- JWT 토큰의 `userType`과 `companyId`를 기반으로 권한 검증
- 사업자는 본인의 `companyId`와 일치하는 데이터만 접근 가능
- 관리자는 모든 데이터 접근 가능

## 오류 처리

### 표준 오류 응답 형식

```json
{
  "statusCode": 400,
  "message": "오류 메시지",
  "error": "Bad Request",
  "timestamp": "2025-07-20T15:00:00.000Z",
  "path": "/api/v1/accounting/process"
}
```

### HTTP 상태 코드

- `200 OK`: 요청 성공
- `201 Created`: 리소스 생성 성공
- `400 Bad Request`: 잘못된 요청
- `401 Unauthorized`: 인증 실패
- `403 Forbidden`: 권한 없음
- `404 Not Found`: 리소스 없음
- `413 Payload Too Large`: 파일 크기 초과
- `415 Unsupported Media Type`: 지원하지 않는 미디어 타입
- `500 Internal Server Error`: 서버 내부 오류
- `503 Service Unavailable`: 서비스 이용 불가

## 보안 고려사항

### 파일 업로드 보안

- 허용된 파일 확장자만 업로드 가능 (`.txt`, `.json`)
- 파일 크기 제한: 10MB
- 파일 해시 검증을 통한 무결성 확인
- 악성코드 검사 (기본 구현)

### 데이터 암호화

- 개인정보가 포함된 필드는 AES-256-GCM으로 암호화 저장
- 조회 시 자동 복호화하여 반환
- 암호화 키는 환경변수로 관리

### 인증 및 권한

- JWT 토큰 기반 인증
- 토큰 만료 시간: 24시간 (설정 가능)
- 사업체별 데이터 접근 제한
- 관리자/사업자 권한 분리

## 사용 예시

### 1. 로그인 및 토큰 획득

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
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
curl -X GET "http://localhost:3000/api/v1/accounting/records?companyId=com_demo&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 개발 및 테스트

### 테스트 데이터

시스템에는 다음과 같은 테스트 데이터가 미리 설정되어 있습니다:

**테스트 사용자:**
- 관리자: `admin` / `admin123`
- 데모 사업자: `demo_user` / `business123`
- 테스트 사업자: `test_user` / `business123`

**테스트 사업체:**
- `com_demo`: 데모 사업체
- `com_test`: 테스트 사업체

### API 테스트 도구

- **Swagger UI**: `http://localhost:3000/api/docs`
- **Postman Collection**: 프로젝트 루트의 `postman_collection.json` 파일 참조
- **cURL**: 위의 예시 참조

## 문제 해결

### 자주 발생하는 오류

1. **401 Unauthorized**
   - JWT 토큰이 만료되었거나 유효하지 않음
   - 해결: 다시 로그인하여 새 토큰 발급

2. **403 Forbidden**
   - 권한이 없는 리소스에 접근 시도
   - 해결: 올바른 권한을 가진 사용자로 로그인

3. **400 Bad Request - 파일 형식 오류**
   - 거래 내역 파일의 CSV 형식이 올바르지 않음
   - 해결: 파일 형식 확인 및 수정

4. **413 Payload Too Large**
   - 업로드 파일 크기가 10MB를 초과
   - 해결: 파일 크기 줄이거나 분할 업로드

### 로그 확인

```bash
# Docker 환경에서 로그 확인
docker-compose logs app

# 특정 시간대 로그 확인
docker-compose logs --since="2025-07-20T10:00:00" app
```

## 지원 및 문의

- **GitHub Issues**: 프로젝트 저장소의 Issues 탭
- **API 문서**: `http://localhost:3000/api/docs`
- **개발 가이드**: `docs/DEVELOPMENT_GUIDE.md`