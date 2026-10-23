import type { IncomingMessage, ServerResponse } from 'node:http';

export const maxDuration = 60;
export const config = { api: { bodyParser: false } };

type NodeHandler = (request: IncomingMessage, response: ServerResponse) => void;

let application: Promise<NodeHandler> | undefined;

async function loadApplication() {
  if (!application) {
    application = import('../server/app')
      .then(({ createApp }) => createApp() as unknown as NodeHandler)
      .catch((error: unknown) => {
        application = undefined;
        throw error;
      });
  }
  return application;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    const app = await loadApplication();
    app(request, response);
  } catch (error: unknown) {
    const diagnostic = {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'Unknown initialization failure',
    };
    console.error('ProofPath API initialization failed', diagnostic);
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
          details: diagnostic,
        },
      }),
    );
  }
}
