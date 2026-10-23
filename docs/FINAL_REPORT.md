# ProofPath final A–J handoff

Date: **2026-10-23 UTC**  
Overall status: **implemented and locally verified within deterministic scope; not submission-ready because live runtime, public deployment, and public video gates remain unresolved.**

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

Custom editorial interface with self-hosted DM Sans/Newsreader, deep navy/teal palette, source ledger, inspectable quotes, responsive forms, loading/empty/error states, and mobile stacking. Three actual browser screenshots are in `docs/screenshots/`.

Real Chromium checks at 1440 px and 375 px passed; no horizontal mobile overflow was found. axe WCAG A/AA scans returned no violations on home and sample plan after contrast and accessible-name fixes. This is not a manual screen-reader audit or complete browser/device matrix.

## G — Tests and evaluation

Observed locally:

- TypeScript and production build: PASS
- Vitest: **39/39 PASS** across six files
- Playwright: **6/6 PASS** against the production build
- Evaluation: **12/12 PASS**
- npm audit: **0 known vulnerabilities** at run time

The evaluation artifact is generated from executed cases, not hard-coded success. It measures final citation coverage, raw supported-claim rejection, conflict detection, missing information, mocked-provider end-to-end completion, provider failures, and local fixture latency. See `docs/TEST_REPORT.md`, `docs/EVALUATION.md`, and `docs/evaluation/cases.json`. No live model-quality benchmark is claimed.

## H — Deployment and infrastructure

A separate Vercel project named `proofpath` was created without changing the existing WeatherPact project. Vite/static + Express catch-all function configuration, SPA rewrites, security headers, 60-second function budget, and Node production serving are implemented.

**Public deployment URL:** `[PENDING ACTUAL DEPLOYMENT]`  
**Deployed commit:** `[PENDING]`  
**Post-deployment browser/API verification:** `[PENDING]`

See `docs/DEPLOYMENT.md` for the exact verification gate. A static/sample deployment alone will not clear the live Nebius requirement.

## I — Demo and submission material

Complete in the worktree: README, MIT license, environment template, architecture, deployment guide, CI, compliance matrix, test/evaluation reports, three screenshots, timestamped **2:45** demo script/storyboard, Devpost draft, and this handoff.

**Public YouTube video:** not recorded or uploaded. Recording genuine live shots is blocked by the same credential gap, and no YouTube publishing connection is available. No URL is invented. Sponsor feedback is drafted but not represented as submitted.

## J — Exact blockers and next actions

1. **Mandatory Nebius runtime:** provision a valid Token Factory key; run `npm run verify:live`; then complete a real deployed UK passport plan and retain its genuine response receipt.
2. **Public demo:** deploy the exact tested branch to the separate `proofpath` Vercel project; verify health, routes, headers, sample, real workflow, and clean-browser public access; record URL and commit.
3. **Public video:** record the genuine workflow using `docs/DEMO_SCRIPT.md`, keep it under three minutes, upload publicly to YouTube, and insert the actual URL.
4. **Submission:** push the final public branch, confirm license detection, enter verified links and feedback in Devpost, and confirm personal eligibility/access. Do not claim Tavily bonus without its own genuine call.
5. **Residual product limits:** exact quotes do not prove semantics; source freshness/authority needs human judgment; PDF/image extraction, distributed rate limiting, account sync, and high-traffic operations are outside this small release.

Until those external gates are resolved, the accurate description is: **a complete, locally tested ProofPath implementation with an unavailable mandatory live-inference dependency—not a verified hackathon submission.**
