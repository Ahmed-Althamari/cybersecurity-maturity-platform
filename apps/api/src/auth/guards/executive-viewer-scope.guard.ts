import { UserRole } from '@cmmp/shared';
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

import { EXECUTIVE_DASHBOARD_ACCESSIBLE_KEY } from '../decorators/executive-dashboard-accessible.decorator';

/**
 * EXECUTIVE_VIEWER is documented (docs/architecture.md) as "executive
 * dashboard only" -- distinct from READ_ONLY_VIEWER's full read access.
 * That restriction was never enforced (docs/threat-model.md's ranked gap
 * #4): the role behaved identically to READ_ONLY_VIEWER on every endpoint.
 * This guard is the enforcement's actual logic, kept as its own
 * independently-testable class -- but it is NOT registered as a global
 * (APP_GUARD) guard. NestJS runs global guards *before* controller-scoped
 * ones, so a global guard here would run before JwtAuthGuard (controller-
 * scoped) has populated `request.user`, always seeing it as undefined and
 * silently never enforcing anything (confirmed live against the real API
 * before this was caught: an EXECUTIVE_VIEWER-only token got a real 200,
 * not the intended 403, from GET /assessments/:id and GET /users).
 * JwtAuthGuard composes this guard's `canActivate` directly, after its own
 * Passport verification has set `request.user` -- see that file.
 *
 * Only restricts a token whose *only* role is EXECUTIVE_VIEWER -- a user
 * who also holds a broader role (e.g. GRC_MANAGER) keeps that role's
 * access, matching how every other guard in this codebase treats
 * multi-role users (see RolesGuard).
 */
@Injectable()
export class ExecutiveViewerScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      return true;
    }

    const roles: string[] = user.roles?.length ? user.roles : [user.role];
    const isExecutiveViewerOnly = roles.length === 1 && roles[0] === UserRole.EXECUTIVE_VIEWER;
    if (!isExecutiveViewerOnly) {
      return true;
    }

    const isAccessible = Reflect.getMetadata(EXECUTIVE_DASHBOARD_ACCESSIBLE_KEY, context.getHandler());
    if (!isAccessible) {
      throw new ForbiddenException(
        "EXECUTIVE_VIEWER is restricted to the executive dashboard; this endpoint isn't part of it",
      );
    }

    return true;
  }
}
