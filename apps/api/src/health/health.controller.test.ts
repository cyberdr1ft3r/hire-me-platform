import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HealthResponseSchema } from '@hire-me/contracts';
import { AppModule } from '../app.module.js';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a structured success response', async () => {
    const response = await fetch(`${await app.getUrl()}/health`);
    const body: unknown = await response.json();
    const parsed = HealthResponseSchema.parse(body);

    expect(response.status).toBe(200);
    expect(parsed.status).toBe('ok');
    expect(parsed.service).toBe('hire-me-api');
  });
});
