import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  EvidenceCitationSchema,
  EvidenceStatusSchema,
  PlanSchema,
  QuestionSchema,
  type Plan,
  type PlanRequest,
  type PlanStep,
  type RuntimeReceipt,
} from '../../src/shared/schemas';
import type { RetrievedSource } from './retrieval';

const ModelStepSchema = z
  .object({
    id: z.string().min(1).max(100),
    title: z.string().trim().min(2).max(240),
    instruction: z.string().trim().min(3).max(1_500),
    completionCriteria: z.string().trim().min(3).max(700),
    claimedStatus: EvidenceStatusSchema,
    evidence: z.array(EvidenceCitationSchema).max(4),
    dueDate: z.string().trim().max(100).nullable(),
    dependsOn: z.array(z.string().min(1).max(100)).max(12),
  })
  .strict();

const ModelConflictSchema = z
  .object({
    topic: z.string().trim().min(2).max(240),
    detail: z.string().trim().min(3).max(1_200),
    stepIds: z.array(z.string().min(1).max(100)).min(1).max(20),
    evidence: z.array(EvidenceCitationSchema).min(2).max(6),
  })
  .strict();

export const ModelPlanSchema = z
  .object({
    title: z.string().trim().min(3).max(240),
    steps: z.array(ModelStepSchema).min(1).max(20),
    conflicts: z.array(ModelConflictSchema).max(10),
    unresolvedQuestions: z.array(QuestionSchema).max(10),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.steps.map((step) => step.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: 'Step IDs must be unique', path: ['steps'] });
    }
  });

export type ModelPlan = z.infer<typeof ModelPlanSchema>;

export function normalizeQuote(value: string) {
  return value
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function citationIsValid(
  citation: { sourceId: string; quote: string },
  sources: RetrievedSource[],
) {
  const source = sources.find((entry) => entry.source.id === citation.sourceId);
  if (!source) return false;
  return normalizeQuote(source.text).includes(normalizeQuote(citation.quote));
}

function hasCycle(steps: PlanStep[]) {
  const graph = new Map(steps.map((step) => [step.id, step.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return steps.some((step) => visit(step.id));
}

function stableTopologicalSort(steps: PlanStep[]) {
  const ordered: PlanStep[] = [];
  const remaining = [...steps];
  const placed = new Set<string>();
  while (remaining.length) {
    const index = remaining.findIndex((step) => step.dependsOn.every((id) => placed.has(id)));
    if (index < 0) return steps;
    const [next] = remaining.splice(index, 1);
    ordered.push(next);
    placed.add(next.id);
  }
  return ordered;
}

interface ValidationOptions {
  modelPlan: ModelPlan;
  sources: RetrievedSource[];
  input: PlanRequest;
  runtime: RuntimeReceipt;
  initialWarnings?: string[];
  now?: () => Date;
  id?: string;
}

export interface EvidenceMetrics {
  stepCount: number;
  modelSupportedClaims: number;
  validatedSupportedClaims: number;
  unsupportedModelClaims: number;
  invalidCitationCount: number;
  citationCoverage: number;
  unsupportedClaimRate: number;
  validatedConflicts: number;
  rejectedConflicts: number;
}

export function validateEvidencePlan(options: ValidationOptions) {
  const warnings = [...(options.initialWarnings ?? [])];
  const idMap = new Map(
    options.modelPlan.steps.map((step, index) => [step.id, `step-${index + 1}`]),
  );
  let invalidCitationCount = 0;
  let unsupportedModelClaims = 0;
  let modelSupportedClaims = 0;

  const steps: PlanStep[] = options.modelPlan.steps.map((step, index) => {
    const validEvidence = step.evidence.filter((citation) => {
      const valid = citationIsValid(citation, options.sources);
      if (!valid) invalidCitationCount += 1;
      return valid;
    });
    const notes: string[] = [];
    if (validEvidence.length < step.evidence.length) {
      notes.push('One or more model citations failed exact-passage validation and were removed.');
    }
    if (step.claimedStatus === 'supported') {
      modelSupportedClaims += 1;
      if (!validEvidence.length) unsupportedModelClaims += 1;
    }
    let status = step.claimedStatus;
    if (status === 'supported' && !validEvidence.length) {
      status = 'unverifiable';
      notes.push('Support was removed because no cited passage exists in a retrieved source.');
    }
    if (status === 'conflicting') {
      status = 'unverifiable';
      notes.push(
        'A conflict must be validated against at least two cited sources before it is shown as conflicting.',
      );
    }
    const verifiedDueDate =
      step.dueDate &&
      validEvidence.some((citation) =>
        normalizeQuote(citation.quote)
          .toLowerCase()
          .includes(normalizeQuote(step.dueDate!).toLowerCase()),
      )
        ? step.dueDate
        : null;
    if (step.dueDate && (!verifiedDueDate || status !== 'supported')) {
      notes.push('The date was removed because no validated supporting passage contains it.');
    }
    return {
      id: idMap.get(step.id) ?? `step-${index + 1}`,
      title: step.title,
      instruction: step.instruction,
      completionCriteria: step.completionCriteria,
      status,
      evidence: validEvidence,
      dueDate: status === 'supported' ? verifiedDueDate : null,
      dependsOn: step.dependsOn,
      userEdited: false,
      notes: notes.slice(0, 5),
    };
  });

  const conflicts = options.modelPlan.conflicts.flatMap((conflict, index) => {
    const validEvidence = conflict.evidence.filter((citation) =>
      citationIsValid(citation, options.sources),
    );
    const sourceIds = [...new Set(validEvidence.map((citation) => citation.sourceId))];
    const stepIds = [
      ...new Set(
        conflict.stepIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)),
      ),
    ];
    if (sourceIds.length < 2 || validEvidence.length < 2 || !stepIds.length) return [];
    return [
      {
        id: `conflict-${index + 1}`,
        topic: conflict.topic,
        detail: conflict.detail,
        sourceIds,
        stepIds,
        evidence: validEvidence.slice(0, 6),
      },
    ];
  });
  const rejectedConflicts = options.modelPlan.conflicts.length - conflicts.length;
  if (rejectedConflicts) {
    warnings.push(
      `${rejectedConflicts} reported conflict(s) were hidden because two valid source passages could not be verified.`,
    );
  }
  const conflictedStepIds = new Set(conflicts.flatMap((conflict) => conflict.stepIds));
  steps.forEach((step) => {
    if (conflictedStepIds.has(step.id)) {
      step.status = 'conflicting';
      step.dueDate = null;
      if (
        !step.notes.includes(
          'Nemotron flagged a conflict between the cited passages. Review both sources before acting.',
        )
      ) {
        step.notes.push(
          'Nemotron flagged a conflict between the cited passages. Review both sources before acting.',
        );
      }
    }
  });

  steps.forEach((step) => {
    const original = options.modelPlan.steps.find(
      (candidate) => idMap.get(candidate.id) === step.id,
    );
    const mapped = step.dependsOn
      .map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id) && id !== step.id);
    if (original && mapped.length < original.dependsOn.length) {
      step.notes.push('Unknown or self-referential dependencies were removed.');
    }
    step.dependsOn = [...new Set(mapped)];
  });
  if (hasCycle(steps)) {
    steps.forEach((step) => {
      if (step.dependsOn.length) step.notes.push('A dependency cycle was removed.');
      step.dependsOn = [];
    });
    warnings.push('Cyclic step dependencies were removed; the model-provided order was retained.');
  }

  steps.forEach((step) => {
    step.notes = step.notes.slice(0, 5);
  });
  const orderedSteps = stableTopologicalSort(steps);
  const staleSourceIds = new Set(
    options.sources.filter((entry) => entry.source.stale).map((entry) => entry.source.id),
  );
  if (staleSourceIds.size) {
    warnings.push(
      'At least one source has a publication date over 18 months old. Recheck it before relying on time-sensitive instructions.',
    );
  }
  if (invalidCitationCount) {
    warnings.push(
      `${invalidCitationCount} invalid model citation(s) were removed by the evidence gate.`,
    );
  }

  const timestamp = (options.now?.() ?? new Date()).toISOString();
  const plan: Plan = {
    version: 1,
    id: options.id ?? randomUUID(),
    title: options.modelPlan.title,
    goal: options.input.goal,
    jurisdiction: options.input.jurisdiction,
    category: options.input.category,
    createdAt: timestamp,
    updatedAt: timestamp,
    sources: options.sources.map((entry) => entry.source),
    steps: orderedSteps,
    conflicts,
    unresolvedQuestions: options.modelPlan.unresolvedQuestions,
    warnings: warnings.slice(0, 20),
    runtime: options.runtime,
    completedStepIds: [],
    sourceChecks: [],
  };
  const parsed = PlanSchema.parse(plan);
  const validatedSupportedClaims = parsed.steps.filter(
    (step) => step.status === 'supported',
  ).length;
  const metrics: EvidenceMetrics = {
    stepCount: parsed.steps.length,
    modelSupportedClaims,
    validatedSupportedClaims,
    unsupportedModelClaims,
    invalidCitationCount,
    citationCoverage: parsed.steps.length ? validatedSupportedClaims / parsed.steps.length : 0,
    unsupportedClaimRate: modelSupportedClaims ? unsupportedModelClaims / modelSupportedClaims : 0,
    validatedConflicts: conflicts.length,
    rejectedConflicts,
  };
  return { plan: parsed, metrics };
}
