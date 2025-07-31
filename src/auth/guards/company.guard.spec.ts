import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CompanyGuard } from './company.guard';
import { UserType } from '../entities/user.entity';

describe('CompanyGuard', () => {
  let guard: CompanyGuard;
  let reflector: Reflector;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<CompanyGuard>(CompanyGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (
    user: any,
    params = {},
    query = {},
    body = {},
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user, params, query, body }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as any;
  };

  describe('canActivate', () => {
    it('사용자가 인증되지 않은 경우 접근을 거부해야 합니다', () => {
      // Given
      const context = createMockExecutionContext(null);

      // When
      const result = guard.canActivate(context);

      // Then
      expect(result).toBe(false);
    });

    it('시스템 관리자는 모든 회사 데이터에 접근할 수 있어야 합니다', () => {
      // Given
      const user = {
        userId: 1,
        username: 'admin',
        userType: UserType.ADMIN,
      };
      const context = createMockExecutionContext(user);

      // When
      const result = guard.canActivate(context);

      // Then
      expect(result).toBe(true);
    });

    it('회사 ID가 없는 사업자는 접근이 거부되어야 합니다', () => {
      // Given
      const user = {
        userId: 1,
        username: 'business',
        userType: UserType.BUSINESS_OWNER,
        companyId: undefined,
      };
      const context = createMockExecutionContext(user);

      // When & Then
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        '회사 정보가 없는 사용자는 접근할 수 없습니다.',
      );
    });

    it('사업자가 자신의 회사 데이터에 접근하는 경우 허용되어야 합니다', () => {
      // Given
      const user = {
        userId: 1,
        username: 'business',
        userType: UserType.BUSINESS_OWNER,
        companyId: 'company1',
      };
      const context = createMockExecutionContext(user, {
        companyId: 'company1',
      });

      // When
      const result = guard.canActivate(context);

      // Then
      expect(result).toBe(true);
    });

    it('사업자가 다른 회사 데이터에 접근하는 경우 거부되어야 합니다', () => {
      // Given
      const user = {
        userId: 1,
        username: 'business',
        userType: UserType.BUSINESS_OWNER,
        companyId: 'company1',
      };
      const context = createMockExecutionContext(user, {
        companyId: 'company2',
      });

      // When & Then
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        '다른 회사의 데이터에 접근할 수 없습니다.',
      );
    });

    it('요청에 회사 ID가 없는 경우 사업자 접근을 허용해야 합니다', () => {
      // Given
      const user = {
        userId: 1,
        username: 'business',
        userType: UserType.BUSINESS_OWNER,
        companyId: 'company1',
      };
      const context = createMockExecutionContext(user);

      // When
      const result = guard.canActivate(context);

      // Then
      expect(result).toBe(true);
    });

    it('쿼리 파라미터에서 회사 ID를 확인해야 합니다', () => {
      // Given
      const user = {
        userId: 1,
        username: 'business',
        userType: UserType.BUSINESS_OWNER,
        companyId: 'company1',
      };
      const context = createMockExecutionContext(
        user,
        {},
        { companyId: 'company1' },
      );

      // When
      const result = guard.canActivate(context);

      // Then
      expect(result).toBe(true);
    });

    it('요청 바디에서 회사 ID를 확인해야 합니다', () => {
      // Given
      const user = {
        userId: 1,
        username: 'business',
        userType: UserType.BUSINESS_OWNER,
        companyId: 'company1',
      };
      const context = createMockExecutionContext(
        user,
        {},
        {},
        { companyId: 'company1' },
      );

      // When
      const result = guard.canActivate(context);

      // Then
      expect(result).toBe(true);
    });
  });
});
