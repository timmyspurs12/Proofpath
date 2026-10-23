import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';
import { encodeFunctionResult, parseAbi } from 'viem';
import { BRADBURY, verifyNetwork } from '../../scripts/verify-network.mjs';

const abi = parseAbi(['function getAddressManager() view returns (address)']);
const methods = Object.fromEntries(
  [
    'create_pact',
    'resolve_pact',
    'get_pact',
    'get_pacts',
    'get_activity',
    'get_reputation',
    'get_metadata',
  ].map((name) => [name, { readonly: name.startsWith('get_') }]),
);
const METADATA_RESULT = '0x16046e616d655c57656174686572506163740776657273696f6e09';
const state = {
  nodeChain: BRADBURY.chainIdHex,
  chainChain: BRADBURY.chainIdHex,
  nodeGenesis: BRADBURY.genesis,
  chainGenesis: BRADBURY.genesis,
  manager: BRADBURY.addressManager,
  schema: { methods },
  schemaError: false,
  calls: [],
};
let server;
let base;

before(async () => {
  server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      const payload = JSON.parse(body);
      const side = request.url === '/node' ? 'node' : 'chain';
      state.calls.push(`${side}:${payload.method}`);
      let result;
      let error;
      switch (payload.method) {
        case 'eth_chainId':
          result = side === 'node' ? state.nodeChain : state.chainChain;
          break;
        case 'eth_getBlockByNumber':
          result = { hash: side === 'node' ? state.nodeGenesis : state.chainGenesis };
          break;
        case 'eth_getCode':
          result = '0x6000';
          break;
        case 'eth_call':
          result = encodeFunctionResult({
            abi,
            functionName: 'getAddressManager',
            result: state.manager,
          });
          break;
        case 'gen_getContractSchema':
          if (state.schemaError) error = { code: -32601, message: 'method not found' };
          else result = state.schema;
          break;
        case 'gen_getContractCode':
          result = Buffer.from('mock WeatherPact source').toString('base64');
          break;
        case 'gen_call':
          result = METADATA_RESULT;
          break;
        default:
          error = { code: -32601, message: `unexpected ${payload.method}` };
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({ jsonrpc: '2.0', id: payload.id, ...(error ? { error } : { result }) }),
      );
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  Object.assign(state, {
    nodeChain: BRADBURY.chainIdHex,
    chainChain: BRADBURY.chainIdHex,
    nodeGenesis: BRADBURY.genesis,
    chainGenesis: BRADBURY.genesis,
    manager: BRADBURY.addressManager,
    schema: { methods },
    schemaError: false,
    calls: [],
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function verify(overrides = {}) {
  return verifyNetwork({
    nodeRpcUrl: `${base}/node`,
    chainRpcUrl: `${base}/chain`,
    contractAddress: null,
    ...overrides,
  });
}

test('qualifies Bradbury identity and the actual contract source schema', async () => {
  const result = await verify();
  assert.equal(result.chainId, 4221);
  assert.equal(result.contractAddress, null);
  assert.equal(result.methods, 7);
  assert.ok(state.calls.includes('node:gen_getContractSchema'));
});

test('verifies deployed code, schema, and metadata through gen_call', async () => {
  const result = await verify({ contractAddress: BRADBURY.addressManager });
  assert.equal(result.contractAddress, BRADBURY.addressManager);
  assert.ok(state.calls.includes('node:gen_getContractCode'));
  assert.ok(state.calls.includes('node:gen_call'));
});

test('stops before GenVM schema work on a node chain mismatch', async () => {
  state.nodeChain = '0x1';
  await assert.rejects(verify(), /chain ID mismatch/);
  assert.equal(state.calls.includes('node:gen_getContractSchema'), false);
});

test('stops on a chain genesis mismatch', async () => {
  state.chainGenesis = `0x${'00'.repeat(32)}`;
  await assert.rejects(verify(), /Chain RPC genesis mismatch/);
});

test('stops when consensus reports another AddressManager', async () => {
  state.manager = '0x0000000000000000000000000000000000000001';
  await assert.rejects(verify(), /different AddressManager/);
});

test('rejects a source schema without every required contract method', async () => {
  const incomplete = { ...methods };
  delete incomplete.resolve_pact;
  state.schema = { methods: incomplete };
  await assert.rejects(verify(), /missing required method resolve_pact/);
});

test('requires actual gen_* support rather than accepting eth_* alone', async () => {
  state.schemaError = true;
  await assert.rejects(verify(), /gen_getContractSchema/);
});
