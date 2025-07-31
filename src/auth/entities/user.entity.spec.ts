import { User, UserType } from './user.entity';
import { Company } from './company.entity';

describe('User Entity', () => {
  it('should create a user instance', () => {
    const user = new User();
    user.username = 'testuser';
    user.password_hash = 'hashedpassword';
    user.user_type = UserType.BUSINESS_OWNER;
    user.company_id = 'com_1';

    expect(user.username).toBe('testuser');
    expect(user.user_type).toBe(UserType.BUSINESS_OWNER);
    expect(user.company_id).toBe('com_1');
  });

  it('should have correct enum values', () => {
    expect(UserType.ADMIN).toBe('ADMIN');
    expect(UserType.BUSINESS_OWNER).toBe('BUSINESS_OWNER');
  });

  it('should allow nullable company_id for admin users', () => {
    const adminUser = new User();
    adminUser.username = 'admin';
    adminUser.password_hash = 'hashedpassword';
    adminUser.user_type = UserType.ADMIN;
    adminUser.company_id = null;

    expect(adminUser.company_id).toBeNull();
    expect(adminUser.user_type).toBe(UserType.ADMIN);
  });
});