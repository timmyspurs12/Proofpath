# Actual browser screenshots

Captured on **2026-10-23** from the redesigned local production build (`npm start`) using Chromium 153 through Playwright. Every image is an actual browser render, not a generated mockup. Reduced motion was enabled during capture.

| File                   | Viewport               | What it establishes                                                                           |
| ---------------------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| `01-home-desktop.png`  | 1440 × 1000, full page | Editorial Home, authentic sample preview, composer, source inputs, and provider-blocker state |
| `02-plan-desktop.png`  | 1440 × 1000, full page | Action path, prerequisites, completion criteria, progress, source ledger, and export controls |
| `03-plan-mobile.png`   | 390 × 844, full page   | The same plan with mobile navigation and a stacked source ledger                              |
| `04-saved-desktop.png` | 1280 × 900, full page  | A real locally saved sample record and browser-library progress                               |
| `05-about-desktop.png` | 1440 × 1000, full page | Evidence-state explanations, architecture, limitations, and measured fixture evaluation       |
| `06-home-mobile.png`   | 390 × 844, full page   | Mobile hero, preview, composer, examples, and useful starting points                          |
| `viewports/home-*.png` | Six widths × 900       | Above-the-fold Home renders at 1440, 1280, 1024, 768, 390, and 320 px                         |
| `viewports/plan-*.png` | Six widths × 900       | Above-the-fold plan renders at the same six widths                                            |

The plan is the **static labelled sample**, not a live model response. The saved record was created through the actual **Save to browser** workflow before its screenshot. The Home notice records that Nebius was not configured on the capture server. Screenshots do not establish live hackathon compliance.

All twelve viewport images reported `scrollWidth` equal to the browser viewport width. The six full-page views and twelve viewport images were visually inspected. Temporary captures also inspected expanded evidence, editing, confirmation, provider-error, empty-library, and missing-plan states; those secondary diagnostic images are not retained as product documentation.

Reproduce after starting the production server:

```bash
npm run build
npm start
# In another terminal, with a Playwright Chromium installed:
npm run screenshots
```

Set `PLAYWRIGHT_BASE_URL` to capture another actual deployment and `CHROMIUM_EXECUTABLE_PATH` to use an existing browser binary. The capture script overwrites these files with the current rendered interface.
