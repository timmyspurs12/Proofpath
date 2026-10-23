import { describe, expect, it } from 'vitest';
import {
  citationIsValid,
  ModelPlanSchema,
  normalizeQuote,
  validateEvidencePlan,
} from '../server/lib/evidence';
import { clone, fixtureRuntime, makeInput, makeModelPlan, makeSource } from './fixtures';

const fixedNow = () => new Date('2026-10-23T12:00:00.000Z');

function validate(
  modelPlan = makeModelPlan(),
  sources = [
    makeSource(
      'S1',
      'Applicants must renew online. The fee is £102.\nApply before 1 November 2026.',
    ),
  ],
) {
  return validateEvidencePlan({
    modelPlan,
    sources,
    input: makeInput(),
    runtime: fixtureRuntime,
    now: fixedNow,
    id: 'fixture-plan',
  });
}

describe('exact passage validation', () => {
  it('accepts contiguous passages with normalized whitespace and punctuation', () => {
    const source = makeSource('S1', 'Use the “online” route.\n\nThe fee is £102.');
    expect(
      citationIsValid({ sourceId: 'S1', quote: '  Use the "online" route.  ' }, [source]),
    ).toBe(true);
    expect(normalizeQuote('a—b')).toBe('a-b');
  });

  it('rejects stitched or non-adjacent fragments and unknown source IDs', () => {
    const source = makeSource('S1', 'Alpha requirement. A separate sentence. Omega requirement.');
    expect(
      citationIsValid({ sourceId: 'S1', quote: 'Alpha requirement. Omega requirement.' }, [source]),
    ).toBe(false);
    expect(citationIsValid({ sourceId: 'S9', quote: 'Alpha requirement.' }, [source])).toBe(false);
  });

  it('preserves a genuinely supported step and an explicitly inferred step', () => {
    const { plan, metrics } = validate();
    expect(plan.steps[0].status).toBe('supported');
    expect(plan.steps[0].evidence).toHaveLength(1);
    expect(plan.steps[1].status).toBe('inferred');
    expect(metrics.validatedSupportedClaims).toBe(1);
    expect(metrics.invalidCitationCount).toBe(0);
  });

  it('downgrades invented supported claims, strips citations and removes dates', () => {
    const model = makeModelPlan();
    model.steps[0].evidence = [{ sourceId: 'S1', quote: 'The fee is only £1.' }];
    model.steps[0].dueDate = '1 November 2026';
    const { plan, metrics } = validate(model);
    expect(plan.steps[0].status).toBe('unverifiable');
    expect(plan.steps[0].evidence).toEqual([]);
    expect(plan.steps[0].dueDate).toBeNull();
    expect(plan.steps[0].notes.join(' ')).toContain('Support was removed');
    expect(metrics.unsupportedClaimRate).toBe(1);
    expect(metrics.invalidCitationCount).toBe(1);
  });

  it('removes a date when the validated passage does not contain that date', () => {
    const model = makeModelPlan();
    model.steps[0].dueDate = '2 November 2026';
    const { plan } = validate(model);
    expect(plan.steps[0].status).toBe('supported');
    expect(plan.steps[0].dueDate).toBeNull();
    expect(plan.steps[0].notes.join(' ')).toContain('date was removed');
  });

  it('retains a date only when it appears in a validated cited passage', () => {
    const model = makeModelPlan();
    model.steps[0].evidence = [{ sourceId: 'S1', quote: 'Apply before 1 November 2026.' }];
    model.steps[0].dueDate = '1 November 2026';
    const { plan } = validate(model);
    expect(plan.steps[0].dueDate).toBe('1 November 2026');
  });
});

describe('conflict validation', () => {
  it('keeps a model conflict only with valid passages from two sources', () => {
    const model = makeModelPlan();
    model.conflicts = [
      {
        topic: 'Fee amount',
        detail: 'The sources state different fixture fees.',
        stepIds: ['a'],
        evidence: [
          { sourceId: 'S1', quote: 'The fee is £102.' },
          { sourceId: 'S2', quote: 'The fee is £115.' },
        ],
      },
    ];
    const sources = [makeSource('S1', 'The fee is £102.'), makeSource('S2', 'The fee is £115.')];
    const { plan, metrics } = validate(model, sources);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.steps[0].status).toBe('conflicting');
    expect(plan.conflicts[0].evidence).toHaveLength(2);
    expect(metrics.validatedConflicts).toBe(1);
  });

  it('rejects a one-source or fabricated conflict instead of presenting certainty', () => {
    const model = makeModelPlan();
    model.conflicts = [
      {
        topic: 'Invented conflict',
        detail: 'This conflict does not have two valid sources.',
        stepIds: ['a'],
        evidence: [
          { sourceId: 'S1', quote: 'The fee is £102.' },
          { sourceId: 'S2', quote: 'The fee is £1.' },
        ],
      },
    ];
    const { plan, metrics } = validate(model);
    expect(plan.conflicts).toEqual([]);
    expect(plan.steps[0].status).toBe('supported');
    expect(metrics.rejectedConflicts).toBe(1);
    expect(plan.warnings.join(' ')).toContain('hidden');
  });
});

describe('dependency and schema safety', () => {
  it('topologically orders steps and removes unknown or self dependencies', () => {
    const model = makeModelPlan();
    model.steps[0].dependsOn = ['b', 'missing', 'a'];
    model.steps[1].dependsOn = [];
    const { plan } = validate(model);
    expect(plan.steps.map((step) => step.id)).toEqual(['step-2', 'step-1']);
    expect(plan.steps[1].dependsOn).toEqual(['step-2']);
    expect(plan.steps[1].notes.join(' ')).toContain('dependencies were removed');
  });

  it('removes dependency cycles and keeps a valid bounded plan', () => {
    const model = makeModelPlan();
    model.steps[0].dependsOn = ['b'];
    model.steps[1].dependsOn = ['a'];
    const { plan } = validate(model);
    expect(plan.steps.every((step) => step.dependsOn.length === 0)).toBe(true);
    expect(plan.steps.every((step) => step.notes.length <= 5)).toBe(true);
    expect(plan.warnings.join(' ')).toContain('Cyclic');
  });

  it('rejects extra model fields and duplicate step IDs before validation', () => {
    const model = makeModelPlan();
    expect(ModelPlanSchema.safeParse({ ...model, unexpected: true }).success).toBe(false);
    model.steps[1].id = model.steps[0].id;
    expect(ModelPlanSchema.safeParse(model).success).toBe(false);
  });

  it('uses the supplied runtime receipt without turning fixtures into a sample', () => {
    const { plan } = validate(clone(makeModelPlan()));
    expect(plan.runtime.responseId).toBe('fixture-response-not-a-live-call');
    expect(plan.runtime.mode).toBe('live');
  });
});
