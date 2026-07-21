import { UnauthorizedException } from '@nestjs/common';

import { AUTH_ERROR } from './auth.constants.js';

export class AuthenticationFailedException extends UnauthorizedException {
  constructor() {
    super({ error: AUTH_ERROR });
  }
}
