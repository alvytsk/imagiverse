import type { ApiError } from 'imagiverse-shared';
import { useAuthStore } from '@/stores/auth-store';

const API_BASE = '/api';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Array<{ field: string; message: string }>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.accessToken ?? null;
  } catch {
    return null;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const body = await response.json();

  if (!response.ok) {
    const err = body as ApiError;
    throw new ApiClientError(
      response.status,
      err.error?.code ?? 'UNKNOWN_ERROR',
      err.error?.message ?? 'An unexpected error occurred',
      err.error?.details,
    );
  }

  return body as T;
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  auth?: boolean;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, auth = true, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...(extraHeaders as Record<string, string>),
  };

  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  let response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    credentials: 'include',
    body:
      body instanceof FormData
        ? body
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
  });

  if (response.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      useAuthStore.getState().setToken(newToken);
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(`${API_BASE}${path}`, {
        ...rest,
        headers,
        credentials: 'include',
        body:
          body instanceof FormData
            ? body
            : body !== undefined
              ? JSON.stringify(body)
              : undefined,
      });
    }
  }

  return handleResponse<T>(response);
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'GET' }),

  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'PATCH', body }),

  delete: <T>(path: string, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: 'DELETE' }),
};
