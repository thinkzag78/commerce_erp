#!/bin/bash

# 자동 회계 처리 시스템 배포 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 환경 변수 확인
check_env() {
    log_info "환경 변수 확인 중..."
    
    if [ ! -f .env ]; then
        log_error ".env 파일이 존재하지 않습니다. .env.example을 참고하여 생성하세요."
        exit 1
    fi
    
    # 필수 환경 변수 확인
    required_vars=("DATABASE_PASSWORD" "JWT_SECRET" "ENCRYPTION_KEY")
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" .env; then
            log_error "필수 환경 변수 ${var}가 설정되지 않았습니다."
            exit 1
        fi
    done
    
    log_info "환경 변수 확인 완료"
}

# Docker 및 Docker Compose 확인
check_docker() {
    log_info "Docker 환경 확인 중..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker가 설치되지 않았습니다."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose가 설치되지 않았습니다."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker 데몬이 실행되지 않았습니다."
        exit 1
    fi
    
    log_info "Docker 환경 확인 완료"
}

# 애플리케이션 빌드
build_app() {
    log_info "애플리케이션 빌드 중..."
    
    # 이전 이미지 정리
    docker-compose down --remove-orphans
    docker system prune -f
    
    # 새 이미지 빌드
    docker-compose build --no-cache
    
    log_info "애플리케이션 빌드 완료"
}

# 데이터베이스 마이그레이션
migrate_db() {
    log_info "데이터베이스 마이그레이션 실행 중..."
    
    # MariaDB 컨테이너 시작
    docker-compose up -d mariadb
    
    # 데이터베이스 준비 대기
    log_info "데이터베이스 준비 대기 중..."
    sleep 30
    
    # 마이그레이션 실행 (TypeORM 동기화)
    docker-compose run --rm app npm run typeorm:sync
    
    log_info "데이터베이스 마이그레이션 완료"
}

# 애플리케이션 시작
start_app() {
    log_info "애플리케이션 시작 중..."
    
    # 모든 서비스 시작
    docker-compose up -d
    
    # 헬스 체크 대기
    log_info "애플리케이션 헬스 체크 중..."
    sleep 10
    
    # 헬스 체크
    max_attempts=30
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f http://localhost:3000/health &> /dev/null; then
            log_info "애플리케이션이 성공적으로 시작되었습니다!"
            break
        fi
        
        log_warn "헬스 체크 실패 (시도 $attempt/$max_attempts)"
        sleep 5
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        log_error "애플리케이션 시작에 실패했습니다."
        docker-compose logs app
        exit 1
    fi
}

# 배포 상태 확인
check_status() {
    log_info "배포 상태 확인 중..."
    
    echo "=== 컨테이너 상태 ==="
    docker-compose ps
    
    echo -e "\n=== 애플리케이션 로그 (최근 20줄) ==="
    docker-compose logs --tail=20 app
    
    echo -e "\n=== 데이터베이스 상태 ==="
    docker-compose exec mariadb mysql -u root -p${DATABASE_PASSWORD} -e "SHOW DATABASES;"
}

# 메인 함수
main() {
    log_info "자동 회계 처리 시스템 배포 시작"
    
    # 환경 설정
    ENVIRONMENT=${1:-development}
    
    case $ENVIRONMENT in
        "production")
            export COMPOSE_FILE="docker-compose.yml:docker-compose.prod.yml"
            ;;
        "development")
            export COMPOSE_FILE="docker-compose.yml:docker-compose.override.yml"
            ;;
        *)
            log_error "지원하지 않는 환경입니다: $ENVIRONMENT"
            log_info "사용법: $0 [development|production]"
            exit 1
            ;;
    esac
    
    log_info "배포 환경: $ENVIRONMENT"
    
    # 배포 단계 실행
    check_env
    check_docker
    build_app
    
    if [ "$ENVIRONMENT" = "production" ]; then
        migrate_db
    fi
    
    start_app
    check_status
    
    log_info "배포 완료!"
    log_info "애플리케이션 URL: http://localhost:3000"
    log_info "API 문서: http://localhost:3000/api/docs"
}

# 스크립트 실행
main "$@"