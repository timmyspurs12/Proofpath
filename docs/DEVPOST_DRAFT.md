# Devpost submission draft — not submitted

**Project name:** ProofPath — Evidence-to-Action Engine  
**Track:** Best Apps and Agents  
**Tagline:** Ordered action plans where every important step shows its evidence—and every gap stays visible.

> **Draft status: not submitted.** The video URL and submission-confirmation fields remain explicit placeholders. Runtime facts below are limited to two production runs that occurred **before the latest evidence-gap remediation was merged** (commit `c03f5e3a0f6b81a61bfa5c63a6fa0c7ef2f64f1a`). Those receipts establish that genuine live inference works in the deployed application; they do not establish that the post-remediation acceptance criteria pass. No Devpost submission has been made.

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
**Live verification — observed production runs (both pre-remediation):**

- `chatcmpl-e74616bc-3bdf-47c2-bbb8-2dd9fa5be457` — genuine live Nebius Token Factory response in the deployed application; reported model latency **11.9 s**.
- `chatcmpl-2aff50c9-9aa7-4db7-9f6b-311fe50e44fe` — genuine live response, reported model latency **7.2 s**, token usage 11,734 input / 2,096 output (13,830 total); the resulting plan had **11 steps, of which 9 were source-supported** after the evidence gate removed 7 invalid citations; retrieval used 7 direct sources and 1 Tavily discovery call.

Both runs happened **before** the evidence-gap remediation (fee-question resolution, citation-fidelity prompt hardening, processing/collection split) was merged in commit `c03f5e3`. They evidence successful live inference and strict fail-closed citation behavior, not post-remediation acceptance. A fresh post-deploy live run confirming the remediated behavior is still pending and must not be claimed in advance.

## What makes it different

The model cannot grant its own claims a supported label. Code checks each citation against retrieved passages, keeps model interpretation separate from source text, and downgrades factual user edits. ProofPath is deliberately not a general chatbot, eligibility decider, legal adviser, or application-submission bot.

## Challenges

- Making exact evidence validation meaningful without pretending it proves semantic correctness or source authority.
- Handling malformed output, weak conflicts, unsupported dates, and dependency cycles without silently dropping uncertainty.
- Building bounded retrieval with redirect checks, content limits, timeouts, and explicit source rechecks.
- Keeping the workflow small and responsive while making evidence easy to inspect.
- Distinguishing deterministic fixtures from genuine live-model evaluation at every layer.

## Accomplishments

The implementation includes the complete local workflow, deterministic evidence gate, labelled sample, persistent local library, exports, source-recheck endpoint, deployment configuration, reproducible evaluation, and real browser tests. The redesigned interface pairs an editorial landing page with a quiet plan-and-evidence workspace, visible prerequisites, accessible confirmation dialogs, and mobile navigation.

**Current deterministic and CI evidence at merged commit `c03f5e3`:**

- **254 Vitest tests across 22 files**, including a frozen regression fixture built from the observed live run: fee-question resolution, appointment-citation fidelity, and the processing-timeline/collection split.
- **25/25 deterministic evaluation cases** in the reproducible evaluation harness.
- **14/14 Playwright browser tests**, including axe scans with WCAG 2.2 A/AA tags returning no violations, plus horizontal-overflow checks at six viewport widths.
- Clean TypeScript typecheck, successful production build, and a passing serverless bundle smoke test (HTTP 200).

These are CI and deterministic fixture results, **not live-model accuracy measurements**: they prove the evidence gate's behavior on frozen inputs, while live model output is only established by genuine keyed runs. No `verify:live` post-remediation acceptance run is claimed. Individual live inference receipts are listed under "How we built it"; no throughput, uptime, latency-SLA, or model-accuracy benchmark is claimed from them.

## What we learned

Structured output is necessary but not sufficient: a perfectly valid JSON object can still contain invented evidence. A second, deterministic trust boundary makes those failures inspectable. UX also has to make uncertainty readable rather than hide it in a disclaimer.

## What’s next

- Run the deployed Nigeria domestic-renewal case again **after** the `c03f5e3` remediation to confirm the fee question is removed, the appointment step carries valid exact-passage citations, and collection remains unresolved without official evidence; then record the public demo video.
- Expand representative, jurisdiction-specific live evaluation with human semantic review.
- Add accessible PDF extraction only if it can preserve passage provenance.
- Improve change-aware re-planning without silently rewriting user edits.
- Add optional encrypted/synced storage only with a clear authentication and privacy model.

## Built with

React · TypeScript · Express · Vite · Zod · Cheerio · NVIDIA Nemotron 3 Nano 30B A3B · Nebius Token Factory · Optional Tavily Search · Vercel · Playwright · Vitest

## Submission links

- **Working demo:** `https://proofpath-woad.vercel.app` — Vercel production deployment of merged commit `c03f5e3a0f6b81a61bfa5c63a6fa0c7ef2f64f1a`. Genuine live Nebius inference was observed here in the two pre-remediation runs listed above; the application also contains a conspicuously labelled static sample that never presents itself as live inference. Post-remediation live acceptance remains pending.
- **Source code:** `https://github.com/timmyspurs12/Proofpath` — current merged `main` commit at drafting time: `c03f5e3a0f6b81a61bfa5c63a6fa0c7ef2f64f1a` (MIT licensed).
- **Public YouTube video (<3:00):** `[INSERT ACTUAL PUBLIC URL — NO VIDEO HAS BEEN RECORDED OR UPLOADED YET]`
- **Runtime receipts (observed production runs, both pre-remediation):** `chatcmpl-e74616bc-3bdf-47c2-bbb8-2dd9fa5be457` (11.9 s) and `chatcmpl-2aff50c9-9aa7-4db7-9f6b-311fe50e44fe` (7.2 s; 11 steps, 9 source-supported). These identify genuine provider responses; they are not post-remediation acceptance evidence.
- **Tavily:** the later observed run included one genuine Tavily discovery call (reported Tavily request id `89f6af23-3947-45de-a535-8aac17427b3d`) alongside seven direct source fetches; Tavily is used for URL discovery only, and retrieved publisher passages—not generated search answers—are the evidence. No sponsor bonus or award is claimed in this draft.

## Sponsor/tool feedback draft

“ProofPath used structured Nemotron output for intake and evidence-linked planning. The most important engineering lesson was that schema validity does not establish evidentiary validity, so we added deterministic exact-passage checks and explicit uncertainty states. Clear model-catalog IDs and JSON-Schema controls helped keep the implementation small. For this use case, documented per-model structured-output behavior, visible request IDs, and straightforward account-level Zero Data Retention controls are especially important. Tavily is used only for URL discovery; retrieved publisher passages—not generated search answers—are the evidence.”

This is draft feedback for the entrant to submit; it is not represented as already submitted.
