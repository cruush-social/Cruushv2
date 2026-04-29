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

  if (init?.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  return parseApiResponse<T>(response);
}
