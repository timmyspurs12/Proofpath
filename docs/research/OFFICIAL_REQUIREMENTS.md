# Official requirements and access check

Research date: **2026-10-23 (UTC)**. This file separates observations from assumptions. Links below are the sources actually read; no access, credit, or account status is inferred from marketing copy.

## Verified competition facts

- **Submission deadline:** 2026-10-30 at 10:00 Pacific (13:00 EDT / 17:00 UTC). Judging is scheduled for December 1–15, 2026.
- **Mandatory runtime:** the project must make a runtime call to Nebius Token Factory inference or run on Nebius AI Cloud compute. An NVIDIA model called through another provider does **not** satisfy this requirement.
- **Mandatory model:** at least one NVIDIA open-source model. The Best Apps and Agents track specifically asks for Nemotron through Token Factory.
- **Tracks:** Coding and Agentic Engineering; Best Apps and Agents; Personal AI; Physical AI.
- **Required submission materials:** working project and demo/test build, track, description, public YouTube video under three minutes, public source repository with a detectable open-source license and reproducible README, and sponsor/tool feedback.
- **Testing access:** the project must remain free and accessible to the sponsor, administrator, and judges through judging.
- **Judging:** Technological Implementation, Design, Potential Impact, and Quality of the Idea are equally weighted after a pass/fail viability and track-fit stage.
- **Prizes:** $20,000 / $10,000 / $6,000 overall; track awards; $3,000 Best Use of Tavily; city and feedback awards. Best Use of Tavily requires a functional runtime Tavily API call, not a logo or unused SDK.
- **Pre-existing projects:** significant updates during the submission period must be explained. ProofPath is a new application; the unrelated WeatherPact source already in this repository is retained under `legacy/weatherpact` and at commit `cde3ec2e2637accaf8db1656237721820ef1b564`.
- **Eligibility:** entrants must be of legal majority and not reside in an excluded jurisdiction. Nigeria is not in the explicit exclusion list, but the entrant must still confirm their own eligibility and account access.
- **City-award discrepancy:** the resources page contains broader wording, while the rules and FAQ require attendance for the City Winner award. No city-award eligibility is assumed.

Official sources:

1. [Hackathon overview, requirements, prizes, judges, and criteria](https://nebiusglobalaihackathon.devpost.com/)
2. [Official rules](https://nebiusglobalaihackathon.devpost.com/rules)
3. [FAQ](https://nebiusglobalaihackathon.devpost.com/details/faqs)
4. [Credits and resources](https://nebiusglobalaihackathon.devpost.com/resources)

## Verified Nebius and NVIDIA configuration facts

The public Token Factory catalog read on 2026-10-23 lists:

| Model                      | Exact public catalog ID                 | Type          | Published serverless price (per 1M tokens) |
| -------------------------- | --------------------------------------- | ------------- | ------------------------------------------ |
| Nemotron 3 Nano 30B A3B    | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | text-to-text  | $0.06 input / $0.24 output                 |
| Nemotron 3 Super 120B A12B | `nvidia/nemotron-3-super-120b-a12b`     | text-to-text  | $0.30 input / $0.90 output                 |
| Nemotron 3.5 Super VL      | `nvidia/Nemotron-3.5-Super-VL`          | image-to-text | $0.30 input / $0.90 output                 |

ProofPath selects **Nano** for bounded intake and evidence-to-plan calls. Super is configurable for an operator-run comparison, but is not necessary for the default path and is not claimed to improve quality without a live evaluation.

- Default API base: `https://api.tokenfactory.nebius.com/v1`.
- Authentication: server-side `Authorization: Bearer $NEBIUS_API_KEY`.
- Inference: `POST /chat/completions`; authenticated `GET /models` can confirm the account's available model IDs.
- Token Factory supports `response_format` with JSON Schema, but documentation warns structured-output support varies by model. ProofPath therefore also parses and validates every response with Zod.
- Nano's model card identifies the NVIDIA Nemotron Open Model License. This is an NVIDIA open-model/open-weight license; this repository does not make a separate OSI-license claim for model weights.
- Token Factory's current data terms say inputs and outputs may be retained for documented speculative-decoding purposes unless Zero Data Retention is enabled. `store: false` alone is not represented here as a ZDR guarantee. Users are told not to submit identity numbers or confidential documents.

Sources:

- [Authoritative public model catalog](https://tokenfactory.nebius.com/model-catalog.md)
- [Nemotron on Nebius](https://nebius.com/services/token-factory/nemotron)
- [Chat completion API](https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion)
- [List account models](https://docs.tokenfactory.nebius.com/api-reference/models/list-models)
- [Structured output and JSON](https://docs.tokenfactory.nebius.com/ai-models-inference/json)
- [NVIDIA Nano model card](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16)
- [Token Factory data-processing terms](https://docs.nebius.com/legal/dpa)

## Tavily facts

- Search is `POST https://api.tavily.com/search` with a bearer key.
- A basic search costs one API credit; advanced costs two.
- Tavily's official pricing page currently states 1,000 free credits/month with no card required. This is a published allowance, **not** proof that this workspace has an account or credits.
- ProofPath's Tavily adapter uses basic search only, disables generated answers and auto-parameters, and never treats Tavily's answer as evidence. Evidence comes from retrieved publisher passages.

Sources: [Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search), [credits and pricing](https://docs.tavily.com/documentation/api-credits).

## Access observed in this workspace

| Dependency                             | Observed state on 2026-10-23                                              | Consequence                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `NEBIUS_API_KEY` / Token Factory key   | Not present                                                               | No genuine inference or model-catalog call can be made here. Mandatory compliance is **blocked**.       |
| `TAVILY_API_KEY`                       | Not present                                                               | Adapter can be implemented and fixture-tested, but no live Tavily call or bonus eligibility is claimed. |
| Nebius AI Cloud account / GPU endpoint | Not present                                                               | No AI Cloud deployment is attempted or assumed.                                                         |
| Vercel deployment credential           | Not present in shell; connected-app deployment must be checked separately | A deployment URL is reported only after an actual deployment succeeds.                                  |
| Paid database / auth service           | Not needed                                                                | Plans are explicitly saved only in the visitor's browser; no cross-device account is offered.           |

The official resources page advertises a $25 Token Factory credit form with activation code `NEBIUS-DEVPOST-GLOBAL26` and a further Builders Program credit opportunity. Credit approval, regional onboarding, and remaining balance are unverified. The FAQ specifically warns that some countries are absent from Nebius billing onboarding and directs affected users to Nebius Discord. The exact resolution for this workspace is for the entrant to provision a valid server-side Token Factory key and run `npm run verify:live`; no fabricated success will be substituted.

## Submission gate

Until a real Nano response and a complete real plan run are observed, the project may be described as **implemented and locally tested with an unavailable live-inference dependency**, not as submission-ready, fully compliant, production-ready, or a verified Best Use of Tavily entry.
