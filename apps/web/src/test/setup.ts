import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';

import { resetAuthSessionForTests } from '../auth/authenticated-request.js';

// The authenticated request core keeps the session in module memory; never
// let one test's session or pending refresh leak into the next.
afterEach(() => {
  resetAuthSessionForTests();
});
