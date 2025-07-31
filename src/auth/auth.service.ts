import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserType } from './entities/user.entity';

export interface JwtPayload {
  userId: number;
  username: string;
  userType: UserType;
  companyId?: string;
}

export interface LoginResponse {
  access_token: string;
  user: {
    userId: number;
    username: string;
    userType: UserType;
    companyId?: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  /**
   * 사용자 인증을 수행합니다.
   * @param username 사용자명
   * @param password 비밀번호
   * @returns 인증된 사용자 정보 (비밀번호 제외)
   */
  async validateUser(
    username: string,
    password: string,
  ): Promise<Omit<User, 'password_hash'> | null> {
    const user = await this.userRepository.findOne({
      where: { username },
      relations: ['company'],
    });

    if (user && (await bcrypt.compare(password, user.password_hash))) {
      const { password_hash, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * JWT 토큰을 생성하고 로그인 응답을 반환합니다.
   * @param user 인증된 사용자 정보
   * @returns 로그인 응답 (토큰 및 사용자 정보)
   */
  login(user: Omit<User, 'password_hash'>): LoginResponse {
    const payload: JwtPayload = {
      userId: user.user_id,
      username: user.username,
      userType: user.user_type,
      companyId: user.company_id || undefined,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        userId: user.user_id,
        username: user.username,
        userType: user.user_type,
        companyId: user.company_id || undefined,
      },
    };
  }

  /**
   * 사용자명과 비밀번호로 로그인을 수행합니다.
   * @param username 사용자명
   * @param password 비밀번호
   * @returns 로그인 응답
   * @throws UnauthorizedException 인증 실패 시
   */
  async signIn(username: string, password: string): Promise<LoginResponse> {
    const user = await this.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException('잘못된 사용자명 또는 비밀번호입니다.');
    }
    return this.login(user);
  }

  /**
   * 새로운 사용자를 생성합니다.
   * @param username 사용자명
   * @param password 비밀번호
   * @param userType 사용자 타입
   * @param companyId 회사 ID (선택사항)
   * @returns 생성된 사용자 정보
   */
  async createUser(
    username: string,
    password: string,
    userType: UserType,
    companyId?: string,
  ): Promise<Omit<User, 'password_hash'>> {
    // 비밀번호 해시화
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // 사용자 생성
    const user = this.userRepository.create({
      username,
      password_hash,
      user_type: userType,
      company_id: companyId,
    });

    const savedUser = await this.userRepository.save(user);
    const { password_hash: _, ...result } = savedUser;
    return result;
  }

  /**
   * 사용자 ID로 사용자를 조회합니다.
   * @param userId 사용자 ID
   * @returns 사용자 정보 (비밀번호 제외)
   */
  async findUserById(
    userId: number,
  ): Promise<Omit<User, 'password_hash'> | null> {
    const user = await this.userRepository.findOne({
      where: { user_id: userId },
      relations: ['company'],
    });

    if (user) {
      return user;
    }
    return null;
  }

  /**
   * JWT 토큰을 검증하고 페이로드를 반환합니다.
   * @param token JWT 토큰
   * @returns JWT 페이로드
   */
  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
  }

  /**
   * 모든 사용자를 조회합니다 (관리자용).
   * @returns 모든 사용자 목록 (비밀번호 제외)
   */
  async getAllUsers(): Promise<Omit<User, 'password_hash'>[]> {
    const users = await this.userRepository.find({
      relations: ['company'],
      order: { created_at: 'DESC' },
    });

    return users.map((user) => {
      const { password_hash, ...result } = user;
      return result;
    });
  }
}
