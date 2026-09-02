import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { ExecutiveViewerScopeGuard } from './executive-viewer-scope.guard';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Composed here, not applied as a separate global (APP_GUARD) guard --
  // NestJS runs global guards *before* controller-scoped ones like this
  // one, so a global guard would run before Passport has populated
  // `request.user` below and would see it as permanently undefined,
  // silently never enforcing anything. Confirmed live: with
  // ExecutiveViewerScopeGuard registered as APP_GUARD instead, an
  // EXECUTIVE_VIEWER-only token got a real 200 (not the intended 403) from
  // GET /assessments/:id and GET /users. Composing it inside the one guard
  // that's already attached to every protected controller (present and
  // future) guarantees the correct order by construction, rather than by
  // remembering to add a second @UseGuards() entry everywhere.
  private readonly executiveViewerScopeGuard = new ExecutiveViewerScopeGuard();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAuthenticated = await super.canActivate(context);
    if (!isAuthenticated) {
      return false;
    }

    return this.executiveViewerScopeGuard.canActivate(context);
  }
}
