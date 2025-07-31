import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserType } from '../entities/user.entity';
import { JwtPayload } from '../auth.service';
import { Request } from 'express';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 메타데이터에서 필요한 역할들을 가져옴
    const requiredRoles = this.reflector.getAllAndOverride<UserType[]>(
      'roles',
      [context.getHandler(), context.getClass()],
    );

    // 역할이 지정되지 않은 경우 접근 허용
    if (!requiredRoles) {
      return true;
    }

    // 요청에서 사용자 정보 추출
    const request: Request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    // 사용자가 인증되지 않은 경우 접근 거부
    if (!user) {
      return false;
    }

    // 사용자의 역할이 필요한 역할 중 하나와 일치하는지 확인
    return requiredRoles.includes(user.userType);
  }
}
