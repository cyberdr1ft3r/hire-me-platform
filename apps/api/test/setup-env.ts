process.env.ACCESS_TOKEN_TTL_SECONDS ??= '300';
process.env.API_CORS_ORIGIN ??= 'http://127.0.0.1:5173';
process.env.API_HOST ??= '127.0.0.1';
process.env.API_PORT ??= '3000';
process.env.AUTH_ACCESS_TOKEN_SECRET ??= 'test_access_token_secret_32_characters_minimum';
process.env.AUTH_COOKIE_SECURE ??= 'false';
process.env.AUTH_REFRESH_TOKEN_PEPPER ??= 'test_refresh_token_pepper_32_characters_minimum';
// Unit tests never reach a database. This placeholder only satisfies environment
// validation and cannot connect (port 1). Database suites get their target from
// the validated TEST_DATABASE_URL instead (test/setup-integration-env.ts).
process.env.DATABASE_URL ??=
  'postgresql://unit-tests-have-no-database@127.0.0.1:1/unit_tests_have_no_database';
process.env.NODE_ENV ??= 'test';
process.env.PRIVATE_UPLOAD_STORAGE_ROOT ??= '.tmp-runtime/test-private-uploads';
/** Tests must use the D-068 transport defaults, not stale local `.env` values. */
process.env.JSON_BODY_LIMIT ??= '6mb';
process.env.PUBLIC_APPLICATION_JSON_LIMIT = '8mb';
process.env.REFRESH_TOKEN_TTL_SECONDS ??= '604800';
