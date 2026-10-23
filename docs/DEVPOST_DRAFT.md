# Devpost submission draft — not submitted

**Project name:** ProofPath — Evidence-to-Action Engine  
**Track:** Best Apps and Agents  
**Tagline:** Ordered action plans where every important step shows its evidence—and every gap stays visible.

> Do not publish this draft as a compliant entry until the bracketed runtime, repository-ref, and video fields are replaced with verified facts. The public demo URL is verified only for the static/sample scope described below.

## Elevator pitch

Administrative instructions are often scattered across dense pages, conditions, fees, and warnings. ProofPath turns a concrete task and official sources into an ordered, editable checklist with completion criteria. NVIDIA Nemotron proposes the plan through Nebius Token Factory; deterministic code verifies exact supporting passages before a step can remain “supported.”

## Inspiration

People navigating public processes do not only need a summary—they need to know what to do first, what applies to them, what counts as done, and which claims deserve confidence. Research on administrative burden identifies learning and compliance costs as real obstacles. Our design question was: can an AI workflow reduce that burden without hiding uncertainty behind fluent prose?

Research and official citations: `docs/research/OFFICIAL_REQUIREMENTS.md` and `docs/research/IDEA_SCORECARD.md`.

## What it does

- Clarifies a user’s concrete goal, jurisdiction, category, and essential context.
- Retrieves supplied official HTML/text pages and uploads, with optional Tavily source discovery.
- Uses NVIDIA Nemotron through Nebius Token Factory to draft an ordered action plan with exact citations.
- Deterministically removes invalid citations and unsupported dates, rejects weak conflicts, and repairs dependency cycles.
- Labels steps **Supported by source**, **Inferred — confirm**, **Conflicting evidence**, or **Unable to verify**.
- Shows publisher, URL, retrieval time, source hash, evidence passages, conflicts, and unresolved questions.
- Supports editing, custom steps, completion tracking, explicit browser saves, Markdown/JSON export, printing, and user-requested source rechecks.
- Includes a conspicuously labelled static sample for interface testing without pretending it is live inference.

## How we built it

The client uses React, TypeScript, Vite, and custom responsive CSS. A small Express server keeps Nebius/Tavily credentials off the browser, requests JSON Schema from Token Factory, validates output with Zod, retrieves bounded source text, and applies the evidence gate. Plans are stored only after an explicit save to browser localStorage; exports provide portability. The same Express app runs as a Vercel function or a single Node process.

**Default model:** `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`  
**Live verification:** `[INSERT ACTUAL MODEL RESPONSE ID AND DATE AFTER GENUINE RUN — CURRENTLY BLOCKED]`

## What makes it different

The model cannot grant its own claims a supported label. Code checks each citation against retrieved passages, keeps model interpretation separate from source text, and downgrades factual user edits. ProofPath is deliberately not a general chatbot, eligibility decider, legal adviser, or application-submission bot.

## Challenges

- Making exact evidence validation meaningful without pretending it proves semantic correctness or source authority.
- Handling malformed output, weak conflicts, unsupported dates, and dependency cycles without silently dropping uncertainty.
- Building bounded retrieval with redirect checks, content limits, timeouts, and explicit source rechecks.
- Keeping the workflow small and responsive while making evidence easy to inspect.
- Distinguishing deterministic fixtures from genuine live-model evaluation at every layer.

## Accomplishments

The implementation includes the complete local workflow, deterministic evidence gate, labelled sample, persistent local library, exports, source-recheck endpoint, deployment configuration, reproducible evaluation, and real browser tests. The redesigned interface pairs an editorial landing page with a quiet plan-and-evidence workspace, visible prerequisites, accessible confirmation dialogs, and mobile navigation. In the documented local run, **41 unit/API/component tests, 12 Chromium E2E tests, and 12 evaluation cases** passed. Tested axe scans with WCAG 2.2 AA tags returned no violations, and all four main routes passed overflow checks at six viewport widths.

**Live Nebius/Tavily performance is not claimed without receipts.**

## What we learned

Structured output is necessary but not sufficient: a perfectly valid JSON object can still contain invented evidence. A second, deterministic trust boundary makes those failures inspectable. UX also has to make uncertainty readable rather than hide it in a disclaimer.

## What’s next

- Complete genuine deployed Nebius verification and record the public demo.
- Expand representative, jurisdiction-specific live evaluation with human semantic review.
- Add accessible PDF extraction only if it can preserve passage provenance.
- Improve change-aware re-planning without silently rewriting user edits.
- Add optional encrypted/synced storage only with a clear authentication and privacy model.

## Built with

React · TypeScript · Express · Vite · Zod · Cheerio · NVIDIA Nemotron 3 Nano 30B A3B · Nebius Token Factory · Optional Tavily Search · Vercel · Playwright · Vitest

## Submission links

- **Working demo:** `https://proofpath-woad.vercel.app` — public static/sample deployment; genuine live workflow remains blocked.
- **Source code:** `https://github.com/timmyspurs12/WeatherPact` — `[INSERT EXACT SUBMISSION REF/COMMIT]`
- **Public YouTube video (<3:00):** `[INSERT ACTUAL PUBLIC URL — NOT RECORDED]`
- **Runtime receipt:** `[INSERT REAL NEBIUS RESPONSE ID — BLOCKED]`
- **Tavily bonus:** Do not claim unless a genuine runtime call is observed; none is claimed in this draft.

## Sponsor/tool feedback draft

“ProofPath used structured Nemotron output for intake and evidence-linked planning. The most important engineering lesson was that schema validity does not establish evidentiary validity, so we added deterministic exact-passage checks and explicit uncertainty states. Clear model-catalog IDs and JSON-Schema controls helped keep the implementation small. For this use case, documented per-model structured-output behavior, visible request IDs, and straightforward account-level Zero Data Retention controls are especially important. Tavily is used only for URL discovery; retrieved publisher passages—not generated search answers—are the evidence.”

This is draft feedback for the entrant to submit; it is not represented as already submitted.
