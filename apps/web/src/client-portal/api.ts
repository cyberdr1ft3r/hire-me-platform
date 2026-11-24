import { ClientPortalConfigSchema, ClientPortalEmptyResponseSchema } from '@hire-me/contracts';
import { getApiBaseUrl } from '../api.js';
import { authenticatedFetch } from '../auth/authenticated-request.js';

export class ClientPortalError extends Error {
  constructor(readonly status: number) {
    super('Client portal request failed');
  }
}

export type PortalSchema<T> = { parse(value: unknown): T };

export async function clientPortal<T>(
  route: string,
  schema: PortalSchema<T>,
  options: { body?: object; staffToken?: string } = {},
): Promise<T> {
  const api = getApiBaseUrl();
  const init: RequestInit = {
    cache: 'no-store',
    ...(options.body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options.body),
        }
      : {}),
  };
  const response = options.staffToken
    ? await authenticatedFetch(
        options.staffToken,
        api,
        api + '/v1/internal/client-portal/' + route,
        init,
      )
    : await fetch(api + '/v1/client-portal/' + route, { ...init, credentials: 'include' });
  if (!response.ok) throw new ClientPortalError(response.status);
  return schema.parse(
    response.status === 202 || response.status === 204 ? undefined : await response.json(),
  );
}

export const clientConfig = () => clientPortal('config', ClientPortalConfigSchema);
export const noResponse = ClientPortalEmptyResponseSchema;
