# ProofPath demo — 2:45 script and storyboard

**Target duration: 165 seconds. Track: Best Apps and Agents.**

> **Recording gate:** shots marked LIVE must show a genuine Nebius response from the deployed app. Do not substitute the static sample, a mock response, or a rehearsed screenshot and describe it as live. Until credentials and a real deployed workflow are verified, this is a script—not evidence that a compliant video exists.

## Production setup

- Record the deployed production build in a clean 1440 × 900 browser at 110% zoom if needed for legibility.
- Use the real UK passport task and current official GOV.UK URLs. Recheck the pages before recording; do not assume the sample’s fee/date remains current.
- Complete one genuine run first to understand the clarification and latency. During the video, either show the real request continuing in real time or disclose a time cut on screen. Never speed up a receipt or invent one.
- Keep the runtime receipt visible for the model/response-ID shot. Do not show `.env`, account dashboards with secrets, personal passport data, or real identity documents.
- Capture a separate static-code view of `server/lib/evidence.ts` and `docs/EVALUATION.md`.
- Add captions. Keep narration at a calm conversational pace; trim pauses rather than adding more features.

## Timestamped storyboard and narration

### 0:00–0:12 — Hook (12s)

**Visual:** Close on a dense official instruction page, then cut to the ProofPath plan with an evidence quote open.

**Narration:** “Official instructions tell you what’s required. They rarely give you a clear way to finish. ProofPath turns them into an action plan—with the proof attached.”

### 0:12–0:30 — Problem and distinction (18s)

**Visual:** Home screen; highlight the words “ordered checklist,” “evidence,” and “gap.”

**Narration:** “This isn’t another summary chatbot. It orders the work, defines what ‘done’ means, and keeps unsupported claims visible. The model proposes the path; deterministic code decides whether a supported label has a real passage behind it.”

### 0:30–0:48 — Real task and sources (18s)

**Visual:** Click **Fill a real UK passport task**. Show task, jurisdiction, details, and the two GOV.UK URLs.

**Narration:** “Here’s a real task: renew an adult UK passport online. Jurisdiction and personal context stay explicit. I’ve supplied two official pages, so the plan has inspectable source material—not model memory dressed up as fact.”

### 0:48–1:05 — LIVE intake and clarification (17s)

**Visual:** Submit. Show the real generating state, then any actual clarification. If none is needed, show the transition directly to plan retrieval.

**Narration:** “Nemotron runs through Nebius Token Factory. It identifies the goal and asks only for missing details that change the process. If something remains unknown, ProofPath should leave it unresolved rather than guess.”

### 1:05–1:25 — LIVE plan and evidence (20s)

**Visual:** Open the finished live plan. Expand one supported citation and the source ledger.

**Narration:** “The result is an ordered checklist with completion criteria. This step is supported because its exact passage exists in the retrieved page. You can inspect the quote, publisher, original URL, retrieval time, and source hash yourself.”

### 1:25–1:43 — Uncertainty and editing (18s)

**Visual:** Show an inferred step and unresolved question. Edit a nonessential instruction and save the step.

**Narration:** “Inference is labelled differently from evidence, and unresolved questions stay visible. When I edit a factual instruction, automatic support is withdrawn. ProofPath would rather say ‘confirm this’ than manufacture certainty.”

### 1:43–1:58 — Complete, save, export, recheck (15s)

**Visual:** Check a step, save to browser, download Markdown, then click **Recheck sources now** on the live plan.

**Narration:** “Progress and edits survive a reload after an explicit local save. Markdown keeps the checklist and evidence portable. Source rechecks happen only on request and flag changed or unavailable pages.”

### 1:58–2:20 — AI and infrastructure proof (22s)

**Visual:** Split screen: the live runtime receipt and `server/lib/nebius.ts`; then `server/lib/evidence.ts`. Keep the exact model ID readable.

**Narration:** “The receipt records the real Nebius model, response ID, latency, and token use. Credentials stay server-side. JSON Schema and Zod constrain the response; then the evidence gate removes invented citations, unsupported dates, weak conflicts, and dependency cycles.”

### 2:20–2:35 — Measured evaluation and limits (15s)

**Visual:** `docs/EVALUATION.md` and the About page evaluation panel; include the “fixture” label.

**Narration:** “The reproducible harness attacks fabricated quotes, conflicts, missing information, and provider failures. These fixture results are not a model-accuracy benchmark. Exact quotes still need human review for authority, freshness, and meaning.”

### 2:35–2:45 — Close (10s)

**Visual:** Return to the live plan; show repository and demo links as captions.

**Narration:** “ProofPath: not just an answer, but a next step you can inspect. The code, setup, evaluation, and full evidence trail are open source.”

## Required post-recording checks

- Actual duration is **02:45 or less** and the uploaded YouTube video is public.
- Every LIVE shot is the same real deployed workflow; model/response receipt is genuine and readable.
- Any time cut is disclosed; no sample is presented as model output.
- Narration and captions contain no invented metric, uptime, user, testimonial, cost, or production claim.
- Insert the actual public YouTube URL in the Devpost draft and final report only after the upload succeeds.
