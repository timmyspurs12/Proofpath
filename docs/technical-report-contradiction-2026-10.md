# Contradiction false-positive root-cause report and live evidence validation

Date: 2026-10-24 (Africa/Lagos)
Branch: `arena/fbedd78e-proofpath` (updates PR #7, not merged, not deployed)
Engine tested at: working tree on top of commit `b3ff7712de243a9aa5982911439db96597fa8825` (PR #7 head)
Production/base commit: `51a24f98af4259f581f012044aec903091ff0401`
Production deployment (read-only Vercel metadata): `dpl_HGQ8sH8TNCg3yS1w64trsFFvwSkS`, alias `proofpath-woad.vercel.app`, state READY/PROMOTED, `githubCommitSha = 51a24f9…`

## 1. Provenance and evidence handling

| Artifact               | Identity                                                                               | Handling                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Production code        | `51a24f9` (Vercel production SHA, matches `main`)                                      | Red demonstration in an isolated git worktree, no edits                                                        |
| Branch under test      | PR #7 head `b3ff771` plus the uncommitted fix described below                          | All green evidence below                                                                                       |
| Production model trace | Not stored in the repository                                                           | Not reconstructed; no raw output is invented                                                                   |
| Regression inputs      | `tests/fixtures/contradiction-diagnostics.ts`                                          | Labelled **synthetic** fixtures reproducing the reported passage _kinds_, IP-literal hosts, zero network calls |
| Live Nigeria case      | `tests/fixtures/nigeria-official-2026.ts`                                              | Verbatim excerpts of four official pages freshly fetched on 2026-10-24; frozen for offline tests               |
| Red/green probe output | `artifacts/contradiction-red-51a24f9.json`, `artifacts/contradiction-green-fixed.json` | Gitignored generated artifacts; reproduction command in §5                                                     |

## 2. Confirmed root cause

File/function: `server/lib/claim-checks.ts`, `findInstructionContradictions()` section 2 (explicit negation) and the helper it used, `alignedNegatedTerms()`.

The base engine treated **any single instruction word appearing inside an eight-token window around a negation cue** as an aligned contradiction. Four structural defects followed, each matching a reported production false positive:

1. **Scope was evaluated too late and per clause, after alignment.** A consular/abroad sentence or a channel prohibition could negate a domestic instruction on lexical overlap before location/route context was applied (FP2 consular internet notice; FP4 foreign-mission cutoff).
2. **Applicant-circumstance rules required an `if/when` lead.** Age rules phrased as noun subjects ("Applicants under 16…", "Minors cannot…") were treated as universal prohibitions and downgraded adult steps (FP3a NIN step, FP3b biometric step).
3. **A single shared generic word was sufficient alignment.** "Do not **book** travel" negated a step saying "**book** an appointment", and "you do not need printed photographs" negated a portal step, because the shared verb/noun alone counted (FP5 shared-verb; FP1 printed-photograph notice; FP6 guarantor notice).
4. **Every finding was converted to `unverifiable` unconditionally** in `server/lib/evidence.ts` (`validateEvidencePlan`), with no machine-readable record of which sentence, clause, cue or alignment dimension produced it, so the production downgrades were not auditable.

This was an alignment/scope defect, not a window-size, keyword-list or prompt defect. No model prompt, provider integration or credential policy was changed.

## 3. The fix (minimal, generic, country-agnostic)

All changes are in the generic engine; the universality grep over `claim-checks.ts`, `evidence.ts`, `intake.ts` returns no country, currency or document-type vocabulary.

- **Location and route scope are evaluated before clause segmentation** (`sentenceScopeSkipReason`), location first: consular/diaspora sentences can never negate a domestic instruction and vice versa; a sentence whose every channel differs from the requested routes is skipped with a stable reason code.
- **Circumstance gating without a conditional lead** (`sentenceCircumstance`): noun-subject age/dependent rules are scoped to instructions that name the same applicant circumstance.
- **Full subject/action alignment** (`evaluateClauseAlignment`): generic process vocabulary and bare channel words can never establish alignment alone; a single distinctive content hit only holds when the negated predicate has no non-shared pivot term (`clauseSubjectBlockers`). Pre-cue nouns are treated as the circumstance/entity the rule applies to for modal/imperative prohibitions, while auxiliary negations ("the replacement record will not keep the same reference number") keep their pre-cue subject as a blocker. Route-only negations require the clause to have no different substantive subject.
- **Channel-scoped prohibitions are clause-scoped**: "cannot be completed online" cannot negate an in-person instruction; the instruction must itself assert the same channel (`routesInText`, with inflection-tolerant token matching for wording like "Post paper forms").
- **Money-head visibility**: a negated fee/charge word counts as a content hit when the instruction makes a monetary claim, because term extraction only keeps tokens of four or more letters and the head noun "fee" is three letters.
- **Structured diagnostics** (`ContradictionDiagnostic`, opt-in via `validateEvidencePlan({ includeDiagnostics: true })`): stable step id, source id, exact sentence and evaluated clause, requested and sentence routes, location scope, negation cues, negated/aligned terms, the three alignment booleans (subject/action, route, circumstance), decision (`contradiction` / `not_contradiction`), and a stable reason code. Records are deterministic primitives, capped at 500, contain no secrets or envelope fields, and cost nothing when not requested.

Reason-code vocabulary: `negated-requirement`, `conditional-route`, `fee-context-mismatch`, `currency-mismatch`, `ungrounded-currency`, `currency-claim-grounded`, `skipped-scope-route`, `skipped-scope-location`, `skipped-applicant-circumstance`, `skipped-no-negation-cue`, `skipped-generic-term-only`, `skipped-clause-subject-mismatch`, `skipped-money-clause`, `skipped-no-distinctive-term`.

Fail-closed guarantees are unchanged: unsupported claims are never promoted, fabricated citations still fail exact-passage validation, genuine contradictions still downgrade, and uncertainty is preserved as unresolved questions.

## 4. Red/green evidence at exact SHAs

A standalone probe (`/tmp/fp-probe.ts`, outside git; outputs in gitignored `artifacts/`) runs the same seven trap instructions and six positive controls through either engine.

| Instruction class                                         | Base `51a24f9`                 | Fixed branch working tree                    |
| --------------------------------------------------------- | ------------------------------ | -------------------------------------------- |
| FP1 printed-photograph notice vs portal step              | spurious `negated-requirement` | no finding                                   |
| FP2 consular internet notice vs domestic NIN step         | 4 spurious findings            | no finding (location scope)                  |
| FP3a noun-form age rule vs adult NIN step                 | 4 spurious findings            | no finding (circumstance scope)              |
| FP3b noun-form age rule vs adult biometric step           | spurious finding               | no finding (circumstance scope)              |
| FP4 foreign-mission cutoff vs domestic submit step        | 4 spurious findings            | no finding (location scope)                  |
| FP5 "book travel" vs "book appointment"                   | 2 spurious findings            | no finding (predicate pivot mismatch)        |
| FP6 guarantor notice vs document-upload step              | spurious finding               | no finding (subject mismatch)                |
| POS1 same-route prohibition on posting photos             | contradiction                  | contradiction retained                       |
| POS2 genuine online-channel biometrics prohibition        | contradiction                  | contradiction retained                       |
| POS3 cash-payment prohibition                             | contradiction                  | contradiction retained                       |
| POS4 "applications cannot be completed by post"           | contradiction                  | contradiction retained                       |
| POS5 paper-route conditional requirement                  | contradiction                  | contradiction retained (`conditional-route`) |
| POS6 in-scope under-18 rule; bank-charges inclusion claim | contradiction                  | contradiction retained                       |

The Vitest suite encodes the same matrix as 20 deterministic tests (`tests/contradiction-diagnostics.test.ts`), including end-to-end `validateEvidencePlan()` assertions on statuses, citations, reasons, unresolved questions and metrics. On the base SHA those tests cannot run unchanged because the diagnostics contract did not exist; the probe above is the base-SHA evidence.

## 5. Reproducing the red/green demonstration

```bash
git worktree add /tmp/proofpath-base 51a24f98af4259f581f012044aec903091ff0401
ln -s "$PWD/node_modules" /tmp/proofpath-base/node_modules
ENGINE_DIR=/tmp/proofpath-base npx tsx /tmp/fp-probe.ts > artifacts/contradiction-red-51a24f9.json
ENGINE_DIR="$PWD" npx tsx /tmp/fp-probe.ts > artifacts/contradiction-green-fixed.json
```

The probe contains no network calls and prints the engine SHA inside each artifact.

## 6. End-to-end Nigerian domestic renewal case on current official sources

All four sources were fetched directly on 2026-10-24 and their URLs are frozen in `tests/fixtures/nigeria-official-2026.ts`; the nine-test suite `tests/nigeria-official-2026.test.ts` makes no live calls.

| #   | Source (all official, `immigration.gov.ng` / `passport.immigration.gov.ng`)                                       | Retrieval outcome                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| S1  | `/info-center/renewal-of-passport/` (page dated 2025-04-02)                                                       | Fetched; nine renewal steps and the in-person biometric note captured                                  |
| S2  | `https://passport.immigration.gov.ng/`                                                                            | Fetched; renewal/re-issue, appointment, centre-availability and photo-check entry points captured      |
| S3  | NIS press release "announces upward review of Nigerian standard passport fees" (2025-08-28, effective 2025-09-01) | Fetched; domestic NGN and diaspora USD scopes captured verbatim                                        |
| S4  | `/wp-content/uploads/2026/04/SERVICE-LEVEL-AGREEMENT-2026_.pdf` (revised edition, foreword 2026-04-26)            | Fetched, all four chunks parsed; renewal/reissue row, timeline, fees and bank-charge language captured |

Confirmed facts (each tied to an exact quotable passage in the fixture):

- The domestic renewal is initiated online ("Apply for Renewal/Reissue"), requires NIN verification with date-of-birth second-level checks, booklet selection (32 or 64 pages), an ICAO-compliant picture, online review/submission, payment and an appointment.
- Applicants **must appear in person** at the chosen immigration office for biometric data capture (S1 note; S4 note requires appearing with the passport booklet). Online submission and biometric capture are distinct obligations; the no-visit trap step loses its fabricated citation and stays `unverifiable`.
- Domestic service fees (S3 and S4): 32-page/5-year **N100,000** and 64-page/10-year **N200,000**, applications made in Nigeria. Diaspora fees remain **USD 150 / USD 230** and are explicitly scoped to Nigerians in the diaspora; the contactless biometric product is diaspora-only. A domestic instruction claiming USD 230 for a 32-page/5-year renewal is downgraded `fee-context-mismatch`, citing both the domestic/abroad and 5/10-year scope conflicts.
- **All prices exclude bank charges** (S4). The supported fee step carries that exact passage; the exact provider charge amount is retained as an unresolved question because no source publishes it. A trap claiming the NGN 100,000 fee _includes_ bank charges is downgraded.
- Reissue timeline: 21 days after successful enrolment (S4). The fixture keeps this as source text; no due date is asserted without an exact supporting passage.

Final engine output on the frozen case: six supported steps (all citations exact-passage valid), three downgraded trap steps, two retained unresolved questions, metrics `{ validatedSupportedClaims: 6, unsupportedModelClaims: 3, invalidCitationCount: 1, contradictedClaimCount: 2, rejectedConflicts: 1 }`.

Retrieval limitations stated honestly:

- NIS prints naira amounts with a bare letter prefix ("N100,000"). The generic currency extractor recognises ISO codes and the ₦ symbol, not a bare "N", so the included-charges trap is rejected as `ungrounded-currency` rather than via the dedicated `fee-context-mismatch` rule; that rule is covered on parseable money by the synthetic POS6 test. Generalising the extractor to a bare-N naira prefix was deliberately not done because it would be a country-specific token rule in the generic engine.
- The SLA table pairs "N100,000/$150" in one cell without scope words; the press release supplies the scope. An unqualified dollar cell can still ground a dollar amount, so the fixture's dollar trap uses the 64-page figure, where every publishing passage conflicts on booklet/validity/location. This residual is documented, not hidden.
- Live appointment availability and the current bank-charge amount are not published on any fetched page and remain unresolved rather than guessed.

## 7. `verify:live` auditability changes

`scripts/verify-live.ts` now writes, only after a genuinely keyed successful run: explicit `liveInferenceVerified: true`, verification timestamp, mode, code revision (git SHA and branch, best-effort), provider id, model id, response id, usage and latency, a sanitized retrieval ledger (URL, publisher, authority, route, retrieval time, staleness, content hash, clipped excerpt; no headers or keys), retrieval warnings and call counts, step counts, before/after decision summaries (claimed vs validated, downgrades, removed citations, per-step statuses and notes), the full contradiction-diagnostics array and reason-code histogram. `runPlan` gained an optional `includeDiagnostics` flag and returns the retrieved source packet for this purpose; the HTTP route's consumption is unchanged.

With no credentials the script still makes **no request and writes no artifact**: it exits 2, names the exact variables (`NEBIUS_API_KEY` or `NEBIUS_TOKEN_FACTORY_API_KEY` required; `NEBIUS_BASE_URL`, `NEBIUS_MODEL`, `TAVILY_API_KEY` optional) and the exact command `npm run verify:live`. Verified in this sandbox, where all live variables are confirmed absent: the blocked path exits 2 as designed. No secret value is read, printed or logged anywhere.

## 8. Gate results (all re-run after every change)

| Gate                   | Command                                      | Result                                                                                                                                                                             |
| ---------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type checking          | `npm run typecheck`                          | clean                                                                                                                                                                              |
| Unit/integration tests | `npm test`                                   | 16 files, **186/186 passed** (incl. 20 new contradiction tests, 9 new live-source tests; pre-existing 18 contradiction-context and 28 claim-checks tests unchanged in expectation) |
| Build                  | `npm run build`                              | `tsc` + Vite + serverless bundle all succeed                                                                                                                                       |
| Serverless smoke       | `npm run verify:serverless`                  | HTTP 200, `live_inference_verified: false`                                                                                                                                         |
| Formatting             | `npm run format:check`                       | all files pass Prettier                                                                                                                                                            |
| Universality guard     | grep over the three engine files             | no country/currency/document vocabulary (exit 1)                                                                                                                                   |
| E2E + accessibility    | `npx playwright test` (Chromium 153 harness) | **14/14 passed**, including both WCAG 2.2 A/AA suites                                                                                                                              |
| Live verification      | `npm run verify:live`                        | blocked honestly, exit 2, no artifact (no credentials in sandbox)                                                                                                                  |

## 9. Limitations and next command

1. No live model inference was performed: `artifacts/live-verification.json` does not exist and `liveInferenceVerified` is asserted nowhere without a real keyed run. Next command, with credentials supplied out-of-band: `npm run verify:live`.
2. The bare-N naira spelling and unqualified SLA dollar cell are documented engine limitations (§6), not regressions.
3. Production trace reconstruction remains impossible from repository data; all red evidence uses labelled synthetic fixtures and the exact base-SHA engine.
4. PR #7 is updated on the existing branch only. It is not merged, no Vercel or GitHub settings were changed, and nothing was deployed.
