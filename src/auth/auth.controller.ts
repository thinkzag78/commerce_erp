import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { AuthService, LoginResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './auth.service';
import { UserType } from './entities/user.entity';
import {
  AppLoggerService,
  SecurityLogEvent,
} from '../common/logger/app-logger.service';
import { Request as RequestType } from 'express';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly appLoggerService: AppLoggerService,
  ) {}

  /**
   * 사용자 로그인
   * @param loginDto 로그인 정보
   * @param req HTTP 요청 객체
   * @returns JWT 토큰과 사용자 정보
   */
  @ApiOperation({
    summary: '사용자 로그인',
    description: '사용자명과 비밀번호로 로그인하여 JWT 토큰을 발급받습니다.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: '로그인 성공',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string', description: 'JWT 액세스 토큰' },
        user: {
          type: 'object',
          properties: {
            userId: { type: 'number', description: '사용자 ID' },
            username: { type: 'string', description: '사용자명' },
            userType: {
              type: 'string',
              enum: ['ADMIN', 'BUSINESS_OWNER'],
              description: '사용자 유형',
            },
            companyId: {
              type: 'string',
              nullable: true,
              description: '소속 회사 ID',
            },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: '인증 실패 - 잘못된 사용자명 또는 비밀번호',
  })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Request() req: RequestType,
  ): Promise<LoginResponse> {
    try {
      const result = await this.authService.signIn(
        loginDto.username,
        loginDto.password,
      );

      // 로그인 성공 로그
      this.appLoggerService.logSecurityEvent({
        userId: result.user.userId,
        event: SecurityLogEvent.LOGIN_SUCCESS,
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        details: `User ${loginDto.username} logged in successfully`,
      });

      return result;
    } catch (error) {
      // 로그인 실패 로그

      console.log(SecurityLogEvent.LOGIN_FAILED);
      this.appLoggerService.logSecurityEvent({
        event: SecurityLogEvent.LOGIN_FAILED,
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        details: `Failed login attempt for username: ${loginDto.username}`,
      });

      throw error;
    }
  }

  /**
   * 새로운 사용자 생성 (관리자만 가능)
   * @param createUserDto 사용자 생성 정보
   * @returns 생성된 사용자 정보
   */
  @ApiExcludeEndpoint()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.ADMIN)
  @Post('users')
  async createUser(@Body() createUserDto: CreateUserDto) {
    const user = await this.authService.createUser(
      createUserDto.username,
      createUserDto.password,
      createUserDto.userType,
      createUserDto.companyId,
    );

    return {
      message: '사용자가 성공적으로 생성되었습니다.',
      user: {
        userId: user.user_id,
        username: user.username,
        userType: user.user_type,
        companyId: user.company_id,
      },
    };
  }

  /**
   * 현재 로그인한 사용자 정보 조회
   * @param user 현재 사용자 정보
   * @returns 사용자 정보
   */
  @ApiExcludeEndpoint()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser() user: JwtPayload) {
    const userInfo = await this.authService.findUserById(user.userId);
    return {
      user: userInfo,
    };
  }

  /**
   * JWT 토큰 검증
   * @param user 현재 사용자 정보
   * @returns 토큰 유효성 확인 결과
   */
  @ApiExcludeEndpoint()
  @UseGuards(JwtAuthGuard)
  @Post('verify')
  verifyToken(@CurrentUser() user: JwtPayload) {
    return {
      valid: true,
      user,
    };
  }

  /**
   * 모든 사용자 목록 조회 (관리자만 가능)
   * @param user 현재 사용자 정보
   * @returns 사용자 목록
   */
  @ApiExcludeEndpoint()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.ADMIN)
  @Get('users')
  async getAllUsers(@CurrentUser() user: JwtPayload) {
    const users = await this.authService.getAllUsers();
    return {
      users: users.map((u) => ({
        userId: u.user_id,
        username: u.username,
        userType: u.user_type,
        companyId: u.company_id,
        createdAt: u.created_at,
      })),
    };
  }
}
