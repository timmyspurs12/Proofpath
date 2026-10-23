import 'dotenv/config';

export const DEFAULT_NEBIUS_BASE_URL = 'https://api.tokenfactory.nebius.com/v1';
export const DEFAULT_NEBIUS_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';

export interface AppConfig {
  nebiusApiKey: string | null;
  nebiusBaseUrl: string;
  nebiusModel: string;
  tavilyApiKey: string | null;
  apiPort: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeNebiusBaseUrl(value = DEFAULT_NEBIUS_BASE_URL) {
  const url = new URL(value);
  const validHost = /^api\.tokenfactory(?:\.[a-z0-9-]+)?\.nebius\.com$/i.test(url.hostname);
  if (
    url.protocol !== 'https:' ||
    !validHost ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/v1\/?$/.test(url.pathname)
  ) {
    throw new Error('NEBIUS_BASE_URL must be an official HTTPS Token Factory /v1 endpoint');
  }
  return `https://${url.hostname}/v1`;
}

export function getConfig(): AppConfig {
  const model = process.env.NEBIUS_MODEL?.trim() || DEFAULT_NEBIUS_MODEL;
  if (!model.startsWith('nvidia/') || model.length > 160) {
    throw new Error('NEBIUS_MODEL must be an NVIDIA model ID beginning with nvidia/');
  }
  return {
    nebiusApiKey:
      process.env.NEBIUS_API_KEY?.trim() ||
      process.env.NEBIUS_TOKEN_FACTORY_API_KEY?.trim() ||
      null,
    nebiusBaseUrl: normalizeNebiusBaseUrl(process.env.NEBIUS_BASE_URL),
    nebiusModel: model,
    tavilyApiKey: process.env.TAVILY_API_KEY?.trim() || null,
    apiPort: positiveInteger(process.env.API_PORT ?? process.env.PORT, 3000),
    rateLimitWindowMs: positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    rateLimitMax: positiveInteger(process.env.RATE_LIMIT_MAX, 20),
  };
}
