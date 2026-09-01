import { UserRole } from '@cmmp/shared';
import { AuditController } from './audit.controller';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('AuditController RBAC wiring', () => {
  // Regression: @Roles() was originally applied at the *class* decorator
  // level, but RolesGuard reads metadata off context.getHandler() (the
  // method), never context.getClass() -- so the required-roles list was
  // silently undefined and RolesGuard let every authenticated user through
  // (found via the e2e audit-log suite, which showed a READ_ONLY_VIEWER
  // seeing the full audit log). @Roles()/@UseGuards(RolesGuard) must be
  // set on each handler method, not just the controller class.
  it.each(['findAll', 'getSummary'] as const)('%s carries @Roles() metadata directly on the handler', (method) => {
    const roles = Reflect.getMetadata(ROLES_KEY, AuditController.prototype[method]);
    expect(roles).toEqual(
      expect.arrayContaining([UserRole.PLATFORM_ADMIN, UserRole.ORGANISATION_ADMIN, UserRole.AUDITOR, UserRole.CISO]),
    );
  });
});
