import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { UserRole } from '@cmmp/shared';

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = Reflect.getMetadata('roles', context.getHandler());
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(`User role '${user.role}' is not allowed to access this resource`);
    }

    return true;
  }
}
