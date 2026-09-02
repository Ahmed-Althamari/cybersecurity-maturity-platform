import { UserRole } from '@cmmp/shared';

import { ROLES_KEY } from '../auth/decorators/roles.decorator';

import { SettingsController } from './settings.controller';

describe('SettingsController RBAC wiring', () => {
  // Same regression class as AuditController's (see its spec): @Roles()
  // must be applied to each handler method directly, since RolesGuard only
  // ever reads metadata off context.getHandler(), never the controller
  // class. These settings configure a shared, installation-wide integration
  // credential -- letting any authenticated user reach them (the exact
  // failure mode that once affected the audit log) would be a much worse
  // bug here than there.
  it.each(['getIntegrationSettings', 'setAnthropicApiKey', 'clearAnthropicApiKey'] as const)(
    '%s carries @Roles(PLATFORM_ADMIN) metadata directly on the handler',
    (method) => {
      const roles = Reflect.getMetadata(ROLES_KEY, SettingsController.prototype[method]);
      expect(roles).toEqual([UserRole.PLATFORM_ADMIN]);
    },
  );
});
