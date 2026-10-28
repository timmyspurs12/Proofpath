# ProofPath Nigeria demo — 2:45 script and storyboard

**Target duration: 165 seconds. Track: Best Apps and Agents. Scenario: domestic Nigerian adult passport renewal.**

> **Scenario identity:** this is the Nigeria live-regression script, distinct from the UK script in [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md). The two must never be mixed in a recording: do not show UK GOV.UK sources while narrating the Nigerian case, or vice versa.
>
> **Recording gate:** shots marked LIVE must show a genuine Nebius response from the deployed app recorded after this script is run. Do not substitute the static sample, a mock response, or a rehearsed screenshot and describe it as live. The two existing production receipts (`chatcmpl-e74616bc-…` and `chatcmpl-2aff50c9-…`) predate the evidence-gap remediation merged in commit `c03f5e3`; they must not be presented as post-remediation evidence. Until a fresh post-deploy run is recorded, this is a script—not evidence that a compliant video exists.

## Production setup

- Record the deployed production build (<https://proofpath-woad.vercel.app>) in a clean 1440 × 900 browser at 110% zoom if needed for legibility.
- Use the exact task: _“Renew an expired Nigerian passport online as an adult Nigerian citizen living in Nigeria, using a valid NIN and existing passport.”_ Jurisdiction: Nigeria; domestic online route; adult applicant.
- Start from the four verified official sources (the application’s live retrieval set; recheck each page before recording):
  1. Renewal of Passport — NIS info center: <https://immigration.gov.ng/info-center/renewal-of-passport/>
  2. Passport application portal: <https://passport.immigration.gov.ng/>
  3. NIS fee review press release: <https://immigration.gov.ng/nigeria-immigration-service-announces-upward-review-of-nigerian-standard-passport-fees/>
  4. NIS Service Level Agreement, revised April 2026 (PDF): <https://immigration.gov.ng/wp-content/uploads/2026/04/SERVICE-LEVEL-AGREEMENT-2026_.pdf>
- Complete one genuine run first to learn the clarification questions and latency (the prior observed run took 7.2 s of model latency). During the video, either show the real request in real time or disclose a time cut on screen. Never speed up a receipt or invent one.
- Keep the runtime receipt visible for the model/response-ID shot, using the **new** response id from this recording. Do not show `.env`, account dashboards with secrets, real passport numbers, NINs, or identity documents.
- Capture a separate static-code view of `server/lib/evidence.ts`, `server/lib/claim-checks.ts`, and `tests/nigeria-live-regression-2026-10.test.ts`.
- Add captions. Keep narration at a calm conversational pace; trim pauses rather than adding more features.

## Timestamped storyboard and narration

### 0:00–0:12 — Hook (12s)

**Visual:** Close on the NIS Service Level Agreement PDF fee table, then cut to a ProofPath plan step with an evidence quote expanded.

**Narration:** “Official immigration pages publish fees, timelines, and appointment rules across dense pages and PDFs. ProofPath turns them into an ordered plan—with the exact passage behind every supported step.”

### 0:12–0:30 — Problem and distinction (18s)

**Visual:** Home screen with the Nigerian task text; highlight the words “ordered checklist,” “evidence,” and “unable to verify.”

**Narration:** “This isn’t a summary chatbot. It orders the work, defines what ‘done’ means, and keeps gaps visible. The model proposes the path; deterministic code decides whether a supported label has a real, exact passage behind it.”

### 0:30–0:48 — Real task and official sources (18s)

**Visual:** Fill the task, jurisdiction “Nigeria,” and domestic-route details. Show the four official `immigration.gov.ng` / `passport.immigration.gov.ng` URLs.

**Narration:** “Here’s a real task: an adult in Nigeria renewing an expired passport online, with a NIN and current passport. Every starting source is an official Nigeria Immigration Service page or its 2026 service-level PDF—not model memory dressed up as fact.”

### 0:48–1:05 — LIVE intake and clarification (17s)

**Visual:** Submit. Show the real generating state and any genuine clarification answer flow, then retrieval.

**Narration:** “Nemotron runs through Nebius Token Factory. It identifies the goal and asks only for details that change the process. When something is genuinely unknown, ProofPath leaves it unresolved rather than guessing.”

### 1:05–1:25 — LIVE plan, fee evidence and route scope (20s)

**Visual:** Open the finished live plan. Expand the fee step’s citations: the N100,000 domestic 32-page five-year figure from the press release and the “All Prices are Exclusive of Bank Charges” SLA line. Show the source ledger entries excluding overseas/consular discoveries.

**Narration:** “The fee step is supported because its exact passages exist in retrieved official sources: one hundred thousand naira domestically, bank charges excluded. The hundred-and-fifty-dollar figure applies to diaspora applications, so consular material is excluded from this domestic plan rather than merged in.”

### 1:25–1:43 — Citation fidelity and honest rejection (18s)

**Visual:** Show a supported appointment step quoting the portal’s exact “book an appointment for biometric enrollment” sentence, then open the rejected-citations panel showing any quote the gate removed with its reason.

**Narration:** “Citations are checked character for character. A paraphrase or a misspelled quote is rejected with its provenance attached instead of being quietly accepted. The claim is never called false—it’s marked unverifiable until real evidence supports it.”

### 1:43–2:00 — Timeline separated from collection (17s)

**Visual:** Show the tracking step citing “Re-issue: 21 days after Successful Enrolment,” phrased as a published service standard, next to the separate collection step marked **Unable to verify** with its unresolved question.

**Narration:** “The twenty-one-day reissue figure is a published service standard, not a delivery guarantee. No official source retrieved here states how the passport is collected or how readiness is notified, so that stays explicitly unresolved—ProofPath won’t invent a courier or notification step.”

### 2:00–2:15 — Uncertainty and editing (15s)

**Visual:** Show the “Still unresolved” list (bank-charge amount, centre availability, collection/notification), then edit a nonessential instruction and watch support withdraw.

**Narration:** “Unresolved questions stay structured and visible, including things the sources simply don’t publish. When I edit a factual instruction, automatic support is withdrawn. ProofPath would rather say ‘confirm this’ than manufacture certainty.”

### 2:15–2:30 — AI and infrastructure proof (15s)

**Visual:** Split screen: the live runtime receipt (model id, **new** response id, latency, token use) and `server/lib/nebius.ts`; then `server/lib/evidence.ts`.

**Narration:** “The receipt records the real Nebius model, response id, latency, and token use; credentials stay server-side. JSON Schema and Zod constrain the response, then the evidence gate removes invented citations, unsupported dates, weak conflicts, and dependency cycles.”

### 2:30–2:45 — Close (15s)

**Visual:** Return to the live plan; show repository and demo links as captions.

**Narration:** “ProofPath: not just an answer, but a next step you can inspect. The code, tests, evaluation, and full evidence trail are open source under MIT.”

## Automated recorder (optional helper)

`scripts/record-demo-nigeria.ts` drives the walkthrough above against the deployed app and produces the recording plus a machine-readable audit packet. It is a convenience, not a substitute for the recording gate: every frame is still the real deployed application, and nothing is mocked.

```bash
npx playwright install chromium      # first time only
npm run record:demo:nigeria
```

- Defaults to the production URL (`PROOFPATH_DEMO_URL` overrides it), headed Chromium at 1440 × 1000, and a 175-second hold budget (`DEMO_BUDGET_S`, `DEMO_HEADLESS=1`) that caps scripted pacing so holds alone cannot push the WebM past three minutes. Real generation time is recorded honestly — if an unusually slow run takes the total over 180 seconds, the sidecar warns and the footage must be trimmed with any time cut disclosed on screen.
- It preflights `/api/health` and aborts if live inference is unconfigured; the genuine `chatcmpl-…` id, latency and token usage are captured from the real `POST /api/plans` response. Clarification questions are answered by the human at the keyboard — the script pauses for terminal Enter rather than inventing factual answers. Plan, clarification, and error states are raced continuously, so a late failure (e.g. the browser's 60-second client timeout or a 422/504 after slow retrieval) is reported with its real alert text instead of a generic locator timeout.
- Outputs are written under gitignored `artifacts/demo-recordings/`: a `.webm` and a `.json` sidecar containing the runtime receipt and the four acceptance observations (fee question absent from unresolved, appointment step supported by an exact passage, 21-day timeline present, collection still unable to verify). Exit code `3` means the live call succeeded but an observation failed — record and diagnose honestly, never edit the output to force a pass. On a failed request the terminal logs and the `*-FAILED.json` sidecar include the server's sanitized error envelope (`code` plus per-URL `details`, e.g. `NO_USABLE_SOURCES` with each host's timeout/block reason); no secrets or response payloads are recorded.
- This helper cannot run inside the restricted CI/sandbox network; run it on a machine with browser and public-internet access. It does not change application, provider, or deployment configuration.

## Required post-recording checks

- Actual duration is **02:45 or less** and the uploaded YouTube video is public; insert its URL in the Devpost draft only after the upload succeeds.
- Every LIVE shot is the same real deployed workflow; the model/response receipt is genuine, readable, and issued **after** the `c03f5e3` deployment.
- The recorded run visibly shows: the domestic fee question absent from “Still unresolved,” an appointment step supported by an exact passage, the 21-day timeline separate from collection, and collection remaining unable to verify. If the fresh run does not produce these outcomes, record the honest output and diagnose—do not mock a passing state.
- Any time cut is disclosed; the static sample is never presented as model output; the two pre-remediation receipts are not shown as post-remediation evidence.
- Narration and captions contain no invented metric, uptime, user, testimonial, cost, award, or production claim, and no personal identity data.
- This file is a script; it is not evidence that a video has been recorded or that post-remediation live acceptance has passed.
