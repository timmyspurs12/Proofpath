# Contradiction false-positive root-cause report and live evidence validation

Date: 2026-10-24 (Africa/Lagos)
Branch: `arena/fbedd78e-proofpath` (updates PR #7; not merged, not deployed)

- **Production/base SHA (red comparison):** `51a24f98af4259f581f012044aec903091ff0401` — the exact `githubCommitSha` of the promoted Vercel production deployment `dpl_HGQ8sH8TNCg3yS1w64trsFFvwSkS` (alias `proofpath-woad.vercel.app`, READY/PROMOTED) and the tip of `main`.
- **Fixed SHA (green comparison):** `3e1fb2b5cea1bf2b83cd365b63d5794f180da750` — committed and pushed to the PR branch; every green result in this report was produced against a clean checkout of this exact revision (working tree `git status` clean), never against an uncommitted working tree.
- Intermediate branch commit `b3ff7712de243a9aa5982911439db96597fa8825` is the parent of the fix commit and is retained in history only; it is not a tested green revision for this report.

## 1. Provenance and evidence handling

| Artifact                             | Exact identity                                                                             | Nature and handling                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Red engine                           | commit `51a24f9` checked out in an isolated git worktree (`/tmp/proofpath-base`), no edits | The exact production code; exercised by the probe below                                                                                                     |
| Green engine                         | commit `3e1fb2b` checked out clean in the main working tree                                | All Vitest, Playwright, build and probe evidence below was generated on this revision                                                                       |
| Production model trace               | Not stored anywhere in the repository                                                      | Not reconstructed; no raw model output is invented                                                                                                          |
| Synthetic regression inputs          | `tests/fixtures/contradiction-diagnostics.ts`, `tests/fixtures/contradiction-context.ts`   | **Synthetic, clearly-labelled fixtures** reproducing the reported passage _kinds_; IP-literal stand-in hosts; zero network calls; not replays of production |
| Fresh-source case                    | `tests/fixtures/nigeria-official-2026.ts`                                                  | **Verbatim excerpts** of four official NIS pages fetched over HTTPS on 2026-10-24, then frozen; the test suite itself makes no network calls                |
| Red/green probe outputs (gitignored) | `artifacts/contradiction-red-51a24f9.json`, `artifacts/contradiction-green-3e1fb2b.json`   | Each file records the engine SHA it actually ran; reproduction commands in §5                                                                               |
| Live inference receipt               | `artifacts/live-verification.json`                                                         | Does not exist; no keyed run has occurred (§7, §9)                                                                                                          |

Commands actually executed against the committed revisions:

- Red (worktree at `51a24f9`): `ENGINE_DIR=/tmp/proofpath-base tsx /tmp/fp-probe.ts` → 7 spurious findings, 6 positive controls intact.
- Green (clean tree at `3e1fb2b`): the same probe, plus `npm run typecheck`, `npm test`, `npm run build`, `npm run format:check`, `npm run verify:serverless`, `npx playwright test`, and `npm run verify:live` (blocked path). Full results in §8.

## 2. Confirmed root cause

File/function: `server/lib/claim-checks.ts`, `findInstructionContradictions()` section 2 (explicit negation) and the helper it used, `alignedNegatedTerms()`.

The base engine treated **any single instruction word appearing inside an eight-token window around a negation cue** as an aligned contradiction. Four structural defects followed, each matching a reported production false positive:

1. **Scope was evaluated too late and per clause, after alignment.** A consular/abroad sentence or a channel prohibition could negate a domestic instruction on lexical overlap before location/route context was applied (FP2 consular internet notice; FP4 foreign-mission cutoff).
2. **Applicant-circumstance rules required an `if/when` lead.** Age rules phrased as noun subjects ("Applicants under 16…", "Minors cannot…") were treated as universal prohibitions and downgraded adult steps (FP3a NIN step, FP3b biometric step).
3. **A single shared generic word was sufficient alignment.** "Do not **book** travel" negated a step saying "**book** an appointment", and "you do not need printed photographs" negated a portal step, because the shared verb/noun alone counted (FP5 shared-verb; FP1 printed-photograph notice; FP6 guarantor notice).
4. **Every finding was converted to `unverifiable` unconditionally** in `server/lib/evidence.ts` (`validateEvidencePlan`), with no machine-readable record of which sentence, clause, cue or alignment dimension produced it, so the production downgrades were not auditable.

This was an alignment/scope defect, not a window-size, keyword-list or prompt defect. No model prompt, provider integration or credential policy was changed.

## 3. The fix (minimal, generic, country-agnostic)

All changes are in the generic engine; the universality grep over `claim-checks.ts`, `evidence.ts`, `intake.ts` returns zero country, currency or document-type vocabulary.

- **Location and route scope are evaluated before clause segmentation** (`sentenceScopeSkipReason`), location first: consular/diaspora sentences can never negate a domestic instruction and vice versa; a sentence whose every channel differs from the requested routes is skipped with a stable reason code.
- **Circumstance gating without a conditional lead** (`sentenceCircumstance`): noun-subject age/dependent rules are scoped to instructions that name the same applicant circumstance.
- **Full subject/action alignment** (`evaluateClauseAlignment`): generic process vocabulary and bare channel words can never establish alignment alone; a single distinctive content hit only holds when the negated predicate has no non-shared pivot term (`clauseSubjectBlockers`). Pre-cue nouns are treated as the circumstance/entity the rule applies to for modal/imperative prohibitions, while auxiliary negations ("the replacement record will not keep the same reference number") keep their pre-cue subject as a blocker. Route-only negations require the clause to have no different substantive subject.
- **Channel-scoped prohibitions are clause-scoped**: "cannot be completed online" cannot negate an in-person instruction; the instruction must itself assert the same channel (`routesInText`, with inflection-tolerant token matching for wording like "Post paper forms").
- **Money-head visibility**: a negated fee/charge word counts as a content hit when the instruction makes a monetary claim, because term extraction only keeps tokens of four or more letters and the head noun "fee" is three letters.
- **Structured diagnostics** (`ContradictionDiagnostic`, opt-in via `validateEvidencePlan({ includeDiagnostics: true })`): stable step id, source id, exact sentence and evaluated clause, requested and sentence routes, location scope, negation cues, negated/aligned terms, the three alignment booleans (subject/action, route, circumstance), decision (`contradiction` / `not_contradiction`), and a stable reason code. Records are deterministic primitives, capped at 500, contain no secrets or envelope fields, and cost nothing when not requested.

Reason-code vocabulary: `negated-requirement`, `conditional-route`, `fee-context-mismatch`, `currency-mismatch`, `ungrounded-currency`, `currency-claim-grounded`, `skipped-scope-route`, `skipped-scope-location`, `skipped-applicant-circumstance`, `skipped-no-negation-cue`, `skipped-generic-term-only`, `skipped-clause-subject-mismatch`, `skipped-money-clause`, `skipped-no-distinctive-term`.

Fail-closed guarantees are unchanged: unsupported claims are never promoted, fabricated citations still fail exact-passage validation, genuine contradictions still downgrade, and uncertainty is preserved as unresolved questions.

## 4. Red/green evidence at exact committed SHAs

A standalone probe (outside git; outputs in gitignored `artifacts/`) runs the same seven trap instructions and six positive controls through either engine. The probe records the resolved `git rev-parse HEAD` inside each output file; the recorded SHAs are `51a24f9…` for the red file and `3e1fb2b…` for the green file.

| Instruction class                                         | Base `51a24f9`                 | Fixed commit `3e1fb2b`                       |
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

The Vitest suite encodes the same matrix as 20 deterministic tests (`tests/contradiction-diagnostics.test.ts`), including end-to-end `validateEvidencePlan()` assertions on statuses, citations, reasons, unresolved questions and metrics. Those tests cannot run against the base SHA because the diagnostics contract did not exist there; the probe is the base-SHA evidence, and the full Vitest suite is the green-SHA evidence.

## 5. Reproducing the red/green demonstration

```bash
# Red: exact production/base revision in an isolated worktree
git worktree add /tmp/proofpath-base 51a24f98af4259f581f012044aec903091ff0401
ln -s "$PWD/node_modules" /tmp/proofpath-base/node_modules
ENGINE_DIR=/tmp/proofpath-base npx tsx /tmp/fp-probe.ts \
  > artifacts/contradiction-red-51a24f9.json

# Green: clean checkout of the fixed revision (git status must be clean)
git checkout 3e1fb2b5cea1bf2b83cd365b63d5794f180da750
ENGINE_DIR="$PWD" npx tsx /tmp/fp-probe.ts \
  > artifacts/contradiction-green-3e1fb2b.json
```

The probe contains no network calls and prints the engine SHA inside each artifact. The earlier filename `contradiction-green-fixed.json` described a pre-commit working-tree run and has been superseded by `contradiction-green-3e1fb2b.json`, which is the first green artifact generated against a committed revision.

## 6. End-to-end Nigerian domestic renewal case on current official sources

All four sources were fetched directly on 2026-10-24 and their URLs are frozen in `tests/fixtures/nigeria-official-2026.ts`; the nine-test suite `tests/nigeria-official-2026.test.ts` makes no live calls.

| #   | Source (all official, `immigration.gov.ng` / `passport.immigration.gov.ng`)                                       | Retrieval outcome                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| S1  | `/info-center/renewal-of-passport/` (page dated 2025-04-02)                                                       | Fetched; nine renewal steps and the in-person biometric note captured                                  |
| S2  | `https://passport.immigration.gov.ng/`                                                                            | Fetched; renewal/re-issue, appointment, centre-availability and photo-check entry points captured      |
| S3  | NIS press release "announces upward review of Nigerian standard passport fees" (2025-08-28, effective 2025-09-01) | Fetched; domestic naira and diaspora dollar scopes captured verbatim                                   |
| S4  | `/wp-content/uploads/2026/04/SERVICE-LEVEL-AGREEMENT-2026_.pdf` (revised edition, foreword 2026-04-26)            | Fetched, all four chunks parsed; renewal/reissue row, timeline, fees and bank-charge language captured |

Confirmed facts (each tied to an exact quotable passage in the fixture):

- The domestic renewal is initiated online ("Apply for Renewal/Reissue"), requires NIN verification with date-of-birth second-level checks, booklet selection (32 or 64 pages), an ICAO-compliant picture, online review/submission, payment and an appointment.
- Applicants **must appear in person** at the chosen immigration office for biometric data capture (S1 note; S4 note requires appearing with the passport booklet). Online submission and biometric capture are distinct obligations; the no-visit trap step loses its fabricated citation and stays `unverifiable`.
- Domestic service fees (S3 and S4): 32-page/5-year **N100,000** and 64-page/10-year **N200,000**, applications made in Nigeria. Diaspora fees remain **USD 150 / USD 230** and are explicitly scoped to Nigerians in the diaspora; the contactless biometric product is diaspora-only. A domestic instruction claiming USD 230 for a 32-page/5-year renewal is downgraded `fee-context-mismatch`, citing both the domestic/abroad and 5/10-year scope conflicts.
- **All prices exclude bank charges** (S4). The supported fee step carries that exact passage; the exact provider charge amount is retained as an unresolved question because no source publishes it. A trap claiming a parseable **NGN 100,000** fee _includes_ bank charges is downgraded.
- Reissue timeline: 21 days after successful enrolment (S4). The fixture keeps this as source text; no due date is asserted without an exact supporting passage.

Final engine output on the frozen case: six supported steps (all citations exact-passage valid), three downgraded trap steps, two retained unresolved questions, metrics `{ validatedSupportedClaims: 6, unsupportedModelClaims: 3, invalidCitationCount: 1, contradictedClaimCount: 2, rejectedConflicts: 1 }`.

### 6.1 Currency-prefix audit (no Naira-specific rule added)

The official sources print naira amounts with a bare letter prefix ("N100,000"). The audit required checking whether a domain-neutral parser extension is possible without ambiguous currency inference. The answer is no; the engine was therefore left unchanged and the fail-closed boundary is documented precisely.

What the generic extractor recognizes today (all domain-neutral): ISO 4217 three-letter codes before/after a number (`NGN 100,000`, `100,000 NGN`), seven registered currency symbols including the naira glyph (`₦100,000`), and a dedicated Brazilian real pattern (`R$150`). Verified behavior on 2026-10-24 at `3e1fb2b`:

| Input surface              | Parsed claims     |
| -------------------------- | ----------------- |
| `N100,000`                 | none              |
| `N200,000/$230`            | USD 230 only      |
| `NGN 100,000` / `₦100,000` | NGN 100,000       |
| `R$150` / `$150`           | BRL 150 / USD 150 |

Why a generic bare-prefix rule is unsafe:

- ISO codes are three letters and `₦` is the registered naira symbol; a bare `N` is a locale typographic convention, not a registered currency symbol.
- Single-letter prefixes are intrinsically ambiguous across jurisdictions (the letter R prefixes both Brazilian real and South African rand conventions; dollar glyphs already require an explicit symbol table). Any map from `N` to NGN would itself be a country-specific rule and would violate the universality constraint on the core engine.
- Unicode does not rescue the inference: NFKC normalization leaves `N` and `₦` as distinct characters (verified), so there is no standards-based fold to apply.
- A conservative variant — accept a bare letter only when the same document also contains the unambiguous ISO/symbol form — provides no benefit for these NIS sources, which never print `NGN` or `₦` anywhere, and would add cross-currency collision risk in multi-currency documents. It was rejected.

Exact residual behavior, established by a direct `validateEvidencePlan` probe against the frozen official sources (scratch probe, deleted after use):

| Fee instruction surface                                  | Result at `3e1fb2b`                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Bare-prefix correct fee with an exact-passage citation   | `supported` on the citation; the amount itself is not machine-checked              |
| Bare-prefix **wrong** amount (`N70,000`) with a citation | not downgraded by the currency gate — the precise unverifiable class               |
| Bare-prefix "including bank charges" claim               | `fee-context-mismatch` cannot run because no parseable claim exists                |
| Parseable `NGN`/`₦`/`USD` surfaces                       | all currency gates active; wrong amounts and included-charge claims are downgraded |

Fail-closed semantics are preserved: the engine never guesses a currency, never fabricates a numeric match, and an unparsed amount is simply not treated as money. Support for a bare-prefix step can therefore rest only on exact-passage citation validation plus the negation/scope gates; it can never be promoted by amount matching. The frozen Nigeria suite contains no unsupported bare-prefix promotion: its trap instructions deliberately use parseable `NGN`/`USD` surfaces and are correctly downgraded, the supported fee step carries the verbatim "All Prices are Exclusive of Bank Charges" passage as a citation, and the exact bank-charge amount remains an unresolved question. The safe future mitigation is upstream, not an engine rule: retrieval or model normalization that emits an ISO code or registered symbol, after which the existing generic gates apply unchanged.

Other retrieval limitations:

- The SLA table pairs "N100,000/$150" in one cell without scope words; the press release supplies the scope. An unqualified dollar cell can still ground a dollar amount, so the fixture's dollar trap uses the 64-page figure, where every publishing passage conflicts on booklet/validity/location.
- Live appointment availability and the current bank-charge amount are not published on any fetched page and remain unresolved rather than guessed.

## 7. `verify:live` auditability changes and current status

`scripts/verify-live.ts` now writes, only after a genuinely keyed successful run: explicit `liveInferenceVerified: true`, verification timestamp, mode, code revision (git SHA and branch, best-effort), provider id, model id, response id, usage and latency, a sanitized retrieval ledger (URL, publisher, authority, route, retrieval time, staleness, content hash, clipped excerpt; no headers or keys), retrieval warnings and call counts, step counts, before/after decision summaries (claimed vs validated, downgrades, removed citations, per-step statuses and notes), the full contradiction-diagnostics array and reason-code histogram. `runPlan` gained an optional `includeDiagnostics` flag and returns the retrieved source packet for this purpose; the HTTP route's consumption is unchanged.

With no credentials the script makes **no request and writes no artifact**: it exits 2, names the exact variables and the exact command. This blocked path was re-executed at commit `3e1fb2b` after confirming, by name only, that `NEBIUS_API_KEY`, `NEBIUS_TOKEN_FACTORY_API_KEY`, `NEBIUS_BASE_URL`, `NEBIUS_MODEL` and `TAVILY_API_KEY` are all absent from the sandbox environment. No secret value is read, printed or logged anywhere.

## 8. Gate results at committed revision `3e1fb2b` (clean working tree)

| Gate                   | Command                                               | Result                                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type checking          | `npm run typecheck`                                   | clean                                                                                                                                                                                                             |
| Unit/integration tests | `npm test`                                            | 16 files, **186/186 passed** — including 20 contradiction-diagnostics tests, 23 pre-existing contradiction-context tests, 28 claim-check tests, 10 Nigeria live-failure tests and the 9 new official-source tests |
| Build                  | `npm run build`                                       | `tsc` + Vite (1703 modules) + serverless bundle all succeed                                                                                                                                                       |
| Serverless smoke       | `npm run verify:serverless`                           | HTTP 200, `live_inference_verified: false`                                                                                                                                                                        |
| Formatting             | `npm run format:check`                                | all files pass Prettier                                                                                                                                                                                           |
| Universality guard     | grep over the three engine files                      | zero country/currency/document vocabulary                                                                                                                                                                         |
| E2E + accessibility    | `npx playwright test` (Chromium 153.0.8010.0 harness) | **14/14 passed**, including both WCAG 2.2 A/AA suites                                                                                                                                                             |
| Live verification      | `npm run verify:live`                                 | blocked honestly, exit 2, no artifact written (no credentials)                                                                                                                                                    |
| GitHub CI on `3e1fb2b` | `gh pr checks 7`                                      | `verify` pass; Vercel and Vercel Preview Comments pass (details §9)                                                                                                                                               |

## 9. Limitations, live-verification status and next command

1. **Live model inference has not been verified.** No `artifacts/live-verification.json` exists, no keyed run has ever been executed in this work, and `liveInferenceVerified` is written only by a real successful keyed run. Nothing in this report claims the production bug is fixed in a live run; the evidence is fixture- and probe-based at the exact SHAs above.
2. With credentials supplied out-of-band, the exact command is `npm run verify:live`. Required variable: `NEBIUS_API_KEY` (alternatively `NEBIUS_TOKEN_FACTORY_API_KEY`); optional: `NEBIUS_BASE_URL`, `NEBIUS_MODEL`, `TAVILY_API_KEY`. Credentials must be placed in `.env` (gitignored); they must never be pasted into chat or committed.
3. The bare-letter currency-prefix boundary and the unqualified SLA dollar cell are documented engine limitations (§6.1), not regressions; no unsupported fee claim is promoted.
4. Production trace reconstruction remains impossible from repository data; all red evidence uses labelled synthetic fixtures run through the exact base-SHA engine.
5. PR #7 is updated on the existing branch only. It is not merged, no Vercel or GitHub settings were changed, and nothing was deployed.
