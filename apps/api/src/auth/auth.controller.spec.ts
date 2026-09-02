import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AuthController } from './auth.controller';

describe('AuthController rate-limiting wiring', () => {
  // Regression: the login brute-force fix (docs/threat-model.md's top
  // finding) only works if ThrottlerGuard is actually attached to the
  // handler -- a future refactor that drops @UseGuards(ThrottlerGuard)
  // from `login` would otherwise silently reopen the gap with no test
  // failing anywhere else (the guard being present isn't exercised by any
  // mocked-service unit test, only by the real HTTP integration spec).
  it('login carries ThrottlerGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.login);
    expect(guards).toContain(ThrottlerGuard);
  });
});
