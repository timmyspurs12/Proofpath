# Contradiction false-positive root-cause report and live evidence validation

Date: 2026-10-24 (Africa/Lagos)
Branch: `arena/fbedd78e-proofpath` (updates PR #7; not merged, not deployed)

- **Production/base SHA (red comparison):** `51a24f98af4259f581f012044aec903091ff0401` — the exact `githubCommitSha` of the promoted Vercel production deployment `dpl_HGQ8sH8TNCg3yS1w64trsFFvwSkS` (alias `proofpath-woad.vercel.app`, READY/PROMOTED) and the tip of `main`.
- **Fixed SHA (green comparison):** `3e1fb2b5cea1bf2b83cd365b63d5794f180da750` — committed and pushed to the PR branch; the engine red/green results in §4 were produced against a clean checkout of this exact revision, never against an uncommitted working tree.
- **Live-harness SHA:** `103c48cef77e59f136d6440286b8309883dd6eae` — the targeted Nigerian live-acceptance harness (§7) and its original 11 offline tests, layered on the fixed engine with zero changes under `server/lib`.
- **Acceptance-gate correction SHA:** `cec6b58` — the false-positive trap guard and retrieval-provenance contract (§7.1), 15 offline harness tests and the additive `modelPlan` return in `server/lib/plan.ts`. All 201-test, build, serverless and Playwright results in §8 were re-run on this revision; the blocked live-harness behaviour is unchanged.
- Intermediate branch commit `b3ff7712de243a9aa5982911439db96597fa8825` is the parent of the fix commit and is retained in history only; it is not a tested green revision for this report.

## 1. Provenance and evidence handling

| Artifact                             | Exact identity                                                                                         | Nature and handling                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Red engine                           | commit `51a24f9` checked out in an isolated git worktree (`/tmp/proofpath-base`), no edits             | The exact production code; exercised by the probe below                                                                                                     |
| Green engine                         | commit `3e1fb2b` checked out clean in the main working tree                                            | All Vitest, Playwright, build and probe evidence for the engine fix was generated on this revision                                                          |
| Live-acceptance harness              | commit `103c48c` on the same branch; no engine files changed                                           | Nigeria-targeted `verify:live` rework with 11 offline harness tests; full 197-test gate re-run on this revision (§7, §8)                                    |
| Acceptance-gate correction           | commit `cec6b58`; one additive orchestration field in `server/lib/plan.ts`, no validation-logic change | Trap false-positive guard plus live-retrieval provenance contract; 15 offline harness tests; full 201-test gate re-run (§7.1, §8)                           |
| Production model trace               | Not stored anywhere in the repository                                                                  | Not reconstructed; no raw model output is invented                                                                                                          |
| Synthetic regression inputs          | `tests/fixtures/contradiction-diagnostics.ts`, `tests/fixtures/contradiction-context.ts`               | **Synthetic, clearly-labelled fixtures** reproducing the reported passage _kinds_; IP-literal stand-in hosts; zero network calls; not replays of production |
| Fresh-source case                    | `tests/fixtures/nigeria-official-2026.ts`                                                              | **Verbatim excerpts** of four official NIS pages fetched over HTTPS on 2026-10-24, then frozen; the test suite itself makes no network calls                |
| Red/green probe outputs (gitignored) | `artifacts/contradiction-red-51a24f9.json`, `artifacts/contradiction-green-3e1fb2b.json`               | Each file records the engine SHA it actually ran; reproduction commands in §5                                                                               |
| Live inference receipt               | `artifacts/live-verification.json`                                                                     | Does not exist; no keyed run has occurred (§7, §9)                                                                                                          |

Commands actually executed against the committed revisions:

- Red (worktree at `51a24f9`): `ENGINE_DIR=/tmp/proofpath-base tsx /tmp/fp-probe.ts` → 7 spurious findings, 6 positive controls intact.
- Green (clean tree at `3e1fb2b`): the same probe, plus `npm run typecheck`, `npm test`, `npm run build`, `npm run format:check`, `npm run verify:serverless`, `npx playwright test`, and `npm run verify:live` (blocked path). Full results in §8.
- Harness rework (clean tree at `103c48c`): `npm run typecheck`, `npm test` (197/197), `npm run build`, `npm run format:check`, `npm run verify:serverless`, `npx playwright test` (14/14), plus direct checks of `npm run verify:live` (exit 2, no artifact) and `--case=bogus` (exit 1).
- Acceptance-gate correction (clean tree at `cec6b58`): the same full gate set, with `npm test` at 201/201 (17 files) and the harness file at 15 offline tests; the blocked-path checks still give exit 2 (no artifact) and exit 1 for an unknown case.

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

## 7. Targeted live-acceptance harness (Nigerian domestic renewal)

The previous `verify-live.ts` hardcoded a United Kingdom renewal and injected a preloaded GOV.UK excerpt through `TaskInput.document`, so it could not exercise the reported Nigerian regression. The harness was reworked around an explicit case registry; the contradiction engine itself was not modified in this rework (the original rework had zero diff under `server/lib`; the later correction in §7.1 adds one additive orchestration field to `server/lib/plan.ts` and touches no validation logic).

New and changed files:

- `scripts/live-cases/nigeria-domestic-renewal.ts` — the case definition. The request is "Renew an expired Nigerian adult passport domestically", jurisdiction `Nigeria`, adult/domestic/online details, `document: null` (no frozen excerpt may masquerade as retrieved evidence), and the four official starting URLs from §6 carried as `sourceUrls`. It declares the seven trap classes as explicit case-level expected relationships. Each class carries a `passagePattern` (which retrieved wording belongs to the class), a `protectedStepPattern` (steps the material must not be allowed to contradict), an `applicableStepPattern` (steps on which the contradiction is a genuine same-subject/same-route prohibition), and — only where sentence-less currency records may attach — an opt-in `currencyPassagePattern`.
- `scripts/live-cases/index.ts` — the case registry and `selectCase()`; the Nigeria case is the default and only case, selectable with `--case=<id>`.
- `scripts/live-acceptance.ts` — a pure, side-effect-free evaluator (`evaluateEvidenceAcceptance`) plus per-URL outcome derivation and trap-coverage analysis. It imports only types (plus the shared `hashText` helper) from the engine and contains no provider client or I/O, so it is fully unit-testable offline.
- `scripts/verify-live.ts` — runs the **existing** pipeline end to end: it captures `runStartedAt` immediately before `runIntake`, then `runIntake` → `runPlan(..., { includeDiagnostics: true })` with genuine retrieval (`retrieveSources` over the direct URLs, Tavily only if its key exists) and the normal `validateEvidencePlan` gate. No plan or validation result is constructed directly.

### 7.1 Acceptance-gate corrections (commit `cec6b58`)

Two gaps in the evaluator were closed without refactoring the contradiction engine; the only `server/lib` change is an additive `modelPlan` field on `runPlan`'s return (orchestration data, no validation logic change), which lets the acceptance layer reproduce the engine's positional model-id → `step-N` mapping.

1. **False-positive trap downgrades now fail the case verdict.** Every `contradiction` diagnostic is associated with the trap classes whose passage wording it uses, resolved through the model plan to the actual final plan step, and classified against the step's real title/instruction/citations: `legitimate` (the step matches the class's applicable pattern — same subject, route, circumstance and location; the downgrade stands), `false-positive` (a protected unrelated step was downgraded to `unverifiable`), `protected-not-downgraded` (protected step but no downgrade occurred), `unclassified` (matches no expected relationship — fail-closed manual review), or `unresolved` (the step id cannot be mapped — fail-closed). A new check, `no-false-positive-trap-downgrades`, fails acceptance on any `false-positive`, `unclassified` or `unresolved` observation, and the artifact records `falsePositiveViolations[]` and a `legitimateContradictions` count with full per-observation provenance (source id, sentence, reason code, resolved step id/title/status). Applicability is tested before protection so genuinely applicable prohibitions — for example a step asserting included bank charges or fully-online biometric completion — remain detectable contradictions. Sentence-less currency-section diagnostics (the bare-N `ungrounded-currency` record) cite a whole source, so they may attach only to a class that explicitly supplies `currencyPassagePattern`; this prevents one source-level record fanning out across every trap class whose wording happens to appear in that PDF. On the frozen fixture both real contradictions (`fee-context-mismatch` on the diaspora-fee step and `ungrounded-currency` on the included-charges step) classify exactly once as `legitimate`, with zero violations.
2. **Retrieval provenance is a contract, not a hostname check.** A retrieved source qualifies (`liveRetrievalQualified`) only when every requirement holds: the URL is on an allowed official host suffix, `authority` is exactly `official`, the excerpt/title/publisher metadata are non-empty, the retrieval route is a live pipeline route (`direct` or `tavily` — uploads and bundled samples never qualify), the stored sha256 matches `hashText` of the retrieved text, and `retrievedAt` is a parseable ISO-8601 timestamp. During a real harness run the timestamp must additionally fall inside the run window (`runStartedAt − 5 min` … evaluation time `+ 5 min`), so frozen fixture stamps, future-dated stamps and model-generated citations cannot evidence a live fetch; offline fixture runs omit `runStartedAt` and exercise only the structural checks. Every failure mode is enumerated per source in `provenanceIssues[]`. A requested URL that produced no source remains an honest per-URL `not-retrieved` outcome with its warning text; the case deliberately does not require all four URLs to succeed, and one qualified official source is enough for the retrieval check while the ledger stays complete.

Trap classes with no retrieved passage (on the frozen fixture: the consular internet/printing and age/guardian classes) stay unexercised and are reported as limitations in `trapCoverage`; they are never simulated.

Two independent verdicts are written to `artifacts/live-verification.json` (gitignored):

1. `liveInferenceVerified: true` — present only when a real keyed Nebius run completed with a live receipt; it says nothing about evidence quality.
2. `caseAcceptance: { caseId, passed, checks[], reasons[], trapCoverage[], falsePositiveViolations[], legitimateContradictions, contradictionCount }` — the evidence-quality verdict. It fails when the request is off-target or injects a document, no source satisfies the full live-retrieval provenance contract (§7.1), the live receipt is incomplete, diagnostics are missing or carry an undocumented reason code, the in-person biometric obligation is not supported on an official citation, a supported step claims fully-online/no-visit completion or included bank charges, a supported fee step lacks an official citation, citation warnings are inconsistent, unresolved questions are malformed, or a retrieved trap passage downgrades a protected unrelated step (or any trap contradiction is unclassifiable/unresolvable). The artifact also records the actual request, code revision/branch, `runStartedAt`, provider/model/response ids, per-URL retrieval outcomes (publisher, authority, route, timestamp, hash, excerpt length, warning, qualification flag and provenance issues), the exact stored excerpts, before/after step statuses, removed citations, reason-code histogram and retained unresolved questions.

Trap coverage is three-valued and honest: `materialRetrieved` (the wording exists in a genuinely retrieved source), `evaluated` (the engine emitted a diagnostic decision on it), `exercised` (both). Affirmative passages that need no decision, and trap classes absent from the live sources, are recorded rather than simulated. A model response alone can never pass the acceptance case. Exit codes: `0` full pass, `1` runtime/configuration error, `2` blocked for missing credentials (no request, no artifact), `3` live inference succeeded but evidence acceptance failed (the artifact is still written as evidence).

PDF handling uses the existing fail-closed retrieval path (`fetchSource` → bounded 10 MB `extractPdfText`), covered by the repository's PDF unit tests. If the live SLA PDF cannot be fetched or parsed during a real run, its URL is recorded `not-retrieved` with the warning text and the remaining official HTML sources carry only the claims they actually support; no PDF content is inferred or fabricated.

## 8. Harness tests and gate results

The harness is covered by `tests/live-acceptance.test.ts` (15 tests, all offline, no network or provider calls): case-definition and registry checks; a full-pass evaluator run on the labelled frozen Nigeria fixture; per-URL outcome assertions including the provenance-qualification flag and issue list; the three-valued trap matrix; explicit classification assertions showing both fixture contradictions are `legitimate` and zero false-positive violations occur; a simulated printed-photo passage downgrading the protected portal/NIN step fails acceptance under `no-false-positive-trap-downgrades`, while the same passage on an applicable photo-posting step stays a legitimate contradiction; provenance regressions for missing, malformed and frozen/stale timestamps, a non-pipeline (`upload`) route and a tampered content hash, plus a genuinely fresh in-window timestamp qualifying; failure cases for wrong jurisdiction, injected document, no official source, supported fully-online and included-charges steps, incomplete receipt and unknown reason code; honest `not-retrieved` handling when the PDF source is absent; and a subprocess test proving the blocked path exits 2 and writes no artifact.

| Gate                      | Command                                               | Result                                                                                                                                  |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Type checking             | `npm run typecheck`                                   | clean                                                                                                                                   |
| Unit/integration tests    | `npm test`                                            | 17 files, **201/201 passed** (186 engine/pipeline + 15 harness tests)                                                                   |
| Build                     | `npm run build`                                       | `tsc` + Vite + serverless bundle all succeed                                                                                            |
| Serverless smoke          | `npm run verify:serverless`                           | HTTP 200, `live_inference_verified: false`                                                                                              |
| Formatting                | `npm run format:check`                                | all files pass Prettier                                                                                                                 |
| Universality guard        | grep over the three engine files                      | zero country/currency/document rules; only the pre-existing neutral ISO-4217 registry mentions `NGN`; no engine validation file changed |
| E2E + accessibility       | `npx playwright test` (Chromium 153.0.8010.0 harness) | **14/14 passed**, including both WCAG 2.2 A/AA suites                                                                                   |
| Live harness blocked path | `npm run verify:live`                                 | exit 2, no artifact; unknown `--case` exits 1                                                                                           |
| GitHub CI                 | `gh pr checks 7`                                      | `verify`, Vercel and Vercel Preview Comments pass on the pushed branch head                                                             |

## 9. Limitations, live-verification status and next command

1. **The Nigerian live acceptance test has NOT run against live inference or live retrieval.** No `artifacts/live-verification.json` exists. Two independent blockers exist in this sandbox, confirmed by direct checks: all five live environment variables are absent, and Node egress cannot reach `immigration.gov.ng` / `passport.immigration.gov.ng` (only the package registries and GitHub hosts are reachable), so even with a provider key the official sources could not be retrieved from here. The harness, its evaluator and its blocked path are implemented and tested offline; nothing in this report claims a live pass.
2. Exact command for a genuine run in an environment with network access to the official hosts: `npm run verify:live` (optionally `npm run verify:live -- --case=nigeria-domestic-adult-renewal`). Required variable: `NEBIUS_API_KEY` (alternatively `NEBIUS_TOKEN_FACTORY_API_KEY`); optional: `NEBIUS_BASE_URL`, `NEBIUS_MODEL`, `TAVILY_API_KEY` (without Tavily, the four direct official URLs still drive retrieval). Credentials go in gitignored `.env` only; never in chat or version control.
3. A successful run must be judged from `caseAcceptance.passed`, not from `liveInferenceVerified` alone. If retrieval fails, the jurisdiction is wrong, output is malformed or the pipeline does not complete, the acceptance flag stays absent/false and the reasons are enumerated in the artifact.
4. The bare-letter currency-prefix boundary and the unqualified SLA dollar cell remain documented engine limitations (§6.1); no unsupported fee claim is promoted, and the live evaluator independently rejects supported fee steps without official citations.
5. Production trace reconstruction remains impossible from repository data; all offline red/green evidence uses labelled synthetic fixtures run through the exact base-SHA engine, while the offline Nigeria case uses clearly-labelled frozen excerpts, never presented as fresh retrievals.
6. PR #7 is updated on the existing branch only. It is not merged, no Vercel or GitHub settings were changed, and nothing was deployed.
7. Two of the seven trap classes (consular internet/printing limitations and age/guardian-specific requirements) have no matching passage in the four frozen official sources, so they cannot be exercised offline and are recorded in `trapCoverage` as retrieved-material limitations rather than simulated. Their false-positive guard is still covered structurally by the shared classifier and by the printed-photo/fee/bank-charge regression tests; a genuine run that retrieves such wording will exercise them through the same per-observation path.
