# Project research and weighted selection

Research date: 2026-10-23. Nine meaningfully different concepts were reviewed against current product, repository, pain-point, and hackathon evidence. Scores are judgments informed by the cited observations, not measured market demand or predictions of winning.

## Method

Each category is scored directly up to its weight; totals are out of 100.

- Originality and defensibility: **20**
- Real-world impact and breadth: **20**
- Technical implementation and legitimate AI necessity: **20**
- Product experience and demonstration: **15**
- Feasibility and completion risk: **15** (higher = lower risk)
- Competitive differentiation and submission clarity: **10**

## Scorecard

| Candidate                                                              | Originality /20 | Impact /20 | AI + technical /20 | Demo /15 | Feasibility /15 | Differentiation /10 | **Total /100** |
| ---------------------------------------------------------------------- | --------------: | ---------: | -----------------: | -------: | --------------: | ------------------: | -------------: |
| **ProofPath — evidence-to-action plans for official processes**        |              16 |         18 |                 18 |       14 |              13 |                   9 |         **88** |
| A11yPatch — WCAG-linked accessibility fixes with deterministic retests |              15 |         17 |                 19 |       14 |              10 |                   8 |         **83** |
| RecallRoute — model/lot matching and official recall remedy plans      |              14 |         17 |                 13 |       12 |              14 |                   7 |         **77** |
| CI Forensics — failing-test diagnosis and verified minimal patches     |              11 |         18 |                 19 |       13 |               8 |                   6 |         **75** |
| BinRule — photo identification constrained by municipal waste rules    |              12 |         16 |                 17 |       14 |              10 |                   6 |         **75** |
| FieldProof — crop symptom triage linked to local extension guidance    |              11 |         19 |                 18 |       13 |               7 |                   6 |         **74** |
| PolicyDelta — regulatory changes converted to obligation plans         |              11 |         18 |                 18 |       11 |               9 |                   5 |         **72** |
| DriftGuide — OpenAPI diffs converted to consumer migration plans       |              12 |         16 |                 14 |       12 |              12 |                   5 |         **71** |
| ManualMend — appliance diagnosis from images/audio and manuals         |              10 |         16 |                 18 |       14 |               7 |                   5 |         **70** |

## Candidate evidence, competitors, and failure risks

### 1. ProofPath — selected

**Observed problem.** Administrative-burden research distinguishes learning costs (understanding eligibility and process) from compliance costs (forms and documentation). An ACUS report collected evidence that unclear processes and documentation can prevent completion. This supports the narrow workflow of turning official instructions into an actionable checklist; it does not prove demand for this particular product.

**Existing alternatives.** Gemini Notebook/NotebookLM provides source-grounded answers and citations. Government Navigator and multiple open-source benefits navigators produce official-source checklists. The closest current hackathon competitor found is **FinePrint**, which validates verbatim rules, detects cross-page conflicts, and prioritizes submission fixes. **ScopeCheck** also uses exact source-line evidence. These findings reduce the originality score and rule out a generic “AI with citations” pitch.

**Differentiating mechanism.** ProofPath is not eligibility screening or a chatbot. It produces one editable, ordered plan; every supported instruction must carry an exact passage that survives deterministic source-text validation. Invalid model citations become “Unable to verify,” user edits lose supported status, conflicts remain visible, and source rechecks happen only on request. Progress, saving, and export complete the action loop.

**AI necessity.** A conventional rules engine can check fixed eligibility criteria, but arbitrary official instructions vary in language, conditions, exceptions, and structure. Nemotron performs goal clarification and semantic extraction/sequencing; code—not the model—decides whether evidence exists and whether a quote is genuine.

**Largest risk.** An authoritative page can still be incomplete, stale, or irrelevant, and exact-quote validation does not prove an instruction is a correct interpretation. Live model quality and source coverage therefore require evaluation; ProofPath never turns “cited” into “officially approved.”

Sources: [ACUS administrative-process report](https://www.acus.gov/sites/default/files/documents/Identifying-and-Reducing-Burdens-in-Administrative-Processes-Final-Report-2023.12.05_2.pdf), [Health Affairs burden overview](https://www.healthaffairs.org/do/10.1377/hpb20200904.405159/full), [Gemini Notebook](https://workspace.google.com/products/notebooklm/), [FinePrint](https://github.com/coo001/fineprint), [ScopeCheck](https://github.com/Straya-United/scopecheck), [Government Navigator](https://skills-for-ai.com/skills/government-navigator/).

### 2. A11yPatch — finalist, not selected

**Evidence.** WebAIM's 2026 crawl reported automatically detectable WCAG failures on 95.9% of one million home pages, with the explicit caveat that automated detection is not a full conformance assessment.

**Strongest competitor.** axe/WAVE are established detectors; current hackathon repository **AccessProof** already tests keyboard tasks with Nemotron and produces reproducible reports.

**Mechanism and AI role.** Nemotron could map contextual findings to WCAG passages and propose semantic patches while browser execution verifies keyboard behavior. This is a stronger agentic loop than a text-only audit.

**Why rejected.** A credible differentiator needs a real browser loop, safe target fixtures, and before/after evidence within seven days. Competing directly with AccessProof raises the bar further. The concept remains attractive if the team already has browser automation infrastructure.

Sources: [WebAIM Million 2026](https://webaim.org/projects/million/), [AccessProof](https://github.com/SS221908/accessproof).

### 3. RecallRoute — finalist, not selected

**Evidence and competitors.** CPSC offers official recall search, alerts, a free app, and a public API. Notices often require model, date, lot, or serial matching and contain specific remedies.

**Mechanism and AI role.** The model can normalize messy product labels and notice language into candidate matches, but deterministic identifiers should decide the final match. The action plan can cite the exact remedy passage.

**Why rejected.** It is feasible and useful, but much of the defensible outcome is deterministic database matching rather than a necessary model capability. Official free tools already cover the basic journey; safe handling of false matches would need a substantial evaluation set.

Sources: [CPSC recalls](https://www.cpsc.gov/Recalls), [CPSC API](https://www.cpsc.gov/Recalls/CPSC-Recalls-Application-Program-Interface-API-Information), [CPSC recall app announcement](https://www.cpsc.gov/Newsroom/News-Releases/2020/CPSC-Use-National-Consumer-Protection-Week-to-Get-Recalled-Products-Out-of-Your-House).

### 4. CI Forensics

GitHub Copilot now offers one-click failing Actions investigation and fixes, and OpenHands advertises CI failure automation. A sandboxed reproduction-and-verification loop is technically strong and a natural Coding track fit, but a solo implementation would face repository setup, arbitrary dependency execution, secret isolation, and long test runs. Seven days is insufficient to make that broad execution path trustworthy.

Sources: [GitHub one-click CI fixes](https://github.blog/changelog/2026-05-18-one-click-fixes-for-failing-actions-with-copilot-cloud-agent/), [OpenHands](https://www.openhands.dev/).

### 5. BinRule

Local rules materially affect recycling outcomes; Recycle Coach explicitly warns that generic search can conflict with municipal rules. Recycle Coach already provides local “What Goes Where?” and image recognition, while Binit uses vision for household waste. The evidence-constrained vision idea is demonstrable, but the previous Nemotron Nano Omni endpoint is deprecated and a new vision model plus municipal fixture coverage would need validation. Existing products and vision evaluation risk lower the score.

Sources: [Recycle Coach local-rules discussion](https://www.recyclecoach.com/solutions/blog), [Recycle Coach product](https://www.recyclecoach.com/solutions/home), [Binit coverage](https://techcrunch.com/2024/06/03/binit-is-bringing-ai-to-trash/), [Nebius model deprecations](https://docs.tokenfactory.nebius.com/august-2026-deprecation-notice).

### 6. FieldProof

PlantVillage Nuru already provides offline crop-disease diagnosis. Peer-reviewed field results show both value and variable accuracy, while adoption research reports device and complexity constraints. Extension-linked uncertainty and escalation are valuable, but agricultural misdiagnosis and chemical recommendations create a high safety burden. A cloud-only demo would also miss the offline constraint that makes Nuru strong.

Sources: [Nuru field study](https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2020.590889/full), [adoption study](https://www.mdpi.com/2077-0472/14/11/2001), [IITA solution](https://propas.iita.org/en/solutions/nuru-for-in-field-pestdisease-diagnosis/19/details/).

### 7. PolicyDelta

MetricStream, Vanta, Finreg-E, and others already extract obligations, map controls, cite changes, and manage compliance workflows. The AI use is legitimate, but credible jurisdiction coverage, effective-date handling, and legal-review evaluation exceed a one-week solo scope. ProofPath keeps the evidence benefits without claiming legal compliance.

Sources: [MetricStream obligation extraction](https://www.metricstream.com/blog/regulatory-change-management-ai.html), [Finreg-E](https://finreg-e.com/), [Vanta EU AI Act](https://www.vanta.com/products/eu-ai-act).

### 8. DriftGuide

oasdiff already provides open-source breaking-change detection and CI integrations; the current hackathon has ContractLens and more execution-heavy migration entries. Deterministic diffing is the hard correctness core, leaving the model mainly to explain and sequence migrations. That is useful but less defensible as a distinct AI product.

Sources: [oasdiff](https://github.com/oasdiff/oasdiff), [ContractLens](https://github.com/Vcode2407/nebius-contractlens), [PortVerdict](https://devpost.com/software/portverdict).

### 9. ManualMend

iFixit FixBot already combines voice/text/vision diagnosis, a very large repair library, uploaded manuals, and parts guidance. This is the strongest direct competitor found among the candidates. Matching its corpus or diagnostic quality is unrealistic now; arbitrary repairs also create physical-safety risks.

Sources: [iFixit FixBot announcement](https://www.ifixit.com/News/114700/introducing-fixbot), [FixBot capabilities](https://www.ifixit.com/go/fixbot).

## Decision

**Build ProofPath for Best Apps and Agents.** It has the best combined score because one small, complete workflow can demonstrate semantic model value and a visible deterministic trust mechanism without requiring hardware, arbitrary code execution, a proprietary corpus, or a database. The scope is deliberately one engine—not a super-app combining benefits screening, legal advice, bill negotiation, and form submission.

### Finalist comparison

| Finalist    | Strongest competitor             | Non-generic mechanism                                                                                               | Biggest failure risk                                                    | Evidence supporting selection                                                                |
| ----------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| ProofPath   | FinePrint / Government Navigator | Exact-passage validation controls four evidence states across an editable action plan; edits can invalidate support | Citation is mistaken for correctness; live model may produce weak plans | Administrative-burden research + feasible two-call architecture + clear visible trust states |
| A11yPatch   | AccessProof / axe                | Model-proposed changes accepted only after executable keyboard retests                                              | Browser reliability and safe execution                                  | WebAIM problem evidence + strong agentic loop, but more infrastructure                       |
| RecallRoute | CPSC app                         | Messy label normalization plus deterministic lot/model gates and cited remedies                                     | False positive/negative safety match                                    | Official API aids feasibility, but model necessity is weaker                                 |

## Assumptions to test, not facts

- Users will understand and value four evidence states more than a single confidence score.
- Exact passages plus completion criteria will be more actionable than a cited summary in a real task.
- Nemotron Nano can produce sufficiently reliable structured extraction with the provided source packet.
- A small set of official pages is enough for a compelling demo; broad jurisdiction coverage is not promised.

These assumptions require live model evaluation and user testing. No user statistics, testimonials, or outcome improvements are claimed.
