import { describe, expect, it } from 'vitest';

import {
  isPublicApplicationSubmitPath,
  isPublicApplicationSubmitRequest,
  requestPath,
} from './public-application-http-transport.js';

describe('public application HTTP transport paths', () => {
  it('matches public application submit paths with or without a trailing slash', () => {
    expect(isPublicApplicationSubmitPath('/v1/public/opportunities/demo-role/applications')).toBe(
      true,
    );
    expect(isPublicApplicationSubmitPath('/v1/public/opportunities/demo-role/applications/')).toBe(
      true,
    );
    expect(
      isPublicApplicationSubmitPath('/v1/public/opportunities/demo-role/applications/extra'),
    ).toBe(false);
    expect(isPublicApplicationSubmitPath('/auth/login')).toBe(false);
  });

  it('requires POST for the elevated public application transport', () => {
    const path = '/v1/public/opportunities/demo-role/applications';
    expect(isPublicApplicationSubmitRequest({ method: 'POST', path })).toBe(true);
    expect(
      isPublicApplicationSubmitRequest({
        method: 'POST',
        url: `${path}?website=trap`,
      }),
    ).toBe(true);
    expect(isPublicApplicationSubmitRequest({ method: 'PUT', path })).toBe(false);
    expect(isPublicApplicationSubmitRequest({ method: 'PATCH', path })).toBe(false);
    expect(isPublicApplicationSubmitRequest({ method: 'GET', path })).toBe(false);
  });

  it('strips query strings when resolving the request path', () => {
    expect(
      requestPath({
        url: '/v1/public/opportunities/demo-role/applications?website=trap',
      }),
    ).toBe('/v1/public/opportunities/demo-role/applications');
    expect(requestPath({ path: '/v1/tasks' })).toBe('/v1/tasks');
  });
});
