# ProofPath final A–J handoff

Date: **2026-10-23 UTC**  
Overall status: **redesigned and verified within deterministic/static scope; not submission-ready because genuine live Nebius inference and the public video gate remain unresolved.** A public static/sample deployment exists, but it does not prove live-provider compliance.

## A — Product and track

**ProofPath — Evidence-to-Action Engine**, selected for **Best Apps and Agents**. It turns official administrative instructions into an ordered, editable checklist with completion criteria, evidence states, saving, export, and explicit rechecking. It is not a general chatbot, legal adviser, eligibility decider, or application-submission system.

## B — Research and selection

Nine distinct concepts were evaluated against the requested 100-point rubric. Final scores: ProofPath **88**, A11yPatch 83, RecallRoute 77, CI Forensics 75, BinRule 75, FieldProof 74, PolicyDelta 72, DriftGuide 71, ManualMend 70. Official rules, Nebius/NVIDIA/Tavily documentation, pain evidence, and same-hackathon overlaps are cited in:

- `docs/research/OFFICIAL_REQUIREMENTS.md`
- `docs/research/IDEA_SCORECARD.md`
- `docs/decisions/0001-select-proofpath.md`

FinePrint was identified as close overlap; ProofPath’s differentiation is the complete editable action workflow and deterministic evidence-state lifecycle, not merely rule analysis.

## C — Working application

Implemented: task intake, jurisdiction/category/context, essential clarification, direct/uploaded/discovered source paths, structured planning, evidence inspection, four states, conflicts, unresolved questions, ordered dependencies, editing/add/delete, completion, local saves, Markdown/JSON/print export, saved-plan library, and explicit source rechecks.

The original WeatherPact application is preserved as a 64-file archive in `legacy/weatherpact/` and at commit `cde3ec2e2637accaf8db1656237721820ef1b564`. It is not counted as ProofPath work.

## D — AI runtime and model

Default exact model: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` through `https://api.tokenfactory.nebius.com/v1/chat/completions`.

Implemented server-side JSON-Schema requests, Zod validation, bounded timeouts/attempts, model configuration restricted to NVIDIA IDs, and runtime receipts. **No genuine Nebius response has been observed in this workspace because no credential is available.** The Vercel team has no shared Nebius/Tavily variables. The static sample is explicitly non-live. Run `npm run verify:live` after provisioning access; do not infer compliance from mocks.

Tavily basic discovery is implemented optionally, but **no genuine Tavily call or bonus eligibility is claimed**.

## E — Engineering and security

- React 19 + TypeScript + Vite client; Express 5 TypeScript server; Vercel function and single-process production entry.
- Server-only credentials; no browser secret paths; relative API URLs.
- Official HTTPS Token Factory host allowlist; model/output validation; stable API error codes.
- Public-address checks on initial URLs and redirects, response/content/source limits, timeouts, best-effort per-instance rate limits.
- Exact contiguous citation checks; date-specific evidence; two-source conflict threshold; dependency-cycle cleanup; bounded notes.
- No server plan store; localStorage survives reload only in the same browser; export is the backup path.
- Security limits, including residual DNS-rebinding and semantic-entailment risk, are documented rather than presented as solved.

## F — Design and accessibility

The **Quiet Intelligence** redesign uses warm porcelain, deep ink, petrol, sage, amber, and muted red tokens with self-hosted DM Sans/Newsreader. Serif is reserved for the landing promise and evidence quotations. Home contains an authentic sample-plan preview and immediate composer; the workspace uses an editorial action path, visible prerequisites, exact passages, a source ledger, compact progress/export controls, explicit conflicts, and unresolved questions. Saved, About, loading, empty, error, editing, and confirmation states share the same system. Mobile navigation remains operable at 320 px.

Six full-page views and twelve viewport captures are in `docs/screenshots/`; expanded evidence, editing, dialog, error, empty, and missing-plan states were also visually inspected. Home, Plan, About, and Saved passed horizontal-overflow checks at **1440, 1280, 1024, 768, 390, and 320 px**. Tested axe scans with WCAG 2.2 AA tags returned no violations on desktop Home/Plan and mobile Home/Plan/About/Saved/dialog. This is not a manual screen-reader audit, complete WCAG certification, or multi-engine browser matrix.

## G — Tests and evaluation

Observed locally:

- TypeScript and production build: PASS
- Generated Vercel function plain-Node smoke test: PASS (honest HTTP 200 health)
- Vitest: **41/41 PASS** across seven files
- Playwright: **12/12 PASS** against the production build
- Evaluation: **12/12 PASS**
- npm audit: **0 known vulnerabilities** at run time

GitHub Actions run **40023411588** independently passed the full CI gate, including **12/12** Chromium scenarios and the dependency audit. A Vite-only CSP gap and a newly published Zod advisory were fixed before that green run; details remain in `docs/TEST_REPORT.md`.

The evaluation artifact is generated from executed cases, not hard-coded success. It measures final citation coverage, raw supported-claim rejection, conflict detection, missing information, mocked-provider end-to-end completion, provider failures, and local fixture latency. See `docs/TEST_REPORT.md`, `docs/EVALUATION.md`, and `docs/evaluation/cases.json`. No live model-quality benchmark is claimed.

## H — Deployment and infrastructure

A separate Vercel project named `proofpath` was created without changing the existing WeatherPact project. Vite/static + Express catch-all function configuration, SPA rewrites, security headers, 60-second function budget, and Node production serving are implemented.

- **Public deployment URL:** `https://proofpath-woad.vercel.app`
- **Deployed commit and deployment ID:** recorded from observed Vercel results in `docs/DEPLOYMENT.md`
- **Post-deployment browser/API verification:** recorded separately in `docs/DEPLOYMENT.md`; local success is not substituted for hosted verification

A static/sample deployment alone does not clear the live Nebius requirement.

## I — Demo and submission material

Complete in the worktree: README, MIT license, environment template, architecture, deployment guide, CI, compliance matrix, test/evaluation reports, eighteen durable screenshots, timestamped **2:45** demo script/storyboard, Devpost draft, and this handoff.

**Public YouTube video:** not recorded or uploaded. Recording genuine live shots is blocked by the same credential gap, and no YouTube publishing connection is available. No URL is invented. Sponsor feedback is drafted but not represented as submitted.

## J — Exact blockers and next actions

1. **Mandatory Nebius runtime:** provision a valid Token Factory key; run `npm run verify:live`; then complete a real deployed UK passport plan and retain its genuine response receipt.
2. **Provider privacy and optional bonus:** resolve the requested 30-day retention behavior from actual Nebius account/documentation evidence. Run a genuine Tavily call only if claiming its bonus; mocks and configuration flags prove neither.
3. **Public video:** record the genuine workflow using `docs/DEMO_SCRIPT.md`, keep it under three minutes, upload publicly to YouTube, and insert the actual URL.
4. **Submission:** push the final public branch, confirm license detection, enter verified links and feedback in Devpost, and confirm personal eligibility/access. Keep the deployed commit aligned with the tested runtime.
5. **Residual product limits:** exact quotes do not prove semantics; source freshness/authority needs human judgment; PDF/image extraction, distributed rate limiting, account sync, and high-traffic operations are outside this small release.

Until those external gates are resolved, the accurate description is: **a redesigned, locally tested ProofPath implementation with a public static/sample demo but unavailable mandatory live inference and no public video—not a verified hackathon submission.**
