import { z } from 'zod';
import type { ApiErrorBody } from '../shared/schemas';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<S extends z.ZodType>(
  path: string,
  schema: S,
  init: RequestInit = {},
  timeoutMs = 60_000,
): Promise<z.output<S>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const errorBody = body as ApiErrorBody | null;
      throw new ApiError(
        errorBody?.error?.code ?? 'HTTP_ERROR',
        errorBody?.error?.message ?? `Request failed (${response.status})`,
        errorBody?.error?.retryable ?? response.status >= 500,
        response.status,
        errorBody?.error?.details,
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        'INVALID_SERVER_RESPONSE',
        'The server returned an unexpected response. No plan was created.',
        false,
        502,
      );
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(
        'REQUEST_TIMEOUT',
        'The request took too long. Please try again.',
        true,
        408,
      );
    }
    throw new ApiError(
      'NETWORK_ERROR',
      'ProofPath could not reach the server. Check your connection and try again.',
      true,
      0,
    );
  } finally {
    window.clearTimeout(timer);
  }
}
