import { Injectable } from '@nestjs/common';
import { UserType } from './entities/user.entity';
import { JwtPayload } from './auth.service';

@Injectable()
export class AuthUtilsService {
  /**
   * 사용자가 시스템 관리자인지 확인합니다.
   * @param user 사용자 정보
   * @returns 관리자 여부
   */
  isAdmin(user: JwtPayload): boolean {
    return user.userType === UserType.ADMIN;
  }

  /**
   * 사용자가 사업자인지 확인합니다.
   * @param user 사용자 정보
   * @returns 사업자 여부
   */
  isBusinessOwner(user: JwtPayload): boolean {
    return user.userType === UserType.BUSINESS_OWNER;
  }

  /**
   * 사용자가 특정 회사에 속해 있는지 확인합니다.
   * @param user 사용자 정보
   * @param companyId 회사 ID
   * @returns 회사 소속 여부
   */
  belongsToCompany(user: JwtPayload, companyId: string): boolean {
    return user.companyId === companyId;
  }

  /**
   * 사용자가 특정 회사의 데이터에 접근할 수 있는지 확인합니다.
   * @param user 사용자 정보
   * @param companyId 회사 ID
   * @returns 접근 가능 여부
   */
  canAccessCompanyData(user: JwtPayload, companyId: string): boolean {
    // 시스템 관리자는 모든 회사 데이터에 접근 가능
    if (this.isAdmin(user)) {
      return true;
    }

    // 사업자는 자신의 회사 데이터만 접근 가능
    if (this.isBusinessOwner(user)) {
      return this.belongsToCompany(user, companyId);
    }

    return false;
  }

  /**
   * 사용자가 다른 사용자의 데이터에 접근할 수 있는지 확인합니다.
   * @param currentUser 현재 사용자
   * @param targetUserId 대상 사용자 ID
   * @param targetUserCompanyId 대상 사용자의 회사 ID
   * @returns 접근 가능 여부
   */
  canAccessUserData(
    currentUser: JwtPayload,
    targetUserId: number,
    targetUserCompanyId?: string,
  ): boolean {
    // 자신의 데이터는 항상 접근 가능
    if (currentUser.userId === targetUserId) {
      return true;
    }

    // 시스템 관리자는 모든 사용자 데이터에 접근 가능
    if (this.isAdmin(currentUser)) {
      return true;
    }

    // 사업자는 같은 회사의 사용자 데이터만 접근 가능
    if (this.isBusinessOwner(currentUser) && targetUserCompanyId) {
      return this.belongsToCompany(currentUser, targetUserCompanyId);
    }

    return false;
  }

  /**
   * 사용자가 관리자 권한이 필요한 작업을 수행할 수 있는지 확인합니다.
   * @param user 사용자 정보
   * @returns 관리자 권한 여부
   */
  hasAdminPrivileges(user: JwtPayload): boolean {
    return this.isAdmin(user);
  }

  /**
   * 사용자의 데이터 접근 범위를 반환합니다.
   * @param user 사용자 정보
   * @returns 접근 가능한 회사 ID 배열 (관리자의 경우 null 반환 - 모든 회사 접근 가능)
   */
  getAccessibleCompanies(user: JwtPayload): string[] | null {
    if (this.isAdmin(user)) {
      return null; // 모든 회사 접근 가능
    }

    if (this.isBusinessOwner(user) && user.companyId) {
      return [user.companyId]; // 자신의 회사만 접근 가능
    }

    return []; // 접근 가능한 회사 없음
  }
}
