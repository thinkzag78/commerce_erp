# 자동 회계 처리 시스템 배포 가이드

## 개요

이 문서는 자동 회계 처리 시스템을 다양한 환경에 배포하는 방법을 설명합니다.

## 시스템 요구사항

### 최소 요구사항

- **CPU**: 2 코어 이상
- **메모리**: 4GB RAM 이상
- **디스크**: 20GB 이상의 여유 공간
- **운영체제**: Linux (Ubuntu 20.04+ 권장), macOS, Windows

### 소프트웨어 요구사항

- **Docker**: 20.10 이상
- **Docker Compose**: 2.0 이상
- **Node.js**: 18.x 이상 (개발 환경)
- **Git**: 최신 버전

## 배포 방법

### 1. Docker를 사용한 배포 (권장)

#### 1.1 저장소 클론

```bash
git clone <repository-url>
cd commerce_erp
```

#### 1.2 환경 변수 설정

```bash
# .env 파일 생성
cp .env.example .env

# 환경 변수 편집
nano .env
```

**필수 환경 변수:**
```bash
# 데이터베이스 설정
DATABASE_HOST=mariadb
DATABASE_PORT=3306
DATABASE_USERNAME=accounting_user
DATABASE_PASSWORD=your_secure_password_here
DATABASE_NAME=commerce_erp

# JWT 설정 (32자 이상의 강력한 키 사용)
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=24h

# 암호화 설정 (32자 정확히)
ENCRYPTION_KEY=your_32_character_encryption_key

# 파일 업로드 설정
FILE_UPLOAD_MAX_SIZE=10485760
ALLOWED_FILE_EXTENSIONS=txt,json

# 서버 설정
PORT=3000
NODE_ENV=production

# 로깅 설정
LOG_LEVEL=info
```

#### 1.3 개발 환경 배포

```bash
# 개발 환경으로 시작
./scripts/deploy.sh development

# 또는 직접 Docker Compose 사용
docker-compose up -d
```

#### 1.4 프로덕션 환경 배포

```bash
# 프로덕션 환경으로 배포
./scripts/deploy.sh production

# 또는 직접 Docker Compose 사용
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 2. 수동 배포

#### 2.1 Node.js 환경 설정

```bash
# Node.js 18.x 설치 (Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 의존성 설치
npm ci --only=production
```

#### 2.2 MariaDB 설치 및 설정

```bash
# MariaDB 설치 (Ubuntu)
sudo apt update
sudo apt install mariadb-server

# MariaDB 보안 설정
sudo mysql_secure_installation

# 데이터베이스 및 사용자 생성
sudo mysql -u root -p
```

```sql
CREATE DATABASE commerce_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'accounting_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON commerce_erp.* TO 'accounting_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### 2.3 애플리케이션 빌드 및 실행

```bash
# 애플리케이션 빌드
npm run build

# PM2를 사용한 프로덕션 실행
npm install -g pm2
pm2 start dist/main.js --name "accounting-app"
pm2 startup
pm2 save
```

## 환경별 설정

### 개발 환경

**특징:**
- 핫 리로드 지원
- 상세한 로깅
- 개발용 데이터베이스 사용

**설정 파일:** `.env.development`

```bash
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_HOST=localhost
```

**실행 명령:**
```bash
docker-compose up -d
```

### 프로덕션 환경

**특징:**
- Nginx 리버스 프록시
- 로드 밸런싱
- SSL/TLS 지원
- 최적화된 로깅

**설정 파일:** `.env.production`

```bash
NODE_ENV=production
LOG_LEVEL=info
DATABASE_HOST=mariadb
```

**실행 명령:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 데이터베이스 설정

### 초기 데이터 설정

시스템 시작 시 자동으로 초기 데이터가 설정됩니다:

```sql
-- 기본 사업체
INSERT INTO companies (company_id, company_name) VALUES
('com_demo', '데모 사업체'),
('com_test', '테스트 사업체');

-- 기본 사용자 (비밀번호: admin123, business123)
INSERT INTO users (username, password_hash, user_type, company_id) VALUES
('admin', '$2b$10$...', 'ADMIN', NULL),
('demo_user', '$2b$10$...', 'BUSINESS_OWNER', 'com_demo');
```

### 데이터베이스 백업

```bash
# 백업 생성
docker-compose exec mariadb mysqldump -u root -p commerce_erp > backup.sql

# 백업 복원
docker-compose exec -T mariadb mysql -u root -p commerce_erp < backup.sql
```

## SSL/TLS 설정 (프로덕션)

### 1. SSL 인증서 준비

```bash
# Let's Encrypt 사용 (권장)
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com

# 또는 자체 서명 인증서 생성 (테스트용)
mkdir -p docker/nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout docker/nginx/ssl/key.pem \
  -out docker/nginx/ssl/cert.pem
```

### 2. Nginx 설정 업데이트

`docker/nginx/nginx.conf` 파일에서 HTTPS 섹션의 주석을 해제하고 설정:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # SSL 설정
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    
    location / {
        proxy_pass http://app;
        # ... 기타 프록시 설정
    }
}
```

## 모니터링 및 로깅

### 1. 헬스 체크

```bash
# 애플리케이션 상태 확인
curl http://localhost:3000/health

# Docker 컨테이너 상태 확인
docker-compose ps
```

### 2. 로그 모니터링

```bash
# 실시간 로그 확인
docker-compose logs -f app

# 특정 시간대 로그 확인
docker-compose logs --since="2025-07-20T10:00:00" app

# 로그 파일 위치 (수동 배포 시)
tail -f /var/log/accounting-app.log
```

### 3. 성능 모니터링

```bash
# 시스템 리소스 사용량 확인
docker stats

# 데이터베이스 성능 확인
docker-compose exec mariadb mysql -u root -p -e "SHOW PROCESSLIST;"
```

## 보안 설정

### 1. 방화벽 설정

```bash
# UFW 방화벽 설정 (Ubuntu)
sudo ufw enable
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw deny 3000/tcp   # 직접 앱 접근 차단
sudo ufw deny 3306/tcp   # 직접 DB 접근 차단
```

### 2. 환경 변수 보안

```bash
# 환경 변수 파일 권한 설정
chmod 600 .env
chmod 600 .env.production

# 소유자만 읽기 가능하도록 설정
chown root:root .env
```

### 3. 데이터베이스 보안

```sql
-- 불필요한 사용자 제거
DROP USER IF EXISTS ''@'localhost';
DROP USER IF EXISTS ''@'%';

-- root 원격 접근 차단
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');

-- 권한 새로고침
FLUSH PRIVILEGES;
```

## 백업 및 복구

### 1. 자동 백업 스크립트

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backup"
DATE=$(date +%Y%m%d_%H%M%S)

# 데이터베이스 백업
docker-compose exec -T mariadb mysqldump -u root -p$DATABASE_PASSWORD commerce_erp > $BACKUP_DIR/db_backup_$DATE.sql

# 파일 백업
tar -czf $BACKUP_DIR/files_backup_$DATE.tar.gz uploads/

# 오래된 백업 파일 정리 (30일 이상)
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

### 2. 크론탭 설정

```bash
# 매일 새벽 2시에 백업 실행
crontab -e
0 2 * * * /path/to/backup.sh
```

## 문제 해결

### 1. 일반적인 문제

#### 데이터베이스 연결 실패
```bash
# 데이터베이스 컨테이너 상태 확인
docker-compose ps mariadb

# 데이터베이스 로그 확인
docker-compose logs mariadb

# 연결 테스트
docker-compose exec mariadb mysql -u root -p -e "SELECT 1;"
```

#### 메모리 부족
```bash
# 메모리 사용량 확인
free -h
docker stats

# 스왑 파일 생성 (임시 해결)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### 디스크 공간 부족
```bash
# 디스크 사용량 확인
df -h

# Docker 이미지 정리
docker system prune -a

# 로그 파일 정리
docker-compose exec app find /app/logs -name "*.log" -mtime +7 -delete
```

### 2. 로그 분석

#### 애플리케이션 오류
```bash
# 오류 로그 필터링
docker-compose logs app | grep ERROR

# 특정 시간대 오류 확인
docker-compose logs --since="2025-07-20T10:00:00" app | grep ERROR
```

#### 성능 문제
```bash
# 느린 쿼리 로그 확인
docker-compose exec mariadb mysql -u root -p -e "SHOW VARIABLES LIKE 'slow_query_log';"

# 프로세스 목록 확인
docker-compose exec mariadb mysql -u root -p -e "SHOW FULL PROCESSLIST;"
```

## 업데이트 및 유지보수

### 1. 애플리케이션 업데이트

```bash
# 코드 업데이트
git pull origin main

# 의존성 업데이트
npm ci --only=production

# 이미지 재빌드 및 배포
docker-compose build --no-cache
docker-compose up -d
```

### 2. 데이터베이스 마이그레이션

```bash
# 마이그레이션 실행
docker-compose exec app npm run typeorm:migration:run

# 마이그레이션 롤백 (필요시)
docker-compose exec app npm run typeorm:migration:revert
```

### 3. 정기 유지보수

```bash
# 주간 유지보수 스크립트
#!/bin/bash

# 로그 파일 정리
find /var/log -name "*.log" -mtime +30 -delete

# Docker 이미지 정리
docker system prune -f

# 데이터베이스 최적화
docker-compose exec mariadb mysql -u root -p -e "OPTIMIZE TABLE commerce_erp.*;"

# 백업 확인
ls -la /backup/
```

## 성능 최적화

### 1. 데이터베이스 최적화

```sql
-- 인덱스 추가
CREATE INDEX idx_transactions_company_date ON transactions(company_id, transaction_date);
CREATE INDEX idx_transactions_category ON transactions(category_id);

-- 테이블 최적화
OPTIMIZE TABLE transactions;
OPTIMIZE TABLE classification_rules;
```

### 2. 애플리케이션 최적화

```bash
# Node.js 메모리 제한 설정
export NODE_OPTIONS="--max-old-space-size=2048"

# PM2 클러스터 모드 (수동 배포 시)
pm2 start dist/main.js -i max --name "accounting-app"
```

### 3. Nginx 최적화

```nginx
# nginx.conf에 추가
worker_processes auto;
worker_connections 1024;

# 압축 설정
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain application/json;

# 캐싱 설정
location /static/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## 지원 및 문의

- **문서**: `docs/` 디렉토리의 추가 문서 참조
- **API 문서**: `http://localhost:3000/api/docs`
- **GitHub Issues**: 프로젝트 저장소의 Issues 탭
- **로그 분석**: `docker-compose logs` 명령어 활용