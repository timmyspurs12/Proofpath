# ADR 0001: Select ProofPath

- Date: 2026-10-23
- Status: Accepted

## Context

Nine concepts were researched and scored against originality, impact, legitimate AI necessity, demo quality, solo feasibility, and submission clarity. Strong existing projects make generic cited chat, coding repair, compliance extraction, and repair assistance poor differentiators. The full evidence and scores are in `docs/research/IDEA_SCORECARD.md`.

## Decision

Build **ProofPath — Evidence-to-Action Engine** for the **Best Apps and Agents** track.

The smallest complete product is a single workflow: task → essential clarification → retrieved sources → evidence-validated ordered checklist → inspect/edit/check/save/export. Nemotron Nano on Nebius handles semantic intake and plan synthesis. Deterministic code controls evidence states.

## Consequences

- The visible advantage is auditable evidence status, not a chat interface or number of agents.
- No eligibility determinations, legal advice, application submission, account system, or general-purpose assistant will be added.
- Direct URLs work without a search provider; Tavily is optional and receives no bonus claim without a real runtime call.
- Missing Nebius credentials are a mandatory submission blocker, not a reason to simulate inference.
- The unrelated existing WeatherPact application remains available in `legacy/weatherpact`; ProofPath does not claim WeatherPact features or deployment status.
