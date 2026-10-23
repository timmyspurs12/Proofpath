import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app';

export const maxDuration = 60;
export const config = { api: { bodyParser: false } };

type NodeHandler = (request: IncomingMessage, response: ServerResponse) => void;

let application: NodeHandler | undefined;

export default function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    application ??= createApp() as unknown as NodeHandler;
    application(request, response);
  } catch (error: unknown) {
    console.error('ProofPath API initialization failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    if (response.headersSent) {
      response.end();
      return;
    }
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(
      JSON.stringify({
        error: {
          code: 'API_INITIALIZATION_FAILED',
          message: 'The API could not be initialized. Please retry or check the deployment logs.',
          retryable: true,
        },
      }),
    );
  }
}
