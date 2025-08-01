-- 자동 회계 처리 시스템 데이터베이스 초기화 스크립트

-- 데이터베이스 생성 (이미 docker-compose에서 생성되지만 확인용)
CREATE DATABASE IF NOT EXISTS commerce_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE commerce_erp;

-- 기본 사업체 데이터 삽입
INSERT IGNORE INTO companies (company_id, company_name, created_at, updated_at) VALUES
('com_demo', '데모 사업체', NOW(), NOW()),
('com_test', '테스트 사업체', NOW(), NOW());

-- 기본 계정과목 데이터 삽입
INSERT IGNORE INTO categories (category_id, company_id, category_name, created_at, updated_at) VALUES
('cat_demo_sales', 'com_demo', '매출', NOW(), NOW()),
('cat_demo_food', 'com_demo', '식비', NOW(), NOW()),
('cat_demo_office', 'com_demo', '사무용품비', NOW(), NOW()),
('cat_demo_transport', 'com_demo', '교통비', NOW(), NOW()),
('cat_test_sales', 'com_test', '매출', NOW(), NOW()),
('cat_test_expense', 'com_test', '일반비용', NOW(), NOW());

-- 기본 사용자 데이터 삽입 (비밀번호: admin123, business123)
INSERT IGNORE INTO users (username, password_hash, user_type, company_id, created_at, updated_at) VALUES
('admin', '$2b$10$rQZ8kHWKQVnqVQZ8kHWKQOvAG0ELBb1KpHRgBoUYAKD5ykOxDWMWAQ', 'ADMIN', NULL, NOW(), NOW()),
('demo_user', '$2b$10$rQZ8kHWKQVnqVQZ8kHWKQOvAG0ELBb1KpHRgBoUYAKD5ykOxDWMWAQ', 'BUSINESS_OWNER', 'com_demo', NOW(), NOW()),
('test_user', '$2b$10$rQZ8kHWKQVnqVQZ8kHWKQOvAG0ELBb1KpHRgBoUYAKD5ykOxDWMWAQ', 'BUSINESS_OWNER', 'com_test', NOW(), NOW());

-- 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_transactions_company_date ON transactions(company_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_classification_rules_company ON classification_rules(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_rule_keywords_rule_type ON rule_keywords(rule_id, keyword_type);
CREATE INDEX IF NOT EXISTS idx_file_upload_logs_user_date ON file_upload_logs(user_id, uploaded_at);

-- 권한 설정
GRANT ALL PRIVILEGES ON commerce_erp.* TO 'commerce'@'%';
FLUSH PRIVILEGES;