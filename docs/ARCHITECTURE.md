# ProofPath architecture and implementation plan

## Product boundary

ProofPath turns a user-defined administrative task plus retrieved official instructions into an editable, evidence-linked action plan. It does **not** determine legal eligibility, submit applications, book travel, provide legal advice, or silently browse/recheck sources.

Track: **Best Apps and Agents**.

## Stack

- **Client:** React 19, TypeScript, Vite, plain CSS, Lucide icons.
- **Server:** small Express application written in TypeScript; native `fetch`, Zod validation, Cheerio for HTML-to-text.
- **Local development:** Vite on port 5173 proxies relative `/api` requests to Express on port 3000. Both bind `0.0.0.0`; no browser code calls localhost.
- **Deployment:** static Vite output plus the same Express handler as a Vercel catch-all function. `npm run build` explicitly bundles `server/vercel-entry.ts` and all server/shared dependencies into ignored `server-dist/vercel-entry.mjs`; a tracked `api/[...path].ts` discovery wrapper and Vercel `includeFiles` rule package it. The exact bundle is smoke-tested with plain Node. This avoids the missing-module, undiscovered-function, and ESM dynamic-require failures observed in real deployments. `npm run start` also serves the production build from a single Node process for other hosts.
- **Persistence:** explicit browser `localStorage` only. Plans and checkbox state survive local/browser restarts but are not synced across devices. There is no account or server-side plan store. Exports provide portability. No ephemeral server filesystem is used for saved plans.

## Runtime flow

```text
Task + jurisdiction + category + optional text document/source URLs
                         │
                         ▼
             POST /api/intake
       Nemotron Nano via Nebius Token Factory
      goal + essential questions + retrieval queries
                         │ answers
                         ▼
        Tavily search (if configured) + direct URLs
              bounded, safe HTTP retrieval
        publisher / URL / retrieval time / text / hash
                         │
                         ▼
              POST /api/plans
       Nemotron Nano, JSON Schema + Zod validation
                         │
                         ▼
        Deterministic evidence gate (not model-controlled)
  exact passage exists? source known? conflicts? edits? cycles?
                         │
                         ▼
 supported / inferred / conflicting / unable-to-verify plan
        inspect evidence → edit → check off → save/export
                         │
             explicit source recheck only
```

## Trust boundaries

1. **Model claims are proposals.** A model cannot mark itself supported. The evidence gate recomputes status from retrieved source text.
2. **Quotes must exist.** Whitespace/typography-normalized exact passage matching is required. Invalid or unknown source IDs lose supported status.
3. **Authority is descriptive.** Domain heuristics label likely official sources but never declare a page authoritative merely because it was retrieved. Publisher and URL stay visible.
4. **Uncertainty survives.** Unsupported steps remain explicitly unverifiable; missing evidence becomes an unresolved question rather than an invented requirement.
5. **User edits matter.** Editing a model instruction downgrades it to `inferred`; adding a custom step also starts as inferred.
6. **Dependencies are checked.** Unknown or cyclic step dependencies are removed and surfaced as warnings.
7. **Sources are untrusted input.** Retrieval instructions embedded in pages are data, not system instructions. HTML scripts/styles are discarded.
8. **No silent verification.** Source hashes and availability are refreshed only when the user presses “Recheck sources.”

## Provider controls

- Server-only `NEBIUS_API_KEY`; configurable HTTPS base URL restricted to Nebius Token Factory hosts.
- Default `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`; model ID must start `nvidia/`.
- JSON Schema requested and Zod enforced; malformed outputs fail closed.
- Intake timeout 20s with at most two attempts and jittered backoff for retryable failures; plan timeout 35s with one attempt so retrieval + inference stays within the declared 60-second function budget. Users can explicitly retry a failed plan. Tavily discovery is capped at 10s and each source retrieval at 8s.
- Maximum task/document/source sizes, six retrieved sources, bounded extracted text, and per-instance best-effort IP rate limits.
- Logs contain request ID, route, status, model, latency, and token counts—never task text, source content, API keys, or saved plan contents.
- Runtime receipts expose provider, exact model, response ID (when supplied), latency, token usage, and retrieval counts. Plan/source records carry their own timestamps. Sample data uses `mode: sample` and no invented response ID.

## API surface

- `GET /api/health` — configuration and capability state; does not claim a live call.
- `POST /api/intake` — genuine Nebius intake inference.
- `POST /api/plans` — retrieval and genuine Nebius plan inference followed by deterministic evidence validation.
- `POST /api/sources/verify` — explicit URL availability/content-hash recheck; no model call.

All errors use stable machine-readable codes. Missing credentials produce `LIVE_INFERENCE_UNAVAILABLE`; no offline output is mislabeled as live.

## Implementation sequence

1. Preserve the pre-existing WeatherPact source under `legacy/weatherpact`; record research and selection.
2. Build shared schemas, Nebius/Tavily clients, safe retrieval, evidence validation, and tests.
3. Build the complete intake → clarify → plan → inspect/edit/check/save/export workflow.
4. Add a conspicuously labelled static sample for interface evaluation only; live requests fail honestly when unconfigured.
5. Add deterministic fixtures, adversarial model responses, conflict/missing-source/provider-failure tests, and an evaluation runner with a live opt-in path.
6. Run unit/workflow tests, type checks, production build, and browser checks; fix failures.
7. Deploy if connected hosting permits, then verify the deployed UI and—only with credentials—live inference.
8. Finish README, compliance matrix, measured test report, screenshots, demo script/storyboard, blockers, and Devpost draft.

## Resource and cost posture

No GPU, Docker, database, local model, or paid UI service is required. Hosted inference is the only mandatory AI service. Tavily is optional for discovery. Published price references and free-tier caveats are documented in `docs/research/OFFICIAL_REQUIREMENTS.md`; actual spend is not estimated without token measurements.
