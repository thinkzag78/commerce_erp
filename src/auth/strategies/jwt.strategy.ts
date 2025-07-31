import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService, JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret',
    });
  }

  /**
   * JWT 토큰의 페이로드를 검증하고 사용자 정보를 반환합니다.
   * @param payload JWT 페이로드
   * @returns 검증된 사용자 정보
   */
  async validate(payload: JwtPayload) {
    // 사용자가 여전히 존재하는지 확인
    const user = await this.authService.findUserById(payload.userId);
    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    // 토큰의 정보와 실제 사용자 정보가 일치하는지 확인
    if (
      user.username !== payload.username ||
      user.user_type !== payload.userType
    ) {
      throw new UnauthorizedException('토큰 정보가 일치하지 않습니다.');
    }

    // company_id는 ADMIN 사용자의 경우 null일 수 있으므로 별도 검증
    if (user.user_type !== 'ADMIN' && user.company_id !== payload.companyId) {
      throw new UnauthorizedException('회사 정보가 일치하지 않습니다.');
    }

    return {
      userId: payload.userId,
      username: payload.username,
      userType: payload.userType,
      companyId: payload.companyId,
    };
  }
}