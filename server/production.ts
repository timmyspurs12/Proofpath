import path from 'node:path';
import { createApp } from './app';
import { getConfig } from './config';

const { apiPort } = getConfig();
createApp({ staticDir: path.resolve('dist') }).listen(apiPort, '0.0.0.0', () => {
  console.log(`ProofPath listening on 0.0.0.0:${apiPort}`);
});
