-- 자동 회계 처리 시스템 데이터베이스 초기화 스크립트

-- 데이터베이스 생성 (이미 docker-compose에서 생성되지만 확인용)
CREATE DATABASE IF NOT EXISTS commerce_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

USE commerce_erp;

-- 권한 설정 (Docker 컨테이너 간 통신을 위한 설정)
-- 1. 모든 호스트에서의 접근 허용 (Docker 네트워크용)
GRANT ALL PRIVILEGES ON commerce_erp.* TO 'commerce'@'%';

-- 2. 특정 Docker 네트워크 서브넷에서의 접근 허용 (보안 강화)
-- Docker Compose는 기본적으로 172.x.x.x 대역을 사용
GRANT ALL PRIVILEGES ON commerce_erp.* TO 'commerce'@'172.%';

-- 3. localhost에서의 접근 허용 (컨테이너 내부 접근용)
GRANT ALL PRIVILEGES ON commerce_erp.* TO 'commerce'@'localhost';

-- 4. 컨테이너 이름으로의 접근 허용
GRANT ALL PRIVILEGES ON commerce_erp.* TO 'commerce'@'commerce_erp';
GRANT ALL PRIVILEGES ON commerce_erp.* TO 'commerce'@'app';

-- 권한 적용
FLUSH PRIVILEGES;

-- 사용자 확인 (디버깅용)
SELECT User, Host FROM mysql.user WHERE User = 'commerce';

-- 참고: 실제 테이블 생성과 데이터 삽입은 NestJS TypeORM에서 처리됩니다.
-- synchronize: true 설정으로 인해 애플리케이션 시작 시 자동으로 테이블이 생성됩니다.
-- 초기 데이터는 DatabaseSeederService에서 처리됩니다.