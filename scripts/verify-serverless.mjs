import { once } from 'node:events';
import { createServer } from 'node:http';
import handler from '../server-dist/vercel-entry.mjs';

const server = createServer(handler);
server.listen(0, '127.0.0.1');
await once(server, 'listening');

try {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No ephemeral test port');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  const body = await response.json();
  if (
    response.status !== 200 ||
    body.status !== 'ok' ||
    body.provider !== 'nebius' ||
    body.liveInferenceVerified !== false
  ) {
    throw new Error(`Unexpected generated-function health response: ${response.status}`);
  }
  console.log(
    JSON.stringify({
      event: 'serverless_bundle_smoke',
      status: 'passed',
      http_status: response.status,
      live_inference_verified: body.liveInferenceVerified,
    }),
  );
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
