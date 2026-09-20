type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getApiBaseUrl() {
  const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'cruush.app' || window.location.hostname === 'www.cruush.app') {
      return 'https://api.cruush.app';
    }
    if (window.location.hostname === 'staging.cruush.app') {
      return 'https://api-staging.cruush.app';
    }
  }

  return '';
}

export function resolveApiUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) {
    return pathOrUrl ?? '';
  }

  if (/^(https?:|data:|blob:)/i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  if (pathOrUrl.startsWith('/')) {
    return `${getApiBaseUrl()}${pathOrUrl}`;
  }

  return pathOrUrl;
}

export function resolveMediaUrl(pathOrUrl: string | null | undefined) {
  if (
    pathOrUrl?.startsWith('/api/media/')
    && typeof window !== 'undefined'
    && ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname)
  ) {
    // Keep protected local media on the Vite origin. The dev proxy forwards it
    // with the same authenticated browser session, avoiding broken cross-port
    // images while production still resolves media against the configured API.
    return pathOrUrl;
  }

  return resolveApiUrl(pathOrUrl);
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  const bodyText = await response.text();
  let body: ({ data?: T } & ApiErrorBody) | {} = {};

  if (bodyText) {
    try {
      body = JSON.parse(bodyText) as { data?: T } & ApiErrorBody;
    } catch {
      body = {};
    }
  }

  const parsedBody = body as { data?: T } & ApiErrorBody;

  if (!response.ok) {
    const apiError = parsedBody.error;
    throw new ApiClientError(
      response.status,
      apiError?.code ?? 'INTERNAL_ERROR',
      apiError?.message ?? 'Request failed.',
      apiError?.details ?? null,
    );
  }

  return parsedBody.data as T;
}

export async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const isFormDataBody = typeof FormData !== 'undefined' && init?.body instanceof FormData;

  if (init?.body && !isFormDataBody && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiClientError(503, 'API_UNAVAILABLE', 'The cruush API is unavailable.');
  }

  return parseApiResponse<T>(response);
}

const UPLOAD_RETRY_DELAYS_MS = [1000, 2500];

// A photo upload from a phone can lose its connection partway: the server
// logs the stream closing early and the browser gets no response at all, so
// the member sees "API unavailable" for a photo that never arrived (#286).
// Only that case is retried; any answer from the server, good or bad, stands.
export async function requestApiWithUploadRetry<T>(path: string, init?: RequestInit): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await requestApi<T>(path, init);
    } catch (error) {
      const connectionLost = error instanceof ApiClientError && error.code === 'API_UNAVAILABLE';
      if (!connectionLost || attempt >= UPLOAD_RETRY_DELAYS_MS.length) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAYS_MS[attempt]));
      attempt += 1;
    }
  }
}
