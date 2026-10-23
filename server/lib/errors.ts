export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function asAppError(error: unknown) {
  if (error instanceof AppError) return error;
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. No result was saved.', true);
}
