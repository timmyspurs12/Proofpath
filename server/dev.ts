import { createApp } from './app';
import { getConfig } from './config';

const { apiPort } = getConfig();
createApp().listen(apiPort, '0.0.0.0', () => {
  console.log(`ProofPath API listening on 0.0.0.0:${apiPort}`);
});
