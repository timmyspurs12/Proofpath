# Final test report

Run date: **2026-10-23 UTC**  
Workspace: Debian 12, Node `v22.22.3`, npm `10.9.8`  
Browser: Chromium 153 via Playwright, headless, redesigned production build served by Express

## Result summary

| Check                    | Observed result           | Scope / evidence                                                                                                |
| ------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| TypeScript               | PASS                      | `tsc --noEmit`; client, server, scripts, and tests                                                              |
| Production build         | PASS                      | `npm run build`; Vite output and self-contained Vercel function generated                                       |
| Generated function smoke | PASS                      | `npm run verify:serverless`; plain Node loaded the generated bundle and returned honest HTTP 200 health         |
| Unit/API/component tests | **41/41 PASS**            | Seven Vitest files; evidence, provider/API boundaries, persistence, exports, and conflict presentation          |
| Evaluation harness       | **12/12 PASS**            | Executed deterministic fixtures; `docs/EVALUATION.md`, `docs/evaluation/cases.json`, `public/evaluation.json`   |
| Browser workflow         | **12/12 PASS**            | Real Chromium against the production build; workflows, dialogs, routes, accessibility, and responsive matrix    |
| Automated accessibility  | PASS for tested states    | axe WCAG 2 A/AA + 2.1 AA + 2.2 AA tags; desktop Home/Plan and mobile Home/Plan/About/Saved/dialog reported none |
| Responsive overflow      | PASS at six widths        | Home, Plan, About, and Saved at 1440, 1280, 1024, 768, 390, and 320 px; no horizontal page overflow             |
| Dependency audit         | **0 vulnerabilities**     | `npm audit --audit-level=moderate`                                                                              |
| Screenshots              | PASS / visually inspected | Six full-page views and twelve viewport captures in `docs/screenshots/`; secondary states also inspected        |
| Live Nebius inference    | **BLOCKED / NOT RUN**     | No credential; no success claim                                                                                 |
| Live Tavily discovery    | **BLOCKED / NOT RUN**     | No credential; no bonus claim                                                                                   |
| Public Vercel deployment | See deployment report     | `docs/DEPLOYMENT.md` records the deployed commit and public verification separately from these local results    |
| GitHub Actions CI        | PASS                      | Run `40023411588`: all install, typecheck, test, evaluation, build, serverless, browser, and audit steps passed |
| Public YouTube video     | **NOT CREATED / BLOCKED** | No genuine live workflow to record and no YouTube publishing connection                                         |

## Commands executed

```bash
npm run typecheck
npm run build
npm run verify:serverless
npm test
npm run evaluate
npm audit --audit-level=moderate
LD_LIBRARY_PATH=/tmp/al2023/lib \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
npm run test:e2e
LD_LIBRARY_PATH=/tmp/al2023/lib \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
npm run screenshots
```

The `LD_LIBRARY_PATH` and executable overrides are sandbox-specific. Normal local setup uses `npx playwright install chromium` and `npm run test:e2e`; CI installs Chromium with dependencies.

## Unit and integration coverage

- Exact contiguous citations; typography/whitespace normalization; stitched fragments and unknown sources rejected.
- Supported/inferred preservation; fabricated supported claims downgraded; invalid evidence removed.
- Dates retained only with matching validated citation text.
- Two-source conflict acceptance; fabricated/one-source conflict rejection.
- Conflict UI preserves both fixture passages, retrieval metadata, a safe next action, and the actual source recheck links.
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
4. Check Home and Plan at 375 px for horizontal page overflow.
5. Run axe scans with WCAG 2.2 AA tags on desktop Home and sample Plan.
6. Verify direct SPA routes, structured API 404s, no-store API behavior, and security headers without an auth redirect.
7. Submit the real-task form on an unconfigured server; verify the actual 503-derived blocker and no simulated plan.
8. Save and reopen a plan at its durable `/plans/:planId` route, reload it, cancel deletion with Escape, then confirm deletion.
9. Cancel and confirm step deletion; verify the step count and existing dependency labels.
10. Switch from the passport example to scholarship/utility outlines; verify editable values and removal of unrelated source URLs.
11. Check Home, Plan, About, and Saved for horizontal overflow at 1440, 1280, 1024, 768, 390, and 320 px; check the mobile New plan target height.
12. Run axe scans on mobile Home, Plan, About, Saved, and the open confirmation dialog.

## Failures found and fixed

- Initial TypeScript inference around Zod-defaulted fields was corrected with output-schema generics; an unused parameter and missing exported document type were fixed.
- A browser-library test lacked cleanup between renders; explicit Testing Library cleanup fixed test isolation.
- Source dates initially required only general step evidence; validation now requires the date text in a validated citation.
- Post-validation note growth could exceed schema bounds; notes are now bounded after all validation stages.
- Deceptive hostnames such as `gov.uk.evil.example` no longer receive an official-domain signal; mapped private IPv6 handling was added.
- The first Chromium launch lacked NSS shared libraries; compatible package libraries were supplied and the same browser suite was rerun.
- Earlier axe runs found muted-text contrast failures and an unnamed progress bar; the palette and accessible name were corrected.
- Real Vercel requests exposed missing server modules in traced TypeScript entries. The function is explicitly bundled, wrapped by a tracked API entry, and smoke-tested as a generated artifact.
- The first bundled ESM artifact failed on Express’s dynamic `tty` require; a Node `createRequire` banner fixed it.
- Saved-plan reopening used the transient current-plan route; it now uses the durable saved ID and survives reload.
- The redesigned dialog’s opacity transition briefly reduced text contrast during an axe scan. Opacity animation was removed; the full browser suite then passed.
- Task outlines initially retained prior source URLs. Switching examples now resets task-specific sources so unrelated evidence cannot be carried into a new outline.
- The conflict component test initially matched a quotation both on its step and in the conflict panel; the assertion was scoped to the intended panel.
- GitHub’s clean Vite development server exposed missing CSP headers on direct SPA routes. Development now sends the baseline security headers with explicit React-refresh/HMR exceptions; preview and production retain the strict deployed script policy. The complete CI browser suite then passed.
- A newly published high-severity Zod constrained-collection advisory failed the audit after the browser gate. Zod was upgraded to 4.6.7; all schema-sensitive tests, evaluation, builds, both local browser paths, and the final CI audit passed with zero known vulnerabilities.

## Honest limits

Passing fixtures do not measure representative Nemotron accuracy. Exact quotation is not semantic entailment. Small adversarial citation-coverage numbers describe the fixture mix, not user-task performance. No live latency, model-quality result, deployment uptime, cross-browser engine matrix, manual screen-reader audit, PDF workflow, or production security certification is claimed. Automated axe results do not prove complete WCAG conformance. All browser scenarios above used Chromium; the six-width check is a layout matrix, not six separate devices.
