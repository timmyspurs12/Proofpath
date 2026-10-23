# WeatherPact

**Weather claims, settled with evidence.**

WeatherPact is a responsive React + TypeScript DApp for public, measurable weather pacts. A creator chooses a place, local calendar date, daily weather metric, threshold, and YES/NO prediction. The Python Intelligent Contract is authoritative for pact creation, storage, resolution, activity, and non-financial creator reputation.

The contract fetches Open-Meteo Historical Weather API evidence inside GenLayer's non-deterministic equivalence flow. Validators independently fetch and normalize the observation; no LLM can override the numerical comparison. There is no conventional API server, off-chain outcome database, payment, stake, payout, insurance, or token mechanism.

## Status: implemented locally, not deployed here

| Area                               | Current state                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| Intelligent Contract               | Implemented in `contracts/weatherpact.py`; local Direct Mode, lint, schema, and type checks pass |
| Real frontend adapter              | Implemented with `genlayer-js@2.0.0-rc.2`; strict TypeScript and production build pass           |
| Local guard tests                  | 5 transaction-journal tests and 7 network-verification tests pass                                |
| Live Bradbury qualification        | **Not completed**: this environment has no qualified GenLayer node RPC endpoint                  |
| Contract deployment                | **Not performed**; no deployment address or transaction is claimed                               |
| On-chain writes/weather resolution | **Not performed**; no measured WeatherPact fee profile or live consensus result is claimed       |
| Default UI                         | Conspicuously labelled preview mode with genuine writes disabled                                 |

A configured contract and qualified node are required before the UI labels any record as on-chain. Environment variables alone never turn preview records into chain records.

## Run locally

Requirements: Node.js 20.19+ or 22.12+, npm, and—only for contract tests—Python 3.12+.

```bash
npm ci
npm run dev
```

Vite listens on `0.0.0.0:5173`. The default configuration uses isolated illustrative preview data.

```bash
npm run test:client    # same-transaction journal and storage-denial recovery
npm run test:network   # local JSON-RPC fixtures; no live network required
npm run build          # strict TypeScript + static production bundle in dist/
npm run preview        # serve that production build
npm run format:check
```

The production build currently emits Vite's non-fatal large-chunk warning because the official GenLayer SDK is included. It is not suppressed or reported as a failure.

## Architecture

```text
Injected wallet ──signs writes──┐
                                ▼
React static SPA ──genlayer-js──► Qualified GenLayer node RPC ──► Bradbury chain
       │                              │                              │
       │                              └──── read/finality/status ◄───┘
       ▼
WeatherPact Intelligent Contract ──fixed HTTPS request──► Open-Meteo archive
```

- `contracts/weatherpact.py` is the only authoritative record/outcome store.
- `src/client/genlayer-client.ts` implements the same `WeatherPactClient` interface as the isolated preview adapter.
- `src/client/index.ts` selects the real adapter only for a complete, valid Bradbury configuration; otherwise it selects preview mode.
- `src/client/network.ts` stops reads/writes on network identity, contract code/schema, metadata, or `gen_call` qualification failures.
- `src/client/transaction-journal.ts` stores only non-secret write intent and transaction IDs so an interrupted wait resumes the same transaction.
- `scripts/verify-network.mjs` performs read-only deployment/runtime qualification.
- `scripts/deploy.mjs` refuses to invoke the deployment CLI until that qualification succeeds.

## Contract behavior

### Creation and views

`create_pact` uses `gl.message.sender_address`; callers cannot supply a creator, observed value, arbitrary evidence URL, or provider response. It validates:

- bounded text and two-letter country code;
- decimal latitude/longitude with at most six decimal places and physical ranges;
- an ISO calendar date in the supported archive range;
- an IANA timezone from the embedded TZ Database 2026b snapshot (599 canonical names and backward-compatible links), included because the pinned GenVM runner has no host tzdata;
- one of the five supported metrics, an operator (`gt`, `gte`, `lt`, `lte`), YES/NO prediction, and a normalized metric threshold with at most three decimal places.

The public schema has two writes and five views. `get_pacts` and `get_activity` return newest-first bounded pages of at most 50 records. `get_pact`, `get_reputation`, and `get_metadata` provide individual records and counters. The static client reads at most 20 pages/1,000 entries per collection and reports an error rather than silently truncating a larger history.

### Metrics

| Open-Meteo daily variable | Stored/displayed unit |
| ------------------------- | --------------------- |
| `rain_sum`                | mm                    |
| `precipitation_sum`       | mm                    |
| `temperature_2m_max`      | °C                    |
| `temperature_2m_min`      | °C                    |
| `wind_speed_10m_max`      | km/h                  |

### Conservative resolution window

A pact becomes eligible seven days after its target date at 00:00 UTC. This conservative delay is later than the end of the target local day in every supported UTC offset and allows for the archive's delayed/model-derived data. Chain time comes from the supported contract clock; Direct Mode tests use the official time-warp facility. Early resolution reverts without evidence.

Eligibility does not guarantee that a provider response is usable. Timeout/request failure, HTTP 408/429/5xx, malformed or unexpected JSON, provider error responses, wrong units/timezone/date, missing or non-numeric data, out-of-range values, and excessive coordinate mismatch never resolve the pact. The pact remains open and a later resolution can be attempted. No separate `SOURCE_UNAVAILABLE` outcome is stored on-chain.

### Independent numerical evidence

Resolution constructs only an `https://archive-api.open-meteo.com/v1/archive` URL from validated pact fields. Leader and validators independently fetch that fixed request through `gl.nondet.web.get` and the documented `gl.vm.run_nondet` equivalence pattern. They compare canonical normalized success/failure values, excluding variable response fields such as generation time.

A successful observation must have exactly one requested daily date, the expected unit and timezone, numeric evidence, valid provider coordinates/UTC offset, and coordinates within 0.25 degrees on each axis of the requested location (allowing normal model-grid snapping while rejecting a distant response). Values are normalized to three decimal places and compared as scaled integers. The contract stores `RESOLVED_YES` or `RESOLVED_NO` from the actual condition, independently of the creator's prediction, plus compact evidence and resolution metadata. Duplicate resolution is rejected.

Reputation is derived from finalized creator history. Achievements in the UI are playful labels only—no points, tokens, payments, or financial rewards.

> Historical weather data may be model-derived or reanalysis-based and is not necessarily a direct local weather-station measurement.

Validator agreement on one fetched Open-Meteo response is **not** independent multi-provider weather verification. WeatherPact does not make that claim.

## Contract setup and checks

Use Python 3.12+; Direct Mode does not require Docker or a running localnet.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt

pytest tests/direct -q
genvm-lint lint contracts/weatherpact.py
GENVM_SOURCE_MODE=release GENVM_VERSION=v0.6.0-rc10 \
  genvm-lint validate contracts/weatherpact.py
GENVM_SOURCE_MODE=release GENVM_VERSION=v0.6.0-rc10 \
  genvm-lint typecheck contracts/weatherpact.py
```

The requirements select the Phase 2/consensus-v0.6-compatible family and pin the inspected linter source commit. The current linter understands the runner's current schema API; older PyPI `genvm-linter 0.11.0` does not. If using an already-built GenVM tree instead of release acquisition, configure the official `GENVM_PREBUILT_DIR` supported by the installed tools. Do not substitute a host Python 3.11 shim or an unrelated runner.

Latest local results:

- **38/38 Direct Mode tests passed**, including actual sender, validation, early resolution, all metrics/operators, matching and non-matching outcomes, missing/malformed/failed sources, retries, coordinate mismatch, duplicate resolution, validators, bounded views, and multiple pacts.
- **3/3 fast GenVM lint checks passed**.
- **Schema validation passed: WeatherPact, 7 methods (5 view, 2 write)**.
- **Pyright: no type errors**.
- **5/5 journal tests and 7/7 network guard tests passed**.
- **Strict TypeScript and Vite production build passed**.

These are local tests, not a live deployment or production-runner deployment proof. Docker-based Studio/localnet integration was not run because Docker is unavailable in this environment.

## Public environment configuration

Copy the public example and fill it only when a real deployment and qualified public node exist:

```bash
cp .env.example .env
```

| Variable                            | Purpose                                                             |
| ----------------------------------- | ------------------------------------------------------------------- |
| `VITE_WEATHERPACT_CONTRACT_ADDRESS` | Actual deployed Intelligent Contract address; empty means preview   |
| `VITE_GENLAYER_CHAIN_ID`            | Must be `4221` for the real adapter                                 |
| `VITE_GENLAYER_CHAIN_NAME`          | Public network label                                                |
| `VITE_GENLAYER_RPC_URL`             | **Qualified GenLayer node RPC** supporting `gen_*` and browser CORS |
| `VITE_GENLAYER_CHAIN_RPC_URL`       | Public chain RPC used for injected-wallet network configuration     |
| `VITE_GENLAYER_EXPLORER_URL`        | Optional public explorer base URL                                   |

`https://rpc.testnet-chain.genlayer.com` is the chain RPC, not a substitute for the GenLayer node RPC: the chain-only endpoint does not provide the required `gen_call`/contract methods. The browser node URL must be HTTPS and contain no credentials, query string, or fragment.

Every `VITE_*` value is embedded in the public browser bundle. Never place private keys, seed phrases, signer secrets, privileged credentials, or credentialed RPC URLs in them. All `.env` and `.env.*` files except `.env.example` are ignored. Browser users sign with their own injected wallet.

The deployment scripts also accept the non-Vite aliases `GENLAYER_NODE_RPC_URL`, `GENLAYER_CHAIN_RPC_URL`, and `WEATHERPACT_CONTRACT_ADDRESS`; they fall back to the corresponding public variables above.

## Bradbury verification and deployment

Target identity is hard-coded and checked before deployment and before frontend reads/writes:

- chain ID: **`4221`**;
- genesis: **`0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4`**;
- AddressManager: **`0x3F71AE080BD6270A91dBcc7960d88797828538E0`**.

The verifier checks both the node and chain RPC, deployed AddressManager code, the consensus contract's AddressManager pointer, source code/schema through `gen_*`, and—when a contract address is supplied—the deployed code/schema and an actual `get_metadata` read through `gen_call`.

1. Obtain a qualified Phase 2 GenLayer node RPC from the official release/network instructions or operate a compatible node. Configure its public URL in `.env`; leave the contract address empty before deployment.
2. Configure a signer using the official CLI's encrypted account flow, or choose browser signing. Keep all signing material outside Vite and outside Git.

   ```bash
   npx --no-install genlayer account create
   ```

3. Run the read-only guard. It makes no write and needs no funds.

   ```bash
   npm run verify:network
   ```

4. Only after it passes, deploy with the pinned CLI. Use `--wallet browser` for browser signing, or omit it to use the CLI's configured encrypted account. Any approved fee-profile/CLI options can be appended; `--rpc` and `--contract` overrides are deliberately rejected by the guard.

   ```bash
   npm run deploy:contract -- --wallet browser
   ```

   The browser adapter estimates each exact write with `estimateTransactionFeesForWrite` and submits the SDK-returned fee options at current network prices. No measured WeatherPact fee-profile file is included or invented. Generate and validate a representative profile with the official Phase 2 fee tooling before relying on a static profile; live fee estimation and live writes remain unexecuted here.

5. Set `VITE_WEATHERPACT_CONTRACT_ADDRESS` to the actual address returned by a successful deployment, then verify that exact deployment and build:

   ```bash
   npm run verify:network -- --require-contract
   npm run build
   ```

Any identity mismatch, missing method, malformed response, unreachable endpoint, missing credentials/funds, or signing failure stops the flow. Do not bypass the guard. In this workspace the precise remaining blocker is the absence of a qualified GenLayer node RPC; therefore no deployment or on-chain write was attempted.

## Transaction safety and UI behavior

- Injected-wallet writes require the connected account and chain `4221`; wallet switching can request the documented chain configuration.
- A GenLayer consensus transaction ID—not merely an EVM envelope hash—is persisted as soon as the SDK returns it.
- Tracking uses `waitForFinalization`, followed by the SDK `isSuccessful` check. Accepted/finalized alone is not presented as successful execution.
- A tracking interruption keeps the UI in a resumable state and offers **Resume same transaction**. It does not blindly submit another write.
- Durable reads use `TransactionHashVariant.LATEST_FINAL`. Real records receive no invented transaction hashes; creation/resolution hashes are shown only when present in this browser's journal.
- A newly created pact ID is linked only when one unambiguous matching finalized record is found. Otherwise the successful transaction remains visible without guessing a record.
- Preview records are isolated, labelled, excluded from real statistics/reputation, and cannot earn achievements or enable genuine writes.

## Static deployment

`dist/` is a static Vite SPA. Configure all application routes to rewrite to `index.html`.

- `vercel.json` contains the Vercel SPA rewrite.
- `public/_redirects` supports hosts using that convention.

No backend is required. A production deployment must permit browser access to the qualified GenLayer node and `https://geocoding-api.open-meteo.com` for city search. Manual coordinates/timezone remain available.

## Project map

```text
contracts/weatherpact.py          Authoritative Python Intelligent Contract
scripts/verify-network.mjs       Read-only Bradbury + GenVM qualification
scripts/deploy.mjs               Guarded pinned-CLI deployment
src/client/                      Real/preview adapters, network guard, tx journal
src/components/                  Accessible shell, evidence, forms, UI primitives
src/context/                     Contract-data and injected-wallet boundaries
src/data/preview-data.ts         Isolated illustrative-only records
src/pages/                       Existing seven-route product UI
tests/direct/                    Official GenLayer Direct Mode tests
tests/network/                   Local JSON-RPC qualification tests
tests/client/                    Transaction-journal recovery tests
```
