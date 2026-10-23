const env = import.meta.env;

export const config = {
  contractAddress: env.VITE_WEATHERPACT_CONTRACT_ADDRESS?.trim() || null,
  chainId: env.VITE_GENLAYER_CHAIN_ID?.trim() || null,
  chainName: env.VITE_GENLAYER_CHAIN_NAME?.trim() || 'Network not configured',
  rpcUrl: env.VITE_GENLAYER_RPC_URL?.trim() || null,
  chainRpcUrl: env.VITE_GENLAYER_CHAIN_RPC_URL?.trim() || null,
  explorerUrl: env.VITE_GENLAYER_EXPLORER_URL?.trim().replace(/\/$/, '') || null,
} as const;

export const hasPublicContractConfig = Boolean(
  config.contractAddress && config.chainId && config.rpcUrl,
);

export const SOURCE_DISCLOSURE =
  'Historical weather data may be model-derived or reanalysis-based and is not necessarily a direct local weather-station measurement.';
