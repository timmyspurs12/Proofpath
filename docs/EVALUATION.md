# ProofPath evaluation report

Generated: 2026-10-24T10:45:39.135Z

**Mode: deterministic fixtures and a mocked provider boundary. No live Nemotron, Nebius, or Tavily quality claim is made.**

## Results

- Cases: **25/25 passed** (0 failed)
- Final citation coverage: **29.4%**
- Raw supported claims rejected: **57.7%**
- Expected genuine conflicts detected: **1/1**
- Missing-information cases handled: **1/1**
- Mocked-provider end-to-end API workflows: **1/1**
- Provider failure cases contained: **3/3**
- Cross-jurisdiction universality cases: **11/11**
- Median local fixture/API latency: **0.71 ms** (not model latency)

## Cross-jurisdiction universality scenarios

Synthetic, clearly-labelled fixtures exercise one generic engine with no country-specific branches:

1. Nigerian domestic adult passport renewal (NGN fees, in-person biometrics) — `xjur-nigeria-domestic-passport-ngn-and-routes`
2. UK adult passport renewal — `official-contradiction-downgrades-fee` and `route-specific-requirement-cannot-mix-routes`
3. Third-country immigration process (Canada study permit, CAD) — `xjur-canada-study-permit-third-country-cad`
4. Non-passport task (French business registration, EUR) — `xjur-france-business-registration-non-passport`
5. Missing jurisdiction and route require clarification — `xjur-missing-jurisdiction-triggers-clarification` and `xjur-specified-request-needs-no-clarification`
6. Official source contradicts a secondary source — the Nigeria, Canada and UK fee cases
7. Inaccessible official source triggers alternative retrieval — `xjur-inaccessible-official-source-backfills-alternative`
8. No adequate evidence stays honest — `xjur-weak-evidence-stays-honest` and `xjur-no-sources-fails-closed-without-invention`
9. Different routes and conditional requirements — `xjur-consular-route-protected-abroad` plus the UK route-mixing case
10. Fees, deadlines and stale sources — the currency cases plus `xjur-stale-source-and-unsupported-deadline-warn`

The engine guard `xjur-engine-contains-no-country-specific-rules` asserts the core validation modules contain no country, domain, or currency-name hardcoding.

## Metric definitions

- **Citation coverage:** final source-supported steps / all steps in the deterministic evidence fixtures. It is a small fixture result, not an accuracy estimate for real tasks.
- **Unsupported-claim rate:** model-claimed supported steps rejected for lack of a valid citation / all model-claimed supported steps in those fixtures.
- **Conflict detection:** a conflict survives only with exact passages from at least two sources. A separate fabricated-conflict case must be rejected.
- **Missing information:** an unsupported step must become unverifiable while its unresolved question remains visible.
- **End-to-end completion:** an uploaded source traverses the real Express route, retrieval normalization, a mocked Nebius transport, schema parsing, and evidence gate. It does not test live model behavior.
- **Provider failure handling:** missing credentials, authentication failure, and invalid structured output must return typed errors rather than fabricated plans.

## Case ledger

| Case                                                    | Category         | Result | Latency (ms) |
| ------------------------------------------------------- | ---------------- | ------ | -----------: |
| valid-supported-and-inferred                            | evidence         | PASS   |          9.4 |
| fabricated-supported-quote                              | evidence         | PASS   |         0.52 |
| unknown-source-citation                                 | evidence         | PASS   |         0.22 |
| unsupported-date-removal                                | evidence         | PASS   |         0.39 |
| valid-two-source-conflict                               | evidence         | PASS   |          1.6 |
| fabricated-conflict-rejection                           | evidence         | PASS   |         0.72 |
| missing-information-remains-visible                     | evidence         | PASS   |         0.67 |
| official-contradiction-downgrades-fee                   | evidence         | PASS   |         2.16 |
| route-specific-requirement-cannot-mix-routes            | evidence         | PASS   |         1.41 |
| dependency-cycle-removal                                | evidence         | PASS   |         0.53 |
| xjur-nigeria-domestic-passport-ngn-and-routes           | universality     | PASS   |         1.27 |
| xjur-canada-study-permit-third-country-cad              | universality     | PASS   |         0.51 |
| xjur-france-business-registration-non-passport          | universality     | PASS   |         0.71 |
| xjur-consular-route-protected-abroad                    | universality     | PASS   |         0.82 |
| xjur-weak-evidence-stays-honest                         | universality     | PASS   |         0.43 |
| xjur-missing-jurisdiction-triggers-clarification        | universality     | PASS   |         0.71 |
| xjur-specified-request-needs-no-clarification           | universality     | PASS   |         0.26 |
| xjur-inaccessible-official-source-backfills-alternative | universality     | PASS   |         6.34 |
| xjur-no-sources-fails-closed-without-invention          | universality     | PASS   |         0.39 |
| xjur-engine-contains-no-country-specific-rules          | universality     | PASS   |        19.96 |
| xjur-stale-source-and-unsupported-deadline-warn         | universality     | PASS   |         0.42 |
| provider-missing-credential                             | provider-failure | PASS   |         0.39 |
| provider-authentication-failure                         | provider-failure | PASS   |         0.35 |
| provider-schema-failure                                 | provider-failure | PASS   |         6.84 |
| mocked-provider-full-api-workflow                       | workflow         | PASS   |        44.01 |

## Limitations

This is a deliberately small adversarial suite, not a representative benchmark. Exact-quote matching does not prove semantic entailment, source authority, freshness, or jurisdictional applicability. Live model latency, quality, Nebius availability, Tavily discovery, and production behavior require separate genuine runtime verification.
