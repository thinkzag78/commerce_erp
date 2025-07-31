import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserType } from '../entities/user.entity';
import { JwtPayload } from '../auth.service';
import { Request } from 'express';

@Injectable()
export class CompanyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request: Request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    // 사용자가 인증되지 않은 경우 접근 거부
    if (!user) {
      return false;
    }

    // 시스템 관리자는 모든 회사 데이터에 접근 가능
    if (user.userType === UserType.ADMIN) {
      return true;
    }

    // 사업자는 자신의 회사 데이터만 접근 가능
    if (user.userType === UserType.BUSINESS_OWNER) {
      // 회사 ID가 없는 사업자는 접근 거부
      if (!user.companyId) {
        throw new ForbiddenException(
          '회사 정보가 없는 사용자는 접근할 수 없습니다.',
        );
      }

      // 요청 파라미터나 바디에서 회사 ID 확인
      const requestedCompanyId = this.extractCompanyId(request);

      // 요청된 회사 ID가 있고 사용자의 회사 ID와 다른 경우 접근 거부
      if (requestedCompanyId && requestedCompanyId !== user.companyId) {
        throw new ForbiddenException(
          '다른 회사의 데이터에 접근할 수 없습니다.',
        );
      }

      return true;
    }

    return false;
  }

  /**
   * 요청에서 회사 ID를 추출합니다.
   * @param request HTTP 요청 객체
   * @returns 회사 ID 또는 null
   */
  private extractCompanyId(request: Request): string | null {
    // URL 파라미터에서 회사 ID 확인
    if (request.params?.companyId) {
      return request.params.companyId;
    }

    // 쿼리 파라미터에서 회사 ID 확인
    if (request.query?.companyId) {
      return request.query.companyId as string;
    }

    // 요청 바디에서 회사 ID 확인
    if (request.body?.companyId) {
      return request.body.companyId as string;
    }

    return null;
  }
}
