import type { User, Session } from 'lucia';

/**
 * Create a mock APIContext for testing Astro API endpoints
 *
 * @example
 * ```ts
 * const context = createMockAPIContext({
 *   request: new Request('http://localhost/api/test'),
 *   locals: { user: mockUser, session: mockSession }
 * });
 *
 * const response = await GET(context);
 * ```
 */
export function createMockAPIContext(options?: {
  request?: Request;
  url?: URL | string;
  locals?: {
    user?: User | null;
    session?: Session | null;
    [key: string]: any;
  };
  params?: Record<string, string>;
  cookies?: any;
}): any {
  const {
    request = new Request('http://localhost:4321'),
    url = new URL('http://localhost:4321'),
    locals = {},
    params = {},
    cookies = createMockCookies(),
  } = options || {};

  return {
    request,
    url: typeof url === 'string' ? new URL(url) : url,
    locals: {
      user: null,
      session: null,
      ...locals,
    },
    params,
    cookies,
    redirect: (path: string, status = 302) => {
      return new Response(null, {
        status,
        headers: { Location: path },
      });
    },
  };
}

/**
 * Create a mock cookies object
 */
function createMockCookies() {
  const store = new Map<string, any>();

  return {
    get: (name: string) => {
      const value = store.get(name);
      return value ? { value } : undefined;
    },
    set: (name: string, value: string, options?: any) => {
      store.set(name, value);
    },
    delete: (name: string) => {
      store.delete(name);
    },
    has: (name: string) => {
      return store.has(name);
    },
  };
}

/**
 * Helper to parse JSON response body
 */
export async function parseJSONResponse<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  return JSON.parse(text);
}

/**
 * Helper to create a request with JSON body
 */
export function createJSONRequest(url: string, options?: {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}): Request {
  const { method = 'POST', body, headers = {} } = options || {};

  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Helper to assert successful API response (200-299)
 */
export function assertSuccessResponse(response: Response): asserts response is Response {
  if (!response.ok) {
    throw new Error(
      `Expected successful response (200-299), got ${response.status} ${response.statusText}`
    );
  }
}

/**
 * Helper to assert error API response (400+)
 */
export function assertErrorResponse(
  response: Response,
  expectedStatus?: number
): asserts response is Response {
  if (response.ok) {
    throw new Error(`Expected error response (400+), got ${response.status}`);
  }

  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
  }
}
