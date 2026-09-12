import type { PublicOpportunity } from '@hire-me/contracts';
import { act } from '@testing-library/react';
import { vi } from 'vitest';

/** Synthetic public-contract fixtures for the public opportunity tests. */

export const API = 'http://127.0.0.1:3000';

export function syntheticOpportunity(
  overrides: Partial<PublicOpportunity> = {},
): PublicOpportunity {
  return {
    applicationDeadline: null,
    clientName: null,
    publicDescription: 'Synthetic public description.\n\nSecond synthetic paragraph.',
    publicEngagementType: 'Synthetic contract',
    publicExperienceLevel: 'Synthetic level',
    publicLocation: 'Example City',
    publicSkills: 'Synthetic skill one, synthetic skill two',
    publicSlug: 'synthetic-role',
    publicSummary: 'Short synthetic summary.',
    publicTitle: 'Synthetic public role',
    publicWorkArrangement: 'Synthetic arrangement',
    salary: null,
    uploadRequirements: {
      additionalAttachmentsEnabled: false,
      allowedMimeTypes: ['application/pdf', 'text/plain'],
      certificationsEnabled: false,
      certificationsRequired: false,
      cvRequired: true,
      diplomasEnabled: false,
      diplomasRequired: false,
      maxFileSizeBytes: 1_500_000,
      maxTotalUploadBytes: 5_000_000,
    },
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

export function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}

export interface Deferred<T> {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

/**
 * Settles one deferred response inside `act`. Awaiting the same promise queues
 * this continuation behind the component's own, so its update has committed
 * when the test resumes.
 */
export async function resolveInAct<T>(pending: Deferred<T>, value: T): Promise<void> {
  await act(async () => {
    pending.resolve(value);
    await pending.promise;
  });
}

/** The JSON body a request carried, or `undefined` when it had none. */
export function requestBody(init: RequestInit | undefined): unknown {
  return typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
}

type Route = (init: RequestInit | undefined) => Promise<Response>;

/**
 * A fetch stub for the public routes. Unauthenticated `/auth/refresh` and a
 * healthy `/health` are answered for the application frame; every public route
 * is supplied by the test. Anything else fails loudly.
 */
export function mockPublicApi(routes: {
  detail?: (slug: string, init: RequestInit | undefined) => Promise<Response>;
  list?: Route;
  submit?: (slug: string, init: RequestInit | undefined) => Promise<Response>;
}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = requestUrl(input);
    if (url === `${API}/health`) {
      return Promise.resolve(
        jsonResponse({
          service: 'hire-me-api',
          status: 'ok',
          timestamp: '2026-09-12T12:00:00.000Z',
          uptimeSeconds: 1,
        }),
      );
    }
    if (url === `${API}/auth/refresh`) {
      return Promise.resolve(jsonResponse({}, 401));
    }
    if (url === `${API}/v1/public/opportunities` && routes.list) {
      return routes.list(init);
    }
    const submit = url.match(
      /^http:\/\/127\.0\.0\.1:3000\/v1\/public\/opportunities\/([^/]+)\/applications$/,
    );
    if (submit?.[1] && routes.submit) {
      return routes.submit(submit[1], init);
    }
    const detail = url.match(/^http:\/\/127\.0\.0\.1:3000\/v1\/public\/opportunities\/([^/]+)$/);
    if (detail?.[1] && routes.detail) {
      return routes.detail(detail[1], init);
    }
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
}

/** Every call the stub received for one exact URL. */
export function callsTo(fetchMock: ReturnType<typeof mockPublicApi>, url: string) {
  return fetchMock.mock.calls.filter(([input]) => requestUrl(input) === url);
}

export function syntheticFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

/**
 * jsdom's `Blob` has no `arrayBuffer()`, which every supported browser has. This
 * test-only shim reads through jsdom's own `FileReader`, so production code keeps
 * the browser API it has always used.
 */
export function installBlobArrayBuffer(): void {
  if (typeof Blob.prototype.arrayBuffer === 'function') {
    return;
  }
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    configurable: true,
    value(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.readAsArrayBuffer(this);
      });
    },
  });
}
