import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  EvidenceCitationSchema,
  EvidenceStatusSchema,
  PlanSchema,
  QuestionSchema,
  type EvidenceOutcome,
  type Plan,
  type PlanRequest,
  type PlanStep,
  type RejectedCitation,
  type RuntimeReceipt,
} from '../../src/shared/schemas';
import {
  findInstructionContradictions,
  jurisdictionCoverage,
  routeContextFromInput,
  type ClaimContradictionKind,
  type ContradictionDiagnostic,
} from './claim-checks';
import type { RetrievedSource } from './retrieval';
import { questionOutOfRoute } from './route-scope';

// Findings that explicitly contradict a claim rather than merely failing to
// verify it. Every other finding kind (ungrounded amount, conditional route,
// fee-context/location mismatch) is an applicability or evidence gap and is
// reported as "unverifiable", never as a falsity verdict.
const EXPLICIT_CONTRADICTION_KINDS = new Set<ClaimContradictionKind>([
  'currency-mismatch',
  'negated-requirement',
]);

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
  // Opt-in inspection sink for per-candidate contradiction decisions. The
  // plan schema and default behavior are unchanged when this is omitted.
  includeDiagnostics?: boolean;
}

export interface EvidenceMetrics {
  stepCount: number;
  modelSupportedClaims: number;
  validatedSupportedClaims: number;
  unsupportedModelClaims: number;
  invalidCitationCount: number;
  contradictedClaimCount: number;
  citationCoverage: number;
  unsupportedClaimRate: number;
  validatedConflicts: number;
  rejectedConflicts: number;
  // Per-claim outcome distribution for model-claimed supported steps and any
  // step later marked by a validated multi-source conflict.
  outcomeCounts: Record<EvidenceOutcome, number>;
  removedOutOfRouteQuestions: number;
}

export function validateEvidencePlan(options: ValidationOptions) {
  const warnings = [...(options.initialWarnings ?? [])];
  const route = routeContextFromInput(options.input);
  // Records are only populated when the caller opts into diagnostics.
  const contradictionDiagnostics: ContradictionDiagnostic[] = [];
  const idMap = new Map(
    options.modelPlan.steps.map((step, index) => [step.id, `step-${index + 1}`]),
  );
  let invalidCitationCount = 0;
  let unsupportedModelClaims = 0;
  let modelSupportedClaims = 0;
  let contradictedClaimCount = 0;

  const steps: PlanStep[] = options.modelPlan.steps.map((step, index) => {
    // Rejected citations are preserved with a machine-readable reason so the
    // model's provenance claim stays auditable instead of vanishing. A
    // rejection never means the underlying claim is false: it only means the
    // citation did not check out against a retrieved source.
    const rejectedCitations: RejectedCitation[] = [];
    const validEvidence = step.evidence.filter((citation) => {
      const valid = citationIsValid(citation, options.sources);
      if (!valid) {
        invalidCitationCount += 1;
        const sourceExists = options.sources.some((entry) => entry.source.id === citation.sourceId);
        rejectedCitations.push({
          sourceId: citation.sourceId,
          quote: citation.quote,
          reason: sourceExists ? 'passage-not-found' : 'source-not-retrieved',
        });
      }
      return valid;
    });
    const notes: string[] = [];
    if (rejectedCitations.length) {
      notes.push('One or more model citations failed exact-passage validation and were removed.');
    }
    if (step.claimedStatus === 'supported') {
      modelSupportedClaims += 1;
      if (!validEvidence.length) unsupportedModelClaims += 1;
    }
    let status = step.claimedStatus;
    let evidenceOutcome: EvidenceOutcome | null = null;
    if (status === 'supported' && !validEvidence.length) {
      status = 'unverifiable';
      // Invalid citation is a verification failure, never a falsity verdict.
      evidenceOutcome = 'invalid-citation';
      notes.push('Support was removed because no cited passage exists in a retrieved source.');
    }
    if (status === 'conflicting') {
      status = 'unverifiable';
      evidenceOutcome = 'unverifiable';
      notes.push(
        'A conflict must be validated against at least two cited sources before it is shown as conflicting.',
      );
    }
    // Exact-passage matching proves a quote exists; it cannot prove the
    // instruction faithfully uses it. Reject supported claims whose concrete
    // amounts or requirements contradict, or are not grounded in, evidence.
    if (status === 'supported') {
      const contradictions = findInstructionContradictions({
        instruction: step.instruction,
        sources: options.sources,
        citedSourceIds: validEvidence.map((citation) => citation.sourceId),
        route,
        instructionId: step.id,
        diagnostics: options.includeDiagnostics ? contradictionDiagnostics : undefined,
      });
      if (contradictions.length) {
        contradictedClaimCount += 1;
        unsupportedModelClaims += 1;
        status = 'unverifiable';
        // Only an explicit in-scope conflict (a source publishing a different
        // figure for the same fee, or directly negating the requirement) is a
        // contradiction. A missing passage, an ungrounded amount, or a
        // different-route/different-location passage means the claim cannot
        // be verified here — never that the claim is false.
        evidenceOutcome = contradictions.some((entry) =>
          EXPLICIT_CONTRADICTION_KINDS.has(entry.kind),
        )
          ? 'contradicted'
          : 'unverifiable';
        for (const contradiction of contradictions) {
          notes.push(contradiction.detail);
        }
      } else {
        evidenceOutcome = 'supported';
      }
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
      evidenceOutcome,
      evidence: validEvidence,
      rejectedCitations: rejectedCitations.slice(0, 4),
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
      if (step.evidenceOutcome === 'supported') {
        step.evidenceOutcome = 'contradicted';
      }
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
  if (contradictedClaimCount) {
    warnings.push(
      `${contradictedClaimCount} source-supported claim(s) were downgraded because the instruction contradicts, or is not grounded in, retrieved evidence.`,
    );
  }
  const requestedJurisdiction = options.input.jurisdiction.trim();
  if (
    requestedJurisdiction &&
    !jurisdictionCoverage(requestedJurisdiction, options.sources).mentioned
  ) {
    warnings.push(
      `None of the retrieved sources mention the requested jurisdiction “${requestedJurisdiction}”. Their requirements may not apply there; verify jurisdictional applicability before acting.`,
    );
  }

  // Unresolved questions follow the same route discipline as steps and
  // sources: a question about the overseas/consular route cannot survive on a
  // domestic request (or vice versa). Questions whose scope is unspecified
  // are retained — authority gaps still need surfacing.
  const keptQuestions = options.modelPlan.unresolvedQuestions.filter(
    (question) => !questionOutOfRoute(question, route),
  );
  const removedOutOfRouteQuestions =
    options.modelPlan.unresolvedQuestions.length - keptQuestions.length;
  if (removedOutOfRouteQuestions) {
    warnings.push(
      `${removedOutOfRouteQuestions} unresolved question(s) were removed because they concern an overseas/consular application route that this request did not select.`,
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
    unresolvedQuestions: keptQuestions,
    warnings: warnings.slice(0, 20),
    runtime: options.runtime,
    completedStepIds: [],
    sourceChecks: [],
  };
  const parsed = PlanSchema.parse(plan);
  const validatedSupportedClaims = parsed.steps.filter(
    (step) => step.status === 'supported',
  ).length;
  const outcomeCounts: Record<EvidenceOutcome, number> = {
    supported: 0,
    contradicted: 0,
    unverifiable: 0,
    'invalid-citation': 0,
  };
  for (const step of parsed.steps) {
    if (step.evidenceOutcome) outcomeCounts[step.evidenceOutcome] += 1;
  }
  const metrics: EvidenceMetrics = {
    stepCount: parsed.steps.length,
    modelSupportedClaims,
    validatedSupportedClaims,
    unsupportedModelClaims,
    invalidCitationCount,
    contradictedClaimCount,
    citationCoverage: parsed.steps.length ? validatedSupportedClaims / parsed.steps.length : 0,
    unsupportedClaimRate: modelSupportedClaims ? unsupportedModelClaims / modelSupportedClaims : 0,
    validatedConflicts: conflicts.length,
    rejectedConflicts,
    outcomeCounts,
    removedOutOfRouteQuestions,
  };
  return {
    plan: parsed,
    metrics,
    // Empty unless ValidationOptions.includeDiagnostics was requested.
    diagnostics: options.includeDiagnostics ? contradictionDiagnostics : [],
  };
}
