# Hackathon compliance checklist

Checked against the official requirements recorded in [`research/OFFICIAL_REQUIREMENTS.md`](research/OFFICIAL_REQUIREMENTS.md) on **2026-10-23**. “Implemented” is not treated as “runtime verified.”

| Requirement                                                                            | Status                                       | Evidence / exact gap                                                                                                                  |
| -------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Declare a fitting track                                                                | **COMPLETE**                                 | Best Apps and Agents; product is a working evidence-to-action application                                                             |
| Use an NVIDIA open-source model through Nebius Token Factory or run on Nebius AI Cloud | **BLOCKED**                                  | Exact Nano/Nebius client and structured calls implemented and mocked; no genuine response observed because no credential is available |
| Working project / demo or test build                                                   | **STATIC/SAMPLE VERIFIED; LIVE BLOCKED**     | Production build, public sample workflow, and browser tests pass; genuine Nebius central workflow remains unverified                  |
| Free judge access through judging                                                      | **PUBLIC ACCESS OBSERVED / NOT A GUARANTEE** | `https://proofpath-woad.vercel.app` served without an auth redirect; continued availability through judging is not guaranteed         |
| Public source repository                                                               | **PUBLIC BRANCH AVAILABLE / PR OPEN**        | `timmyspurs12/WeatherPact` on `arena/38ba6a7c-weatherpact`; entrant must select the final submission ref                              |
| Detectable open-source license                                                         | **COMPLETE IN WORKTREE**                     | MIT `LICENSE`; must be present on the submitted public ref                                                                            |
| Reproducible setup and infrastructure documentation                                    | **COMPLETE IN WORKTREE**                     | README, `.env.example`, architecture, deployment, CI, scripts                                                                         |
| Public YouTube video under three minutes                                               | **BLOCKED / NOT CREATED**                    | 2:45 script/storyboard exists; no real live recording or public YouTube URL                                                           |
| Sponsor/tool feedback                                                                  | **PENDING ENTRANT SUBMISSION**               | Draft feedback included in Devpost material; not represented as submitted                                                             |
| Genuine runtime call for Best Use of Tavily                                            | **NOT CLAIMED**                              | Optional adapter implemented; no key and no genuine call, so no bonus eligibility claim                                               |
| Explain pre-existing project updates                                                   | **COMPLETE**                                 | ProofPath is new; unrelated 64-file source archived at `legacy/weatherpact/`; original commit recorded                                |
| Eligible entrant and region                                                            | **ENTRANT MUST CONFIRM**                     | Rules researched; identity, age, billing/onboarding, and attendance cannot be verified by code                                        |
| Secure server-side inference                                                           | **IMPLEMENTED / LOCALLY TESTED**             | Server-only key, official-host restriction, schema validation, bounded calls; hosted health/API verified without a live credential    |
| Provider data-retention behavior                                                       | **UNRESOLVED**                               | Account-level 30-day/Zero Data Retention behavior is not verified; `store: false` alone is not presented as a guarantee               |
| Editable, ordered plan with completion criteria                                        | **COMPLETE / BROWSER TESTED**                | Topological steps, dependencies, completion criteria, editing, add/delete, persistent checks                                          |
| Inspectable evidence and uncertainty                                                   | **COMPLETE / FIXTURE + BROWSER TESTED**      | Exact quotes, source ledger, four states, unresolved questions, conflicts                                                             |
| Durable user-driven persistence                                                        | **COMPLETE WITH STATED LIMITS**              | Explicit localStorage saves survive reload; no account/cross-device sync; export for backup                                           |
| Explicit source rechecking                                                             | **IMPLEMENTED / UNIT TESTED**                | Live-plan UI calls hash/availability endpoint; sample does not pretend to recheck                                                     |
| Tests and evaluation                                                                   | **COMPLETE FOR DETERMINISTIC SCOPE**         | 41 tests, 12 E2E scenarios, and 12 evaluation cases passed; live model quality not measured                                           |
| Premium responsive UX                                                                  | **IMPLEMENTED / SIX-WIDTH MATRIX PASS**      | Actual inspected screenshots, four-route overflow checks at 1440/1280/1024/768/390/320 px, and tested axe scans                       |
| Demo screenshots and 2:45 script                                                       | **COMPLETE**                                 | Six full-page views, twelve viewport captures, and timestamped storyboard                                                             |
| Final test report, blockers, Devpost draft, A–J handoff                                | **COMPLETE IN WORKTREE**                     | See corresponding docs; statuses preserve blockers                                                                                    |

## Submission gate

**Do not submit as compliant yet.** At minimum, the entrant must:

1. Provision a valid Nebius Token Factory key and run `npm run verify:live` successfully.
2. Configure the separate deployed project and complete a real UK passport plan in a clean browser; retain its actual runtime receipt.
3. Confirm the final public repository ref and license detection, and keep the verified demo publicly accessible through judging.
4. Record the real workflow using `DEMO_SCRIPT.md`, keep the video under three minutes, publish it publicly on YouTube, and insert the actual URL.
5. Enter truthful Devpost links/feedback and confirm eligibility. Claim no Tavily bonus without a genuine runtime Tavily call.
