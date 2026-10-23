# ProofPath evaluation report

Generated: 2026-10-23T20:33:53.065Z

**Mode: deterministic fixtures and a mocked provider boundary. No live Nemotron, Nebius, or Tavily quality claim is made.**

## Results

- Cases: **12/12 passed** (0 failed)
- Final citation coverage: **26.7%**
- Raw supported claims rejected: **37.5%**
- Expected genuine conflicts detected: **1/1**
- Missing-information cases handled: **1/1**
- Mocked-provider end-to-end API workflows: **1/1**
- Provider failure cases contained: **3/3**
- Median local fixture/API latency: **0.59 ms** (not model latency)

## Metric definitions

- **Citation coverage:** final source-supported steps / all steps in the eight evidence fixtures. It is a small fixture result, not an accuracy estimate for real tasks.
- **Unsupported-claim rate:** model-claimed supported steps rejected for lack of a valid citation / all model-claimed supported steps in those fixtures.
- **Conflict detection:** a conflict survives only with exact passages from at least two sources. A separate fabricated-conflict case must be rejected.
- **Missing information:** an unsupported step must become unverifiable while its unresolved question remains visible.
- **End-to-end completion:** an uploaded source traverses the real Express route, retrieval normalization, a mocked Nebius transport, schema parsing, and evidence gate. It does not test live model behavior.
- **Provider failure handling:** missing credentials, authentication failure, and invalid structured output must return typed errors rather than fabricated plans.

## Case ledger

| Case                                | Category         | Result | Latency (ms) |
| ----------------------------------- | ---------------- | ------ | -----------: |
| valid-supported-and-inferred        | evidence         | PASS   |         3.61 |
| fabricated-supported-quote          | evidence         | PASS   |         0.49 |
| unknown-source-citation             | evidence         | PASS   |         0.31 |
| unsupported-date-removal            | evidence         | PASS   |         0.31 |
| valid-two-source-conflict           | evidence         | PASS   |         0.69 |
| fabricated-conflict-rejection       | evidence         | PASS   |         0.27 |
| missing-information-remains-visible | evidence         | PASS   |         0.27 |
| dependency-cycle-removal            | evidence         | PASS   |         0.35 |
| provider-missing-credential         | provider-failure | PASS   |         0.88 |
| provider-authentication-failure     | provider-failure | PASS   |         1.45 |
| provider-schema-failure             | provider-failure | PASS   |         1.91 |
| mocked-provider-full-api-workflow   | workflow         | PASS   |        45.27 |

## Limitations

This is a deliberately small adversarial suite, not a representative benchmark. Exact-quote matching does not prove semantic entailment, source authority, freshness, or jurisdictional applicability. Live model latency, quality, Nebius availability, Tavily discovery, and production behavior require separate genuine runtime verification.
