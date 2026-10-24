# ProofPath evaluation report

Generated: 2026-10-24T08:02:00.056Z

**Mode: deterministic fixtures and a mocked provider boundary. No live Nemotron, Nebius, or Tavily quality claim is made.**

## Results

- Cases: **14/14 passed** (0 failed)
- Final citation coverage: **28.6%**
- Raw supported claims rejected: **50.0%**
- Expected genuine conflicts detected: **1/1**
- Missing-information cases handled: **1/1**
- Mocked-provider end-to-end API workflows: **1/1**
- Provider failure cases contained: **3/3**
- Median local fixture/API latency: **1.2 ms** (not model latency)

## Metric definitions

- **Citation coverage:** final source-supported steps / all steps in the deterministic evidence fixtures. It is a small fixture result, not an accuracy estimate for real tasks.
- **Unsupported-claim rate:** model-claimed supported steps rejected for lack of a valid citation / all model-claimed supported steps in those fixtures.
- **Conflict detection:** a conflict survives only with exact passages from at least two sources. A separate fabricated-conflict case must be rejected.
- **Missing information:** an unsupported step must become unverifiable while its unresolved question remains visible.
- **End-to-end completion:** an uploaded source traverses the real Express route, retrieval normalization, a mocked Nebius transport, schema parsing, and evidence gate. It does not test live model behavior.
- **Provider failure handling:** missing credentials, authentication failure, and invalid structured output must return typed errors rather than fabricated plans.

## Case ledger

| Case                                         | Category         | Result | Latency (ms) |
| -------------------------------------------- | ---------------- | ------ | -----------: |
| valid-supported-and-inferred                 | evidence         | PASS   |        12.36 |
| fabricated-supported-quote                   | evidence         | PASS   |         0.77 |
| unknown-source-citation                      | evidence         | PASS   |         0.37 |
| unsupported-date-removal                     | evidence         | PASS   |         0.51 |
| valid-two-source-conflict                    | evidence         | PASS   |         1.74 |
| fabricated-conflict-rejection                | evidence         | PASS   |          0.5 |
| missing-information-remains-visible          | evidence         | PASS   |         0.74 |
| official-contradiction-downgrades-fee        | evidence         | PASS   |         2.48 |
| route-specific-requirement-cannot-mix-routes | evidence         | PASS   |         1.47 |
| dependency-cycle-removal                     | evidence         | PASS   |         0.52 |
| provider-missing-credential                  | provider-failure | PASS   |         0.92 |
| provider-authentication-failure              | provider-failure | PASS   |         1.77 |
| provider-schema-failure                      | provider-failure | PASS   |         4.71 |
| mocked-provider-full-api-workflow            | workflow         | PASS   |        89.49 |

## Limitations

This is a deliberately small adversarial suite, not a representative benchmark. Exact-quote matching does not prove semantic entailment, source authority, freshness, or jurisdictional applicability. Live model latency, quality, Nebius availability, Tavily discovery, and production behavior require separate genuine runtime verification.
