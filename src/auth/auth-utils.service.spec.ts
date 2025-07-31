import { Test, TestingModule } from '@nestjs/testing';
import { AuthUtilsService } from './auth-utils.service';
import { UserType } from './entities/user.entity';
import { JwtPayload } from './auth.service';

describe('AuthUtilsService', () => {
  let service: AuthUtilsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthUtilsService],
    }).compile();

    service = module.get<AuthUtilsService>(AuthUtilsService);
  });

  const adminUser: JwtPayload = {
    userId: 1,
    username: 'admin',
    userType: UserType.ADMIN,
  };

  const businessUser: JwtPayload = {
    userId: 2,
    username: 'business',
    userType: UserType.BUSINESS_OWNER,
    companyId: 'company1',
  };

  describe('isAdmin', () => {
    it('관리자 사용자에 대해 true를 반환해야 합니다', () => {
      expect(service.isAdmin(adminUser)).toBe(true);
    });

    it('사업자 사용자에 대해 false를 반환해야 합니다', () => {
      expect(service.isAdmin(businessUser)).toBe(false);
    });
  });

  describe('isBusinessOwner', () => {
    it('사업자 사용자에 대해 true를 반환해야 합니다', () => {
      expect(service.isBusinessOwner(businessUser)).toBe(true);
    });

    it('관리자 사용자에 대해 false를 반환해야 합니다', () => {
      expect(service.isBusinessOwner(adminUser)).toBe(false);
    });
  });

  describe('belongsToCompany', () => {
    it('같은 회사 ID인 경우 true를 반환해야 합니다', () => {
      expect(service.belongsToCompany(businessUser, 'company1')).toBe(true);
    });

    it('다른 회사 ID인 경우 false를 반환해야 합니다', () => {
      expect(service.belongsToCompany(businessUser, 'company2')).toBe(false);
    });
  });

  describe('canAccessCompanyData', () => {
    it('관리자는 모든 회사 데이터에 접근할 수 있어야 합니다', () => {
      expect(service.canAccessCompanyData(adminUser, 'company1')).toBe(true);
      expect(service.canAccessCompanyData(adminUser, 'company2')).toBe(true);
    });

    it('사업자는 자신의 회사 데이터에만 접근할 수 있어야 합니다', () => {
      expect(service.canAccessCompanyData(businessUser, 'company1')).toBe(true);
      expect(service.canAccessCompanyData(businessUser, 'company2')).toBe(false);
    });
  });

  describe('canAccessUserData', () => {
    it('자신의 데이터는 항상 접근할 수 있어야 합니다', () => {
      expect(service.canAccessUserData(businessUser, 2, 'company1')).toBe(true);
    });

    it('관리자는 모든 사용자 데이터에 접근할 수 있어야 합니다', () => {
      expect(service.canAccessUserData(adminUser, 2, 'company1')).toBe(true);
      expect(service.canAccessUserData(adminUser, 3, 'company2')).toBe(true);
    });

    it('사업자는 같은 회사의 사용자 데이터에만 접근할 수 있어야 합니다', () => {
      expect(service.canAccessUserData(businessUser, 3, 'company1')).toBe(true);
      expect(service.canAccessUserData(businessUser, 4, 'company2')).toBe(false);
    });

    it('사업자는 다른 사용자의 회사 정보가 없으면 접근할 수 없어야 합니다', () => {
      expect(service.canAccessUserData(businessUser, 5)).toBe(false);
    });
  });

  describe('hasAdminPrivileges', () => {
    it('관리자는 관리자 권한을 가져야 합니다', () => {
      expect(service.hasAdminPrivileges(adminUser)).toBe(true);
    });

    it('사업자는 관리자 권한을 가지지 않아야 합니다', () => {
      expect(service.hasAdminPrivileges(businessUser)).toBe(false);
    });
  });

  describe('getAccessibleCompanies', () => {
    it('관리자는 null을 반환해야 합니다 (모든 회사 접근 가능)', () => {
      expect(service.getAccessibleCompanies(adminUser)).toBeNull();
    });

    it('사업자는 자신의 회사 ID 배열을 반환해야 합니다', () => {
      expect(service.getAccessibleCompanies(businessUser)).toEqual(['company1']);
    });

    it('회사 ID가 없는 사업자는 빈 배열을 반환해야 합니다', () => {
      const userWithoutCompany: JwtPayload = {
        userId: 3,
        username: 'business2',
        userType: UserType.BUSINESS_OWNER,
      };
      expect(service.getAccessibleCompanies(userWithoutCompany)).toEqual([]);
    });
  });
});