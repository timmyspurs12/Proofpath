import { config, hasPublicContractConfig } from '../config';
import type { WeatherPactClient } from '../types/weatherpact';
import { GenLayerWeatherPactClient } from './genlayer-client';
import { BRADBURY_CHAIN_ID } from './network';
import { PreviewWeatherPactClient } from './preview-client';

function createWeatherPactClient(): WeatherPactClient {
  if (
    hasPublicContractConfig &&
    config.contractAddress &&
    config.rpcUrl &&
    config.chainId === String(BRADBURY_CHAIN_ID)
  ) {
    try {
      return new GenLayerWeatherPactClient({
        contractAddress: config.contractAddress,
        rpcUrl: config.rpcUrl,
        chainName: config.chainName,
      });
    } catch {
      // Invalid public configuration must never enable genuine writes.
    }
  }
  return new PreviewWeatherPactClient();
}

/** Pages depend on capabilities, never on the mere presence of env variables. */
export const weatherPactClient: WeatherPactClient = createWeatherPactClient();
