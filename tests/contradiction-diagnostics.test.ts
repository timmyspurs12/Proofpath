// Adversarial regression suite for contradiction decision diagnostics.
// Uses only the CLEARLY LABELLED SYNTHETIC FIXTURES in
// tests/fixtures/contradiction-diagnostics.ts — no live calls, no real
// scraped pages. Every assertion names the precise machine-readable reason
// code behind the validator's decision.
import { describe, expect, it } from 'vitest';
import { citationIsValid, validateEvidencePlan } from '../server/lib/evidence';
import {
  findInstructionContradictions,
  routeContextFromInput,
  type ContradictionDiagnostic,
} from '../server/lib/claim-checks';
import {
  GENUINE_CONTRADICTION_INSTRUCTIONS,
  TRAP_INSTRUCTIONS,
  diagnosticFixtureReceipt,
  makeDiagnosticInput,
  makeDiagnosticModelPlan,
  makeDiagnosticSources,
  makePositiveControlSources,
} from './fixtures/contradiction-diagnostics';

const route = () => routeContextFromInput(makeDiagnosticInput());

function detect(instruction: string, sources = makeDiagnosticSources()) {
  const diagnostics: ContradictionDiagnostic[] = [];
  const contradictions = findInstructionContradictions({
    instruction,
    sources,
    citedSourceIds: sources.map((source) => source.source.id),
    route: route(),
    instructionId: 'probe-step',
    diagnostics,
  });
  return { contradictions, diagnostics };
}

describe('reported false positives: decisions and reason codes', () => {
  it('printed-photograph notice produces a clause-subject mismatch, not a contradiction', () => {
    const { contradictions, diagnostics } = detect(TRAP_INSTRUCTIONS.printedPhotoNotice);
    expect(contradictions).toEqual([]);
    const record = diagnostics.find((entry) => entry.sentence.includes('printed photographs'));
    expect(record).toBeTruthy();
    expect(record!.decision).toBe('not_contradiction');
    expect(record!.reasonCode).toBe('skipped-clause-subject-mismatch');
    expect(record!.subjectActionAligned).toBe(false);
    expect(record!.routeAligned).toBe(true);
    expect(record!.negationCues).toContain('not');
  });

  it('consular internet notice is skipped on location scope for a domestic request', () => {
    const { contradictions, diagnostics } = detect(TRAP_INSTRUCTIONS.consularInternet);
    expect(contradictions).toEqual([]);
    const record = diagnostics.find((entry) => entry.sentence.includes('internet access'));
    expect(record).toBeTruthy();
    expect(record!.decision).toBe('not_contradiction');
    expect(record!.reasonCode).toBe('skipped-scope-location');
    expect(record!.circumstanceAligned).toBe(true);
  });

  it('age rules phrased as noun subjects (no "if" lead) skip adult NIN and biometric steps', () => {
    for (const instruction of [
      TRAP_INSTRUCTIONS.ageRuleNounFormNin,
      TRAP_INSTRUCTIONS.ageRuleNounFormBiometrics,
    ]) {
      const { contradictions, diagnostics } = detect(instruction);
      expect(contradictions).toEqual([]);
      const record = diagnostics.find(
        (entry) =>
          entry.sentence.includes('under 16') || entry.sentence.startsWith('Minors cannot'),
      );
      expect(record).toBeTruthy();
      expect(record!.decision).toBe('not_contradiction');
      expect(record!.reasonCode).toBe('skipped-applicant-circumstance');
      expect(record!.circumstanceAligned).toBe(false);
    }
  });

  it('foreign-mission cutoff is skipped on location scope', () => {
    const { contradictions, diagnostics } = detect(TRAP_INSTRUCTIONS.foreignMissionCutoff);
    expect(contradictions).toEqual([]);
    const record = diagnostics.find((entry) => entry.sentence.includes('New York consulate'));
    expect(record).toBeTruthy();
    expect(record!.decision).toBe('not_contradiction');
    expect(record!.reasonCode).toBe('skipped-scope-location');
  });

  it('a shared verb with a different object ("book travel" vs "book an appointment") is not a contradiction', () => {
    const { contradictions, diagnostics } = detect(TRAP_INSTRUCTIONS.sharedVerbDifferentObject);
    expect(contradictions).toEqual([]);
    const record = diagnostics.find((entry) => entry.sentence.includes('book travel'));
    expect(record).toBeTruthy();
    expect(record!.decision).toBe('not_contradiction');
    expect(record!.reasonCode).toBe('skipped-clause-subject-mismatch');
    expect(record!.alignedTerms).not.toContain('travel');
    expect(record!.subjectActionAligned).toBe(false);
  });

  it('an unrelated guarantor notice cannot invalidate a document-upload step', () => {
    const { contradictions, diagnostics } = detect(TRAP_INSTRUCTIONS.guarantorNotice);
    expect(contradictions).toEqual([]);
    expect(diagnostics.every((entry) => entry.decision === 'not_contradiction')).toBe(true);
  });
});

describe('positive controls: genuine same-context contradictions still downgrade', () => {
  const sources = [...makeDiagnosticSources(), ...makePositiveControlSources()];

  it('catches a same-route prohibition against posting printed photos', () => {
    const { contradictions, diagnostics } = detect(
      GENUINE_CONTRADICTION_INSTRUCTIONS.postPhotos,
      sources,
    );
    expect(contradictions.map((entry) => entry.kind)).toContain('negated-requirement');
    const decisive = diagnostics.find((entry) => entry.decision === 'contradiction');
    expect(decisive).toBeTruthy();
    expect(decisive!.reasonCode).toBe('negated-requirement');
    expect(decisive!.subjectActionAligned).toBe(true);
    expect(decisive!.clause).toContain('post printed photos');
  });

  it('catches a genuine online-route prohibition for biometric capture', () => {
    const { contradictions } = detect(
      GENUINE_CONTRADICTION_INSTRUCTIONS.fullyOnlineBiometrics,
      sources,
    );
    expect(contradictions.map((entry) => entry.kind)).toContain('negated-requirement');
  });

  it('catches a cash-payment prohibition on the same fee and route', () => {
    const { contradictions, diagnostics } = detect(
      GENUINE_CONTRADICTION_INSTRUCTIONS.cashFee,
      sources,
    );
    expect(contradictions.map((entry) => entry.kind)).toContain('negated-requirement');
    expect(
      diagnostics.some(
        (entry) => entry.decision === 'contradiction' && entry.clause?.includes('cash'),
      ),
    ).toBe(true);
  });

  it('catches a channel-only prohibition (applications cannot be completed by post)', () => {
    const { contradictions, diagnostics } = detect(
      GENUINE_CONTRADICTION_INSTRUCTIONS.byPost,
      sources,
    );
    expect(contradictions.map((entry) => entry.kind)).toContain('negated-requirement');
    const decisive = diagnostics.find((entry) => entry.decision === 'contradiction');
    expect(decisive!.alignedTerms).toContain('post');
  });

  it('catches a paper-route conditional requirement inside an online workflow', () => {
    const { contradictions, diagnostics } = detect(
      GENUINE_CONTRADICTION_INSTRUCTIONS.paperFormPhotos,
      sources,
    );
    expect(contradictions.map((entry) => entry.kind)).toContain('conditional-route');
    expect(
      diagnostics.some(
        (entry) => entry.reasonCode === 'conditional-route' && entry.decision === 'contradiction',
      ),
    ).toBe(true);
  });

  it('catches the in-scope under-18 prohibition when the instruction names that circumstance', () => {
    const { contradictions, diagnostics } = detect(
      GENUINE_CONTRADICTION_INSTRUCTIONS.underEighteenVerification,
      sources,
    );
    expect(contradictions.map((entry) => entry.kind)).toContain('negated-requirement');
    const ageRecord = diagnostics.find((entry) => entry.sentence.includes('under 18'));
    expect(ageRecord!.circumstanceAligned).toBe(true);
  });

  it('downgrades a step that claims bank charges are included when evidence says they are additional', () => {
    const { contradictions } = detect(
      'Pay NGN 100,000 including bank charges for the domestic 32-page 5-year renewal.',
      makeDiagnosticSources(),
    );
    expect(contradictions.map((entry) => entry.kind)).toContain('fee-context-mismatch');
  });
});

describe('diagnostic record contract', () => {
  it('records stable step id, source id, exact passage, context and deterministic fields', () => {
    const diagnostics: ContradictionDiagnostic[] = [];
    findInstructionContradictions({
      instruction: TRAP_INSTRUCTIONS.consularInternet,
      sources: makeDiagnosticSources(),
      citedSourceIds: ['S2'],
      route: route(),
      instructionId: 'step-nin',
      diagnostics,
    });
    const record = diagnostics[0];
    expect(record.instructionId).toBe('step-nin');
    expect(['S1', 'S2']).toContain(record.sourceId);
    expect(record.sentence.length).toBeGreaterThan(8);
    expect(record.requestedRoute).toEqual(route());
    expect(['contradiction', 'not_contradiction']).toContain(record.decision);
    expect(typeof record.reasonCode).toBe('string');
    expect(record.negationCues.every((cue) => typeof cue === 'string')).toBe(true);
    // No credential-bearing or envelope fields are present on the record.
    expect(JSON.stringify(record)).not.toMatch(/api[_-]?key|authorization|bearer/i);
  });

  it('is deterministic for the same input', () => {
    const first = detect(TRAP_INSTRUCTIONS.sharedVerbDifferentObject).diagnostics;
    const second = detect(TRAP_INSTRUCTIONS.sharedVerbDifferentObject).diagnostics;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('omits diagnostics entirely when the caller does not request the sink', () => {
    const result = findInstructionContradictions({
      instruction: TRAP_INSTRUCTIONS.guarantorNotice,
      sources: makeDiagnosticSources(),
      citedSourceIds: ['S1'],
      route: route(),
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('end-to-end evidence plan with diagnostics', () => {
  function validate(includeDiagnostics = true) {
    return validateEvidencePlan({
      modelPlan: makeDiagnosticModelPlan(),
      sources: [...makeDiagnosticSources(), ...makePositiveControlSources()],
      input: makeDiagnosticInput(),
      runtime: diagnosticFixtureReceipt,
      id: 'contradiction-diagnostics-fixture',
      includeDiagnostics,
    });
  }

  it('keeps all six exactly-evidenced domestic steps supported despite every trap passage', () => {
    const { plan, metrics, diagnostics } = validate();
    const supported = plan.steps.filter((step) => step.status === 'supported');
    expect(supported.map((step) => step.title)).toEqual([
      'Access the official portal',
      'Verify your national identity number',
      'Upload supporting documents',
      'Pay the domestic renewal fee',
      'Submit the application online',
      'Attend biometric capture in person',
    ]);
    for (const step of supported) {
      for (const citation of step.evidence) {
        expect(
          citationIsValid(citation, [...makeDiagnosticSources(), ...makePositiveControlSources()]),
        ).toBe(true);
      }
    }
    expect(metrics.contradictedClaimCount).toBe(1);
    // Diagnostics are keyed to the model's stable step ids.
    const stepIds = new Set(diagnostics.map((entry) => entry.instructionId));
    expect(stepIds.has('biometrics')).toBe(true);
  });

  it('still downgrades the genuinely contradicted post-photos step with a decisive record', () => {
    const { plan, diagnostics } = validate();
    const postPhotos = plan.steps.find((step) => step.title === 'Post printed photos')!;
    expect(postPhotos.status).toBe('unverifiable');
    expect(postPhotos.notes.join(' ')).toContain('negates a requirement');
    const decisive = diagnostics.filter(
      (entry) => entry.instructionId === 'post-photos' && entry.decision === 'contradiction',
    );
    expect(decisive.length).toBeGreaterThan(0);
    expect(decisive[0].reasonCode).toBe('negated-requirement');
  });

  it('strips the fabricated courier citation without promoting the step, and keeps open questions', () => {
    const { plan, metrics } = validate();
    const courier = plan.steps.find((step) => step.title === 'Request courier delivery')!;
    expect(courier.status).toBe('unverifiable');
    expect(courier.evidence).toHaveLength(0);
    expect(courier.notes.join(' ')).toContain('exact-passage validation');
    expect(metrics.invalidCitationCount).toBe(1);
    expect(plan.unresolvedQuestions.map((question) => question.id)).toEqual([
      'processing-time',
      'courier-availability',
    ]);
    expect(plan.sources.map((source) => source.id)).toEqual(['S1', 'S2', 'P1']);
  });

  it('returns no diagnostics unless explicitly requested', () => {
    const result = validate(false);
    expect(result.diagnostics).toEqual([]);
  });
});
