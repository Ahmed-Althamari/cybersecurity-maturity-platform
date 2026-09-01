import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = Reflect.getMetadata(ROLES_KEY, context.getHandler());
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // A user can hold multiple role assignments (see UserRoleAssignment) --
    // `user.role` is only the first one, so checking it alone would deny
    // access to a user whose *other* assigned role satisfies the guard.
    const userRoles: string[] = user.roles?.length ? user.roles : [user.role];
    if (!userRoles.some((role) => requiredRoles.includes(role))) {
      throw new ForbiddenException(`User role '${user.role}' is not allowed to access this resource`);
    }

    return true;
  }
}
