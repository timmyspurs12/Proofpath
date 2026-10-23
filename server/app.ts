import { randomUUID } from 'node:crypto';
import path from 'node:path';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  IntakeRequestSchema,
  PlanRequestSchema,
  VerifySourcesRequestSchema,
  type ApiErrorBody,
} from '../src/shared/schemas';
import { getConfig } from './config';
import { AppError, asAppError } from './lib/errors';
import { logEvent } from './lib/logger';
import { NebiusClient } from './lib/nebius';
import { runIntake, runPlan } from './lib/plan';
import { verifySourceList } from './lib/retrieval';
import { TavilyClient } from './lib/tavily';

interface AppOptions {
  nebius?: NebiusClient;
  tavily?: TavilyClient;
  staticDir?: string;
}

function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      400,
      'INVALID_REQUEST',
      'Check the input and try again.',
      false,
      parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }
  return parsed.data;
}

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function createApp(options: AppOptions = {}) {
  const config = getConfig();
  const nebius = options.nebius ?? new NebiusClient(config);
  const tavily = options.tavily ?? new TavilyClient(config);
  const app = express();
  const attempts = new Map<string, { count: number; resetAt: number }>();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((request, response, next) => {
    const requestId = randomUUID();
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    if (request.path.startsWith('/api/')) response.setHeader('Cache-Control', 'no-store');
    const started = performance.now();
    response.on('finish', () => {
      logEvent('http_request', {
        request_id: requestId,
        method: request.method,
        route: request.path,
        status: response.statusCode,
        latency_ms: Math.round(performance.now() - started),
      });
    });
    next();
  });
  app.use('/api', (request, response, next) => {
    if (request.method === 'GET') return next();
    const key = request.ip ?? 'unknown';
    const now = Date.now();
    const current = attempts.get(key);
    const entry =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + config.rateLimitWindowMs }
        : current;
    entry.count += 1;
    attempts.set(key, entry);
    if (attempts.size > 10_000) attempts.clear();
    response.setHeader('X-RateLimit-Limit', config.rateLimitMax);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, config.rateLimitMax - entry.count));
    if (entry.count > config.rateLimitMax) {
      response.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return next(
        new AppError(
          429,
          'REQUEST_LIMIT',
          'Too many requests from this connection. Please wait a minute and try again.',
          true,
        ),
      );
    }
    return next();
  });
  app.use(express.json({ limit: '128kb', type: 'application/json' }));

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      liveInferenceConfigured: Boolean(config.nebiusApiKey),
      tavilyConfigured: Boolean(config.tavilyApiKey),
      model: config.nebiusModel,
      provider: 'nebius',
      liveInferenceVerified: false,
    });
  });
  app.post(
    '/api/intake',
    asyncRoute(async (request, response) => {
      const input = parseBody(IntakeRequestSchema, request.body);
      const result = await runIntake(nebius, input);
      response.json(result);
    }),
  );
  app.post(
    '/api/plans',
    asyncRoute(async (request, response) => {
      const input = parseBody(PlanRequestSchema, request.body);
      const result = await runPlan(nebius, tavily, input);
      logEvent('plan_validated', {
        steps: result.plan.steps.length,
        supported_steps: result.metrics.validatedSupportedClaims,
        invalid_citations: result.metrics.invalidCitationCount,
        conflicts: result.metrics.validatedConflicts,
      });
      response.json({ plan: result.plan });
    }),
  );
  app.post(
    '/api/sources/verify',
    asyncRoute(async (request, response) => {
      const input = parseBody(VerifySourcesRequestSchema, request.body);
      const checks = await verifySourceList(input.sources);
      response.json({ checks });
    }),
  );
  app.use('/api', (_request, _response, next) => {
    next(new AppError(404, 'NOT_FOUND', 'API route not found.', false));
  });

  if (options.staticDir) {
    const staticDir = path.resolve(options.staticDir);
    app.use((_request, response, next) => {
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      next();
    });
    app.use(express.static(staticDir, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api(?:\/|$)).*/, (_request, response) => {
      response.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const appError =
      error instanceof SyntaxError && 'body' in error
        ? new AppError(400, 'INVALID_JSON', 'The request body is not valid JSON.', false)
        : asAppError(error);
    const body: ApiErrorBody = {
      error: {
        code: appError.code,
        message: appError.message,
        retryable: appError.retryable,
        ...(appError.details === undefined ? {} : { details: appError.details }),
      },
    };
    response.status(appError.status).json(body);
  };
  app.use(errorHandler);
  return app;
}
