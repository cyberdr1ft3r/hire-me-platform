import { describe, expect, it } from 'vitest';

import { isPublicApplicationSubmitPath, requestPath } from './public-application-http-transport.js';

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

  it('strips query strings when resolving the request path', () => {
    expect(
      requestPath({
        url: '/v1/public/opportunities/demo-role/applications?website=trap',
      }),
    ).toBe('/v1/public/opportunities/demo-role/applications');
    expect(requestPath({ path: '/v1/tasks' })).toBe('/v1/tasks');
  });
});
