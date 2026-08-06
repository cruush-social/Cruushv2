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
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
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