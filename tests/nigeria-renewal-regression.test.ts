import { describe, expect, it, vi } from 'vitest';
import { citationIsValid, validateEvidencePlan } from '../server/lib/evidence';
import { findInstructionContradictions, routeContextFromInput } from '../server/lib/claim-checks';
import { rankCandidates, retrieveSources } from '../server/lib/retrieval';
import type { ModelPlan } from '../server/lib/evidence';
import type { TavilyClient } from '../server/lib/tavily';
import {
  OTTAWA_MISSION_TEXT,
  OTTAWA_MISSION_URL,
  makeNigeriaRegressionInput,
  makeNigeriaRegressionModelPlan,
  makeNigeriaRegressionSources,
  nigeriaRegressionReceipt,
} from './fixtures/nigeria-renewal-regression';

// Regression suite for the domestic Nigerian passport-renewal evidence gate.
// Everything runs on frozen 2026-10-24 verbatim NIS excerpts (S1-S4) plus one
// clearly labelled synthetic foreign-mission source (S5); no network calls.
// The generic engine contains no Nigeria-specific knowledge.
describe('Nigeria renewal regression: retrieval, citation, classification, questions', () => {
  function validate() {
    const sources = makeNigeriaRegressionSources();
    const input = makeNigeriaRegressionInput();
    return {
      sources,
      input,
      ...validateEvidencePlan({
        modelPlan: makeNigeriaRegressionModelPlan(),
        sources,
        input,
        runtime: nigeriaRegressionReceipt,
        id: 'nigeria-renewal-regression',
        includeDiagnostics: true,
      }),
    };
  }

  // 1. All eight domestic steps validate as Supported with verbatim citations.
  it('supports the complete eight-step domestic renewal path in order', () => {
    const { plan } = validate();
    const supported = plan.steps.filter((step) => step.status === 'supported');
    expect(supported.map((step) => step.id)).toEqual([
      'step-1',
      'step-2',
      'step-3',
      'step-4',
      'step-5',
      'step-6',
      'step-7',
      'step-8',
    ]);
    const expectedSubjects = [
      'Renewal/Reissue',
      'NIN',
      'booklet',
      'supporting documents',
      'submit',
      'fee',
      'biometric',
      'track',
    ];
    expectedSubjects.forEach((subject, index) => {
      expect(`${supported[index].title} ${supported[index].instruction}`).toContain(subject);
    });
    // The first step never asserts an affirmative account-creation requirement.
    expect(supported[0].instruction).not.toMatch(
      /register a new portal account|wait for (?:manual )?account approval/i,
    );
  });

  // 2. Every supported citation is an exact passage of a retrieved source.
  it('keeps every citation on supported steps exactly verifiable', () => {
    const { plan, sources } = validate();
    for (const step of plan.steps.filter((candidate) => candidate.status === 'supported')) {
      expect(step.evidence.length).toBeGreaterThan(0);
      for (const citation of step.evidence) {
        expect(citationIsValid(citation, sources)).toBe(true);
      }
    }
  });

  // 3. Fee accuracy: N100,000 standard 32-page 5-year renewal, charges excluded.
  it('pins the N100,000 standard 32-page 5-year fee with bank charges excluded', () => {
    const { plan } = validate();
    const feeStep = plan.steps.find((step) => step.id === 'step-6')!;
    expect(feeStep.status).toBe('supported');
    expect(feeStep.instruction).toContain('N100,000');
    expect(feeStep.instruction).toMatch(/excludes bank charges/i);
    const exclusive = feeStep.evidence.find((citation) =>
      citation.quote.includes('All Prices are Exclusive of Bank Charges'),
    );
    expect(exclusive).toBeTruthy();
  });

  // 4. Timeline accuracy: 21 days presented as a published service timeline,
  //    not a guarantee.
  it('presents the 21-day reissue figure as a published service timeline, not a guarantee', () => {
    const { plan } = validate();
    const trackingStep = plan.steps.find((step) => step.id === 'step-8')!;
    expect(trackingStep.status).toBe('supported');
    expect(trackingStep.instruction).toContain('21 days');
    expect(trackingStep.instruction).toMatch(/published .*service timeline/i);
    expect(trackingStep.instruction).toMatch(/rather than a guaranteed/i);
    const slaQuote = trackingStep.evidence.find((citation) =>
      citation.quote.includes('Re-issue: 21 days after Successful Enrolment'),
    );
    expect(slaQuote).toBeTruthy();
  });

  // 5. Fabricated account-creation requirement: blocked as invalid citation,
  //    never as contradicted, with full rejected-citation provenance.
  it('blocks the fabricated account-creation requirement as invalid-citation, not contradicted', () => {
    const { plan } = validate();
    const trap = plan.steps.find((step) => step.id === 'step-9')!;
    expect(trap.status).toBe('unverifiable');
    expect(trap.evidenceOutcome).toBe('invalid-citation');
    expect(trap.evidence).toHaveLength(0);
    expect(trap.rejectedCitations).toHaveLength(2);
    const reasons = (trap.rejectedCitations ?? []).map((entry) => entry.reason).sort();
    expect(reasons).toEqual(['passage-not-found', 'source-not-retrieved']);
    // The model's exact claimed quotes are retained for diagnosis.
    expect(trap.rejectedCitations!.map((entry) => entry.quote).join(' ')).toContain(
      'separate user account',
    );
  });

  // 6. Fabricated courier/collection requirement is blocked the same way.
  it('blocks the unevidenced courier-collection claim with retained provenance', () => {
    const { plan } = validate();
    const trap = plan.steps.find((step) => step.id === 'step-10')!;
    expect(trap.status).toBe('unverifiable');
    expect(trap.evidenceOutcome).toBe('invalid-citation');
    expect(trap.rejectedCitations?.[0]?.reason).toBe('passage-not-found');
  });

  // 7. Included-bank-charges claim: blocked by the document-level pricing
  //    policy, classified as unable to verify (scope/policy mismatch), not an
  //    explicit contradiction.
  it('downgrades the included-bank-charges claim without calling it a contradiction', () => {
    const { plan, diagnostics } = validate();
    const trap = plan.steps.find((step) => step.id === 'step-11')!;
    expect(trap.status).toBe('unverifiable');
    expect(trap.evidenceOutcome).toBe('unverifiable');
    expect(trap.notes.join(' ')).toContain('exclude bank charges');
    expect(
      diagnostics.some(
        (entry) =>
          entry.instructionId === 'bank-charges-included-trap' &&
          entry.reasonCode === 'fee-context-mismatch',
      ),
    ).toBe(true);
  });

  // 8. Foreign-mission (Ottawa/CAD) material never supports or explicitly
  //    contradicts a domestic step, and a route mismatch is not a contradiction.
  it('keeps the Ottawa CAD fee out of domestic evidence and out of explicit contradictions', () => {
    const { plan, sources, input } = validate();
    const trap = plan.steps.find((step) => step.id === 'step-12')!;
    expect(trap.status).toBe('unverifiable');
    expect(trap.evidenceOutcome).toBe('unverifiable');
    // The verbatim foreign citation stays attached as provenance, but no
    // supported domestic step may rely on the foreign-mission source; in the
    // live pipeline retrieval scope filtering keeps such a source out of the
    // domestic packet altogether (see the retrieval tests below).
    for (const step of plan.steps.filter((candidate) => candidate.status === 'supported')) {
      expect(step.evidence.map((citation) => citation.sourceId)).not.toContain('S5');
    }
    // A different-location passage never yields an explicit contradiction kind.
    const findings = findInstructionContradictions({
      instruction:
        'Pay the published domestic standard 32-page 5-year renewal service fee of N100,000 through the portal.',
      sources,
      citedSourceIds: ['S3', 'S4'],
      route: routeContextFromInput(input),
      instructionId: 'domestic-fee-scope-check',
    });
    expect(findings.map((finding) => finding.kind)).not.toContain('currency-mismatch');
    expect(findings.map((finding) => finding.kind)).not.toContain('negated-requirement');
  });

  // 9. A genuine explicit conflict still produces the contradicted outcome.
  it('reserves the contradicted outcome for an explicit official amount conflict', () => {
    const sources = makeNigeriaRegressionSources();
    const modelPlan: ModelPlan = {
      title: 'Explicit conflict probe',
      steps: [
        {
          id: 'wrong-fee',
          title: 'Pay a fee no official source publishes',
          instruction:
            'Pay NGN 250,000 for the domestic 32-page 5-year renewal through the portal.',
          completionCriteria: 'The (incorrect) fee is paid.',
          claimedStatus: 'supported',
          evidence: [{ sourceId: 'S4', quote: '32 Pages 5- Years Validity is N100,000/$150' }],
          dueDate: null,
          dependsOn: [],
        },
      ],
      conflicts: [],
      unresolvedQuestions: [],
    };
    const { plan, diagnostics } = validateEvidencePlan({
      modelPlan,
      sources,
      input: makeNigeriaRegressionInput(),
      runtime: nigeriaRegressionReceipt,
      id: 'nigeria-explicit-conflict',
      includeDiagnostics: true,
    });
    expect(plan.steps[0].status).toBe('unverifiable');
    expect(plan.steps[0].evidenceOutcome).toBe('contradicted');
    expect(diagnostics.some((entry) => entry.reasonCode === 'currency-mismatch')).toBe(true);
  });

  // 10. Four outcomes are distinguishable and reported in metrics.
  it('reports four distinct evidence outcomes in one validation', () => {
    const { metrics } = validate();
    expect(metrics.outcomeCounts.supported).toBe(8);
    expect(metrics.outcomeCounts['invalid-citation']).toBe(2);
    expect(metrics.outcomeCounts.unverifiable).toBeGreaterThanOrEqual(2);
    // The contradicted bucket exists distinctly; explicit conflicts are
    // covered by the dedicated probe above.
    expect(metrics.outcomeCounts).toHaveProperty('contradicted');
  });

  // 11. Ottawa unresolved question removed; genuine authority gaps retained.
  it('removes the out-of-route Ottawa question but keeps real open questions', () => {
    const { plan, metrics } = validate();
    const ids = plan.unresolvedQuestions.map((question) => question.id);
    expect(ids).toEqual(['bank-charge-amount', 'centre-availability']);
    expect(metrics.removedOutOfRouteQuestions).toBe(1);
    expect(
      plan.warnings.some((warning) => warning.includes('overseas/consular application route')),
    ).toBe(true);
  });

  // 12. Question filtering is symmetric for an overseas request.
  it('filters domestic-scoped questions out of an overseas route and keeps the consular one', () => {
    const abroadInput = makeNigeriaRegressionInput({
      task: 'Renew my Nigerian passport from abroad through an overseas embassy mission.',
      details: 'Consular route while living outside the country.',
    });
    expect(routeContextFromInput(abroadInput).abroad).toBe(true);
    const modelPlan = makeNigeriaRegressionModelPlan();
    modelPlan.unresolvedQuestions = [
      ...modelPlan.unresolvedQuestions,
      {
        id: 'domestic-office-question',
        question:
          'Which domestic immigration office inside the country handles an in-country renewal?',
        reason: 'The applicant needs the home-country office for the domestic route.',
      },
    ];
    const { plan } = validateEvidencePlan({
      modelPlan,
      sources: makeNigeriaRegressionSources(),
      input: abroadInput,
      runtime: nigeriaRegressionReceipt,
      id: 'nigeria-abroad-symmetry',
    });
    const ids = plan.unresolvedQuestions.map((question) => question.id);
    expect(ids).toContain('ottawa-mission-question');
    expect(ids).not.toContain('domestic-office-question');
  });

  // 13. Full provenance for supported claims.
  it('resolves every accepted citation to URL, title, timestamp, hash and passage', () => {
    const { plan, sources } = validate();
    for (const step of plan.steps.filter((candidate) => candidate.status === 'supported')) {
      for (const citation of step.evidence) {
        const record = sources.find((entry) => entry.source.id === citation.sourceId)!;
        expect(record.source.url).toMatch(/^https:\/\//);
        expect(record.source.title.trim().length).toBeGreaterThan(0);
        expect(new Date(record.source.retrievedAt).toString()).not.toBe('Invalid Date');
        expect(record.source.contentHash).toMatch(/^[a-f0-9]{64}$/);
        expect(citationIsValid(citation, sources)).toBe(true);
      }
    }
  });

  // 14. Intake answers and case state survive validation unchanged.
  it('leaves the intake request, answers and case state intact', () => {
    const input = makeNigeriaRegressionInput();
    const snapshot = structuredClone(input);
    const { plan } = validateEvidencePlan({
      modelPlan: makeNigeriaRegressionModelPlan(),
      sources: makeNigeriaRegressionSources(),
      input,
      runtime: nigeriaRegressionReceipt,
      id: 'nigeria-intake-intact',
    });
    expect(input).toEqual(snapshot);
    expect(plan.goal).toBe(input.goal);
    expect(plan.jurisdiction).toBe(input.jurisdiction);
    expect(plan.category).toBe(input.category);
  });

  // 15. Ranking sinks a discovered foreign-mission candidate for a domestic
  //     route but never penalizes an explicit direct URL.
  it('down-ranks discovered foreign-mission candidates while sparing direct URLs', () => {
    const domestic = rankCandidates(
      [
        {
          url: 'https://domestic-example.org.ng/renewal',
          title: 'Renew a passport',
          discovery: 'tavily',
        },
        {
          url: OTTAWA_MISSION_URL,
          title: 'Diaspora renewal at the Ottawa embassy',
          discovery: 'tavily',
        },
      ],
      { goal: 'renew passport domestically', searchQueries: [], jurisdiction: 'Nigeria' },
      { abroad: false },
    ).map((candidate) => candidate.url);
    expect(domestic[0]).toContain('domestic-example');
    // The same overseas URL as an explicit direct candidate keeps its bonus.
    const withDirect = rankCandidates(
      [
        {
          url: 'https://domestic-example.org.ng/renewal',
          title: 'Renew a passport',
          discovery: 'tavily',
        },
        { url: OTTAWA_MISSION_URL, title: 'Ottawa consular services', discovery: 'direct' },
      ],
      { goal: 'renew passport domestically', searchQueries: [], jurisdiction: 'Nigeria' },
      { abroad: false },
    ).map((candidate) => candidate.url);
    expect(withDirect[0]).toBe(OTTAWA_MISSION_URL);
    // Without route context the penalty is not applied (backward compatible).
    const noRoute = rankCandidates(
      [
        { url: OTTAWA_MISSION_URL, title: 'Embassy consular renewal', discovery: 'tavily' },
        { url: 'https://domestic-example.org.ng/renewal', title: 'Renewal', discovery: 'tavily' },
      ],
      { goal: '', searchQueries: [], jurisdiction: '' },
    ).map((candidate) => candidate.url);
    expect(noRoute[0]).toBe(OTTAWA_MISSION_URL);
  });

  // 16. End-to-end retrieval excludes a fetched foreign-mission discovery from
  //     a domestic packet, recording the reason in the ledger.
  it('excludes a fetched overseas-discovered source from the domestic retrieval packet', async () => {
    // Public IP-style hosts are used so the SSRF/DNS guard cannot short-circuit
    // before the scope gate runs; scope is decided from the fetched text.
    const discoveredOttawaUrl = 'https://9.9.9.9/consular/diaspora-passport-ottawa';
    const directDomesticUrl = 'https://8.8.8.8/official/domestic-renewal';
    const fetchMock = vi.fn(async (url: string) => {
      const target = String(url);
      const body = target.includes('9.9.9.9')
        ? OTTAWA_MISSION_TEXT
        : 'Official domestic renewal guidance with enough words to pass the minimum source length check for an immigration office application online.';
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const tavily = {
      configured: true,
      discover: vi.fn(async () => ({
        urls: [discoveredOttawaUrl],
        requestIds: ['req-ottawa'],
        calls: 1,
      })),
    };
    const result = await retrieveSources({
      directUrls: [directDomesticUrl],
      searchQueries: ['renew passport domestically'],
      goal: 'Complete a domestic passport renewal',
      jurisdiction: 'Nigeria',
      document: null,
      tavily: tavily as unknown as TavilyClient,
      route: { abroad: false },
    });
    expect(result.sources.map((entry) => entry.source.url)).not.toContain(discoveredOttawaUrl);
    expect(result.sources.map((entry) => entry.source.url)).toContain(directDomesticUrl);
    expect(result.sources).toHaveLength(1);
    expect(result.ledger.excluded.some((entry) => entry.reason.includes('overseas/consular'))).toBe(
      true,
    );
    expect(result.warnings.join(' ')).toMatch(/9\.9\.9\.9/);

    // Symmetry: an abroad route keeps the mission source and rejects a
    // discovered domestic-scoped page instead.
    const domesticDiscovery = 'https://7.7.7.7/in-country/domestic-renewal';
    const fetchMockAbroad = vi.fn(async (url: string) => {
      const target = String(url);
      const body = target.includes('9.9.9.9')
        ? OTTAWA_MISSION_TEXT
        : 'Domestic in-country renewal guidance for applicants inside the country, with enough words to pass the minimum source length check.';
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    });
    globalThis.fetch = fetchMockAbroad as typeof fetch;
    const tavilyAbroad = {
      configured: true,
      discover: vi.fn(async () => ({
        urls: [discoveredOttawaUrl, domesticDiscovery],
        requestIds: ['req-abroad'],
        calls: 1,
      })),
    };
    const abroadResult = await retrieveSources({
      directUrls: [],
      searchQueries: ['consular passport renewal'],
      goal: 'Complete a consular passport renewal',
      jurisdiction: 'Nigeria',
      document: null,
      tavily: tavilyAbroad as unknown as TavilyClient,
      route: { abroad: true },
    });
    const abroadUrls = abroadResult.sources.map((entry) => entry.source.url);
    expect(abroadUrls).toContain(discoveredOttawaUrl);
    expect(abroadUrls).not.toContain(domesticDiscovery);
  });
});
