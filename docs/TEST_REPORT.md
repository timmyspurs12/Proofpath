# Final test report

Run date: **2026-10-23 UTC**  
Workspace: Debian 12, Node `v22.22.3`, npm `10.9.8`  
Browser: Chromium 153 via Playwright, headless, production build served by Express

## Result summary

| Check                    | Observed result                          | Scope / evidence                                                                                                |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| TypeScript               | PASS                                     | `tsc --noEmit`; client, server, scripts, and tests                                                              |
| Production build         | PASS                                     | `npm run build`; Vite production output generated                                                               |
| Unit/API/component tests | **39/39 PASS**                           | Six Vitest files; deterministic fixtures, real Express routes with mocked provider boundary, jsdom localStorage |
| Evaluation harness       | **12/12 PASS**                           | Actual executed cases; `docs/EVALUATION.md`, `docs/evaluation/cases.json`, `public/evaluation.json`             |
| Browser workflow         | **6/6 PASS**                             | Real Chromium against production build; sample, edit/downgrade, persistence, export, mobile, provider blocker   |
| Automated accessibility  | PASS for tested pages                    | axe WCAG 2 A/AA + WCAG 2.1 AA tags returned no violations on home and sample plan                               |
| Mobile overflow          | PASS at 375 × 812                        | Home and sample plan; screenshots visually inspected                                                            |
| Dependency audit         | **0 known vulnerabilities**              | `npm audit --audit-level=moderate` after dependency updates                                                     |
| Screenshots              | PASS                                     | Three actual browser captures in `docs/screenshots/`; no generated mockups                                      |
| Live Nebius inference    | **BLOCKED / NOT RUN**                    | No credential; no success claim                                                                                 |
| Live Tavily discovery    | **BLOCKED / NOT RUN**                    | No credential; no bonus claim                                                                                   |
| Public Vercel deployment | PENDING at this report’s initial writing | Separate project exists; no URL claimed before a deployment result                                              |
| Public YouTube video     | **NOT CREATED / BLOCKED**                | No live workflow to record and no YouTube publishing connection; script is provided                             |

## Commands executed

```bash
npm run typecheck
npm run build
npm test -- --reporter=dot
npm run evaluate
npm audit --audit-level=moderate
LD_LIBRARY_PATH=/tmp/al2023/lib \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
npm run test:e2e
```

The `LD_LIBRARY_PATH` and executable overrides are sandbox-specific. Normal local setup uses `npx playwright install chromium` and `npm run test:e2e`; CI installs Chromium with dependencies.

## Unit and integration coverage

- Exact contiguous citations; typography/whitespace normalization; stitched fragments and unknown sources rejected.
- Supported/inferred preservation; fabricated supported claims downgraded; invalid evidence removed.
- Dates retained only with matching validated citation text.
- Two-source conflict acceptance; fabricated/one-source conflict rejection.
- Stable dependency ordering; unknown/self/cyclic dependencies removed without exceeding schema limits.
- Nebius endpoint/model/bearer/JSON-Schema request construction; no-credential fail-closed behavior; retry and authentication behavior; malformed JSON/schema; timeout errors; official-host restrictions.
- Public/private IP handling, mapped loopback, redirect revalidation, deceptive official-host signals, content types, response caps, HTML extraction, bounded upload hashes, and explicit source rechecks.
- Health, validation, 404, rate-limit, uploaded-plan, source-verification, and missing-credential API paths.
- Local save, new local ID, completion persistence, reload, and corrupt-storage preservation.
- Markdown evidence/provenance and safe filenames.

## Real browser scenarios

1. Open the labelled sample; inspect six steps and exact evidence; mark complete; save; reload; verify persisted state.
2. Edit a supported factual title; verify **Inferred — confirm** and edited provenance; reload and verify persistence.
3. Download Markdown and inspect source URL, sample provenance, and evidence state in the file.
4. Check home and plan at 375 px for horizontal page overflow.
5. Run axe scans on home and sample plan.
6. Submit the real-task form on an unconfigured server; verify the actual 503-derived blocker and no simulated plan.

## Failures found and fixed

- Initial TypeScript inference around Zod-defaulted fields was corrected with output-schema generics; an unused parameter and missing exported document type were fixed.
- A browser-library test lacked cleanup between renders; explicit Testing Library cleanup fixed test isolation.
- Source dates initially required only general step evidence; validation now requires the date text in a validated citation.
- Post-validation note growth could exceed schema bounds; notes are now bounded after all validation stages.
- Deceptive hostnames such as `gov.uk.evil.example` no longer receive an official-domain signal; mapped private IPv6 handling was added.
- The first Chromium launch lacked NSS shared libraries; compatible package libraries were supplied and the same browser suite was rerun.
- Axe found muted-text contrast failures; the palette was darkened and completed-card opacity removed.
- Axe then found an unnamed progress bar; an accessible name was added. Both scans subsequently passed.

## Honest limits

Passing fixtures do not measure representative Nemotron accuracy. Exact quotation is not semantic entailment. Small adversarial citation-coverage numbers describe the fixture mix, not user-task performance. No live latency, model-quality result, deployment uptime, cross-browser matrix, screen-reader manual audit, PDF workflow, or production security certification is claimed.
