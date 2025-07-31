import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { UserType } from '../entities/user.entity';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (user: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as any;
  };

  describe('canActivate', () => {
    it('역할이 지정되지 않은 경우 접근을 허용해야 합니다', () => {
      // Given
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      const context = createMockExecutionContext({});

      // When
      const result = guard.canActivate(context);

      // Then
      expect(result).toBe(true);
    });

    it('사용자가 인증되지 않은 경우 접근을 거부해야 합니다', () => {
      // Given
      mockReflector.getAllAndOverride.mockReturnValue([UserType.ADMIN]);
      const context = createMockExecutionContext(null);

      // When
      const result = guard.canActivate(context);

      // Then
      expect(result).toBe(false);
    });

    it('관리자 역할이 필요하고 사용자가 관리자인 경우 접근을 허용해야 합니다', () => {
      // Given
      mockReflector.getAllAndOverride.mockReturnValue([UserType.ADMIN]);
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

    it('관리자 역할이 필요하지만 사용자가 사업자인 경우 접근을 거부해야 합니다', () => {
      // Given
      mockReflector.getAllAndOverride.mockReturnValue([UserType.ADMIN]);
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
      expect(result).toBe(false);
    });

    it('여러 역할 중 하나와 일치하는 경우 접근을 허용해야 합니다', () => {
      // Given
      mockReflector.getAllAndOverride.mockReturnValue([
        UserType.ADMIN,
        UserType.BUSINESS_OWNER,
      ]);
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
  });
});