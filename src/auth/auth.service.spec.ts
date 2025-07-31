import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User, UserType } from './entities/user.entity';

// bcrypt 모킹
jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let jwtService: JwtService;

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    const mockUser: User = {
      user_id: 1,
      username: 'testuser',
      password_hash: 'hashedpassword',
      user_type: UserType.BUSINESS_OWNER,
      company_id: 'company1',
      company: undefined as any,
      file_upload_logs: [],
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('유효한 사용자 정보로 인증에 성공해야 합니다', async () => {
      // Given
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(true as never);

      // When
      const result = await service.validateUser('testuser', 'password');

      // Then
      expect(result).toBeDefined();
      expect(result?.username).toBe('testuser');
      expect(result?.user_type).toBe(UserType.BUSINESS_OWNER);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { username: 'testuser' },
        relations: ['company'],
      });
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(
        'password',
        'hashedpassword',
      );
    });

    it('잘못된 비밀번호로 인증에 실패해야 합니다', async () => {
      // Given
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(false as never);

      // When
      const result = await service.validateUser('testuser', 'wrongpassword');

      // Then
      expect(result).toBeNull();
    });

    it('존재하지 않는 사용자로 인증에 실패해야 합니다', async () => {
      // Given
      mockUserRepository.findOne.mockResolvedValue(null);

      // When
      const result = await service.validateUser('nonexistent', 'password');

      // Then
      expect(result).toBeNull();
      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const mockUser = {
      user_id: 1,
      username: 'testuser',
      user_type: UserType.BUSINESS_OWNER,
      company_id: 'company1',
    } as any;

    it('JWT 토큰을 생성하고 로그인 응답을 반환해야 합니다', async () => {
      // Given
      const mockToken = 'jwt-token';
      mockJwtService.sign.mockReturnValue(mockToken);

      // When
      const result =  service.login(mockUser);

      // Then
      expect(result).toEqual({
        access_token: mockToken,
        user: {
          userId: 1,
          username: 'testuser',
          userType: UserType.BUSINESS_OWNER,
          companyId: 'company1',
        },
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        userId: 1,
        username: 'testuser',
        userType: UserType.BUSINESS_OWNER,
        companyId: 'company1',
      });
    });
  });

  describe('signIn', () => {
    it('유효한 자격 증명으로 로그인에 성공해야 합니다', async () => {
      // Given
      const mockUser = {
        user_id: 1,
        username: 'testuser',
        user_type: UserType.BUSINESS_OWNER,
        company_id: 'company1',
      } as any;
      const mockToken = 'jwt-token';

      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        password_hash: 'hashedpassword',
      });
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockJwtService.sign.mockReturnValue(mockToken);

      // When
      const result = await service.signIn('testuser', 'password');

      // Then
      expect(result.access_token).toBe(mockToken);
      expect(result.user.username).toBe('testuser');
    });

    it('잘못된 자격 증명으로 UnauthorizedException을 발생시켜야 합니다', async () => {
      // Given
      jest.spyOn(service, 'validateUser').mockResolvedValue(null);

      // When & Then
      await expect(service.signIn('testuser', 'wrongpassword')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.signIn('testuser', 'wrongpassword')).rejects.toThrow(
        '잘못된 사용자명 또는 비밀번호입니다.',
      );
    });
  });

  describe('createUser', () => {
    it('새로운 사용자를 생성해야 합니다', async () => {
      // Given
      const hashedPassword = 'hashedpassword';
      const mockCreatedUser: User = {
        user_id: 1,
        username: 'newuser',
        password_hash: hashedPassword,
        user_type: UserType.BUSINESS_OWNER,
        company_id: 'company1',
        company: undefined as any,
        file_upload_logs: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockedBcrypt.hash.mockResolvedValue(hashedPassword as never);
      mockUserRepository.create.mockReturnValue(mockCreatedUser);
      mockUserRepository.save.mockResolvedValue(mockCreatedUser);

      // When
      const result = await service.createUser(
        'newuser',
        'password',
        UserType.BUSINESS_OWNER,
        'company1',
      );

      // Then
      expect(result.username).toBe('newuser');
      expect(result.user_type).toBe(UserType.BUSINESS_OWNER);
      expect(mockedBcrypt.hash).toHaveBeenCalledWith('password', 10);
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        username: 'newuser',
        password_hash: hashedPassword,
        user_type: UserType.BUSINESS_OWNER,
        company_id: 'company1',
      });
    });
  });

  describe('findUserById', () => {
    it('사용자 ID로 사용자를 조회해야 합니다', async () => {
      // Given
      const mockUser: User = {
        user_id: 1,
        username: 'testuser',
        password_hash: 'hashedpassword',
        user_type: UserType.BUSINESS_OWNER,
        company_id: 'company1',
        company: undefined as any,
        file_upload_logs: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      // When
      const result = await service.findUserById(1);

      // Then
      expect(result?.username).toBe('testuser');
      expect(result?.user_type).toBe(UserType.BUSINESS_OWNER);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { user_id: 1 },
        relations: ['company'],
      });
    });

    it('존재하지 않는 사용자 ID로 null을 반환해야 합니다', async () => {
      // Given
      mockUserRepository.findOne.mockResolvedValue(null);

      // When
      const result = await service.findUserById(999);

      // Then
      expect(result).toBeNull();
    });
  });

  describe('verifyToken', () => {
    it('유효한 토큰을 검증해야 합니다', async () => {
      // Given
      const mockPayload = {
        userId: 1,
        username: 'testuser',
        userType: UserType.BUSINESS_OWNER,
        companyId: 'company1',
      };
      mockJwtService.verify.mockReturnValue(mockPayload);

      // When
      const result = await service.verifyToken('valid-token');

      // Then
      expect(result).toEqual(mockPayload);
      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-token');
    });

    it('유효하지 않은 토큰으로 UnauthorizedException을 발생시켜야 합니다', async () => {
      // Given
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // When & Then
      await expect(service.verifyToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.verifyToken('invalid-token')).rejects.toThrow(
        '유효하지 않은 토큰입니다.',
      );
    });
  });
});
