# Actual browser screenshots

Captured on **2026-10-23** from the local production build (`npm start`) using Chromium 153 through Playwright. No screenshot is a generated mockup.

| File                  | Viewport               | What it establishes                                                                               |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `01-home-desktop.png` | 1440 × 1000, full page | Main task workflow, source inputs, responsive desktop design, and honest unconfigured-live notice |
| `02-plan-desktop.png` | 1440 × 1000, full page | Labelled sample plan, evidence states, completion criteria, source ledger, and export controls    |
| `03-plan-mobile.png`  | 375 × 812, full page   | Same plan at mobile width with stacked source ledger and no horizontal page overflow              |

The plan is the **static labelled sample**, not a live model response. The home notice records that Nebius was not configured on the capture server. Screenshots do not establish live hackathon compliance.

Reproduce after starting the production server:

```bash
npm run build
npm start
# In another terminal, with a Playwright Chromium installed:
npm run screenshots
```

Set `PLAYWRIGHT_BASE_URL` to capture another actual deployment and `CHROMIUM_EXECUTABLE_PATH` to use an existing browser binary.
