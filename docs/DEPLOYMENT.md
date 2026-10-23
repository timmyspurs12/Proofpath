# Deployment and infrastructure

## Current observed state

- **Vercel project:** `proofpath` was created as a separate project on 2026-10-23; the existing `weatherpact` project was not modified.
- **Public deployment:** not yet deployed when this document was first written. This section must be updated only from a successful deployment result.
- **Live inference:** no Nebius credential is available in the shell and the Vercel team has no shared Nebius/Tavily variables. No live runtime is claimed.
- **Local production preview:** `npm start` serves the compiled app and API on `0.0.0.0:3000`; real Chromium checks passed against it.

## Vercel topology

```text
Browser
  ├─ static Vite assets / client-side routes
  └─ relative /api/*
          └─ api/[...path].ts → the same Express app
                   ├─ Nebius Token Factory (server credential)
                   ├─ optional Tavily Search (server credential)
                   └─ explicit public-source retrieval
```

- Framework preset: Vite
- Install: `npm ci`
- Build: `npm run build`
- Output: `dist`
- Function: `api/[...path].ts`, exported maximum duration 60 seconds
- Project Node version observed at creation: 24.x; repository supports Node 20.19+
- Plan: Hobby observed on the connected team; no paid service is required for the static/sample deployment
- Region: `iad1` observed in project settings; not a latency guarantee
- Saved plans: browser localStorage only; the function filesystem is never used for persistence

`vercel.json` contains SPA rewrites and baseline CSP/frame/referrer/MIME headers. The Express app adds no-store API responses, request IDs, conservative limits, and security headers. Static source maps are public consistent with the open-source repository; no secrets belong in source maps.

## Required project environment for real workflows

Set these with Vercel’s encrypted/sensitive environment-variable controls for Production and Preview as appropriate:

```text
NEBIUS_API_KEY=<real server-side value>
NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1
NEBIUS_MODEL=nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B
# Optional:
TAVILY_API_KEY=<real server-side value>
```

Do not put values in Git, Vite variables, this document, screenshots, or browser code. A health response with `liveInferenceConfigured: true` means only that a value exists; a successful plan receipt is required to prove inference.

## Reproduce a Git deployment

After pushing the desired submission branch to the public repository, create a deployment in the separate `proofpath` project from that exact Git ref. Do not deploy the archived `main` WeatherPact source by mistake. A final submission should identify the deployed commit SHA and keep it aligned with the tested source.

For a dashboard-created Git integration, select:

1. Repository `timmyspurs12/WeatherPact` and the ProofPath submission ref.
2. Vite framework, `npm ci`, `npm run build`, output `dist`.
3. The environment variables above.
4. Deploy, then run every check below before sharing the URL.

## Post-deployment verification gate

Replace `$BASE` with the actual HTTPS deployment origin only after it exists:

```bash
curl -i "$BASE/api/health"
curl -I "$BASE/plans/current"
curl -I "$BASE/saved"
curl -I "$BASE/about"
curl -i "$BASE/evaluation.json"
```

Then verify in a clean browser profile:

- Home, direct client-side routes, and static fonts/icons load without console/CSP errors.
- The sample is labelled, all six steps appear, evidence opens, and Markdown downloads.
- Save a plan, reload, and confirm progress persists in that browser.
- A 375 px viewport has no horizontal page overflow.
- API and static responses include the expected security headers.
- `GET /api/health` truthfully reflects configuration.
- If no key is configured, a real request returns `LIVE_INFERENCE_UNAVAILABLE` rather than a plan.
- If a key is configured, run the complete real UK passport workflow and record the actual model/response ID from its runtime receipt. Do not use the sample as this check.
- Run `npm run test:e2e` with `PLAYWRIGHT_BASE_URL=$BASE` and `npm run screenshots` only against the verified deployed commit.

A successful static deployment does not prove Nebius inference, Tavily discovery, judge accessibility through the full judging window, or production reliability.

## Alternative single-process Node host

```bash
npm ci
npm run evaluate
npm run build
# Set server environment variables, then:
npm start
```

The process listens on `0.0.0.0` and `PORT`/`API_PORT` (default 3000). The host must support long-lived Node processes and outbound HTTPS. No Docker, GPU, database, or local model is required. Keep the process behind HTTPS and a production process manager; the included command is deliberately small, not a complete operations platform.

## Cost and scaling boundaries

Published Nebius/Tavily prices are documented in the research notes; actual cost is measured only from real token/credit receipts. Per-instance rate limits are best effort and not a distributed quota system. Six sources, bounded bodies/text, limited model attempts, and 60-second function duration constrain resource use. A high-traffic launch would need distributed rate limiting, observability, privacy review, and provider quota planning not claimed here.
