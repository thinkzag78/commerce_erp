-- 연결 테스트 및 권한 확인 스크립트

USE commerce_erp;

-- 현재 사용자 정보 확인
SELECT USER(), CURRENT_USER();

-- commerce 사용자의 권한 확인
SHOW GRANTS FOR 'commerce'@'%';

-- 데이터베이스 목록 확인
SHOW DATABASES;

-- 테이블 목록 확인 (TypeORM이 생성한 후에 확인 가능)
-- SHOW TABLES;

-- 연결 상태 확인
SELECT 'MariaDB connection test successful' AS status;