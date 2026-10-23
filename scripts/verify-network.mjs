#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { decodeFunctionResult, encodeFunctionData, getAddress, parseAbi } from 'viem';

export const BRADBURY = Object.freeze({
  chainId: 4221,
  chainIdHex: '0x107d',
  genesis: '0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4',
  addressManager: '0x3F71AE080BD6270A91dBcc7960d88797828538E0',
});

const DEFAULT_CHAIN_RPC = 'https://rpc.testnet-chain.genlayer.com';
const REQUIRED_METHODS = [
  'create_pact',
  'resolve_pact',
  'get_pact',
  'get_pacts',
  'get_activity',
  'get_reputation',
  'get_metadata',
];
const addressManagerAbi = parseAbi(['function getAddressManager() view returns (address)']);
let requestId = 0;

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} returned an unexpected response.`);
  }
  return value;
}

function endpoint(value, label) {
  if (!value) {
    throw new Error(
      `${label} is required. Set GENLAYER_NODE_RPC_URL (or VITE_GENLAYER_RPC_URL) to a qualified GenLayer node; the chain-only RPC is insufficient.`,
    );
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (
    !['https:', 'http:'].includes(parsed.protocol) ||
    (parsed.protocol !== 'https:' && !loopback) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${label} must be HTTPS (or loopback HTTP for tests) without URL credentials.`);
  }
  return parsed.toString();
}

async function rpc(url, method, params = []) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error(`RPC endpoint could not be reached for ${method}.`);
  }
  if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}.`);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${method} returned malformed JSON.`);
  }
  const body = record(payload, method);
  if (body.error) {
    const error = record(body.error, `${method} error`);
    throw new Error(
      `${method} failed: ${typeof error.message === 'string' ? error.message : 'RPC error'}.`,
    );
  }
  return body.result;
}

function assertChainId(value, source) {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-fA-F]+$/.test(value) ||
    BigInt(value) !== BigInt(BRADBURY.chainId)
  ) {
    throw new Error(`${source} chain ID mismatch: expected ${BRADBURY.chainId}.`);
  }
}

function assertGenesis(value, source) {
  const block = record(value, `${source} genesis`);
  if (typeof block.hash !== 'string' || block.hash.toLowerCase() !== BRADBURY.genesis) {
    throw new Error(`${source} genesis mismatch. Deployment and writes are stopped.`);
  }
}

function assertManagerCode(value, source) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{2,}$/.test(value)) {
    throw new Error(`${source} has no code at the required AddressManager.`);
  }
}

async function assertManagerPointer(url, source, consensusAddress) {
  const data = encodeFunctionData({ abi: addressManagerAbi, functionName: 'getAddressManager' });
  const result = await rpc(url, 'eth_call', [{ to: consensusAddress, data }, 'latest']);
  if (typeof result !== 'string') throw new Error(`${source} AddressManager lookup failed.`);
  const actual = decodeFunctionResult({
    abi: addressManagerAbi,
    functionName: 'getAddressManager',
    data: result,
  });
  if (actual.toLowerCase() !== BRADBURY.addressManager.toLowerCase()) {
    throw new Error(`${source} consensus points to a different AddressManager.`);
  }
}

async function genCall(label, operation) {
  try {
    return await operation();
  } catch {
    throw new Error(`${label} failed on the GenLayer node RPC.`);
  }
}

function assertWeatherPactSchema(value, label) {
  const schema = record(value, label);
  const methods = record(schema.methods, `${label} methods`);
  for (const method of REQUIRED_METHODS) {
    if (!methods[method]) throw new Error(`${label} is missing required method ${method}.`);
  }
}

/**
 * Read-only Bradbury qualification. No account, signing, funding, or write is used.
 * Pass contractAddress: null for the pre-deploy source-schema-only check.
 */
export async function verifyNetwork(options = {}) {
  const nodeUrl = endpoint(
    options.nodeRpcUrl ?? process.env.GENLAYER_NODE_RPC_URL ?? process.env.VITE_GENLAYER_RPC_URL,
    'GenLayer node RPC',
  );
  const chainUrl = endpoint(
    options.chainRpcUrl ??
      process.env.GENLAYER_CHAIN_RPC_URL ??
      process.env.VITE_GENLAYER_CHAIN_RPC_URL ??
      DEFAULT_CHAIN_RPC,
    'Bradbury chain RPC',
  );
  const configuredAddress =
    options.contractAddress === undefined
      ? (process.env.WEATHERPACT_CONTRACT_ADDRESS ?? process.env.VITE_WEATHERPACT_CONTRACT_ADDRESS)
      : options.contractAddress;
  if (options.requireContract && !configuredAddress) {
    throw new Error('WEATHERPACT_CONTRACT_ADDRESS is required for post-deployment verification.');
  }
  const contractAddress = configuredAddress ? getAddress(configuredAddress) : null;
  const consensusAddress = testnetBradbury.consensusMainContract?.address;
  if (!consensusAddress)
    throw new Error('The pinned genlayer-js release lacks Bradbury consensus configuration.');

  // Check the node and the independent chain endpoint; either mismatch stops.
  const [nodeChain, chainChain] = await Promise.all([
    rpc(nodeUrl, 'eth_chainId'),
    rpc(chainUrl, 'eth_chainId'),
  ]);
  assertChainId(nodeChain, 'GenLayer node');
  assertChainId(chainChain, 'Chain RPC');

  const [nodeGenesis, chainGenesis] = await Promise.all([
    rpc(nodeUrl, 'eth_getBlockByNumber', ['0x0', false]),
    rpc(chainUrl, 'eth_getBlockByNumber', ['0x0', false]),
  ]);
  assertGenesis(nodeGenesis, 'GenLayer node');
  assertGenesis(chainGenesis, 'Chain RPC');

  const [nodeCode, chainCode] = await Promise.all([
    rpc(nodeUrl, 'eth_getCode', [BRADBURY.addressManager, 'latest']),
    rpc(chainUrl, 'eth_getCode', [BRADBURY.addressManager, 'latest']),
  ]);
  assertManagerCode(nodeCode, 'GenLayer node');
  assertManagerCode(chainCode, 'Chain RPC');
  await Promise.all([
    assertManagerPointer(nodeUrl, 'GenLayer node', consensusAddress),
    assertManagerPointer(chainUrl, 'Chain RPC', consensusAddress),
  ]);

  const client = createClient({ chain: testnetBradbury, endpoint: nodeUrl });
  const sourcePath = options.sourcePath ?? resolve('contracts/weatherpact.py');
  const source = await readFile(sourcePath, 'utf8');
  // This requires a GenLayer node and validates the actual source before deploy.
  assertWeatherPactSchema(
    await genCall('gen_getContractSchema (source)', () => client.getContractSchemaForCode(source)),
    'Source schema',
  );

  if (contractAddress) {
    const code = await genCall('gen_getContractCode', () =>
      client.getContractCode(contractAddress),
    );
    if (!code.trim()) throw new Error('The configured contract has no source code on this node.');
    assertWeatherPactSchema(
      await genCall('gen_getContractSchema (deployed)', () =>
        client.getContractSchema(contractAddress),
      ),
      'Deployed contract schema',
    );
    // A real read exercises gen_call, not only code/schema methods.
    const metadata = record(
      await genCall('gen_call (get_metadata)', () =>
        client.readContract({
          address: contractAddress,
          functionName: 'get_metadata',
          args: [],
          transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
        }),
      ),
      'WeatherPact metadata',
    );
    if (metadata.name !== 'WeatherPact' || Number(metadata.version) !== 1) {
      throw new Error('The deployed contract returned unexpected WeatherPact metadata.');
    }
  }

  return { chainId: BRADBURY.chainId, contractAddress, methods: REQUIRED_METHODS.length };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    const result = await verifyNetwork({
      requireContract: process.argv.includes('--require-contract'),
    });
    console.log(
      `Bradbury qualification passed: chain ${result.chainId}, ${result.methods} required methods, ${result.contractAddress ? 'deployed contract and gen_call verified' : 'pre-deploy source schema verified'}.`,
    );
  } catch (error) {
    console.error(
      `Network verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
