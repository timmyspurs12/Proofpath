import type { ContradictionDiagnostic, ContradictionReasonCode } from '../server/lib/claim-checks';
import type { EvidenceMetrics, ModelPlan } from '../server/lib/evidence';
import { hashText, type RetrievedSource } from '../server/lib/retrieval';
import type { Plan, TaskInput } from '../src/shared/schemas';
import type { TrapClassDefinition } from './live-cases/nigeria-domestic-renewal';

// Pure, side-effect-free acceptance evaluation for live verification runs.
// It contains no provider client and performs no network or filesystem work,
// so the evidence-quality verdict is fully unit-testable offline. Case-
// specific wording (jurisdiction, hosts, trap relationships) arrives through
// the LiveCaseDefinition; nothing here teaches the universal engine a country.

export interface LiveCaseDefinition {
  caseId: string;
  expectedJurisdiction: string;
  expectedSourceUrls: readonly string[];
  officialHostSuffixes: readonly string[];
  trapClasses: readonly TrapClassDefinition[];
  buildRequest: () => TaskInput;
}

export interface AcceptanceCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface RequestedUrlOutcome {
  url: string;
  outcome: 'retrieved' | 'not-retrieved';
  host: string;
  publisher: string | null;
  authority: string | null;
  retrievalRoute: string | null;
  retrievedAt: string | null;
  contentHash: string | null;
  excerptLength: number;
  warning: string | null;
  // True only when every live-retrieval provenance requirement holds; a bare
  // URL, a model citation or a malformed/missing timestamp never qualifies.
  liveRetrievalQualified: boolean;
  provenanceIssues: string[];
}

// How a single contradiction decision on trap material relates to the step it
// targets, resolved from the actual step title/instruction and source passage.
export type TrapObservationClassification =
  | 'legitimate' // same subject/route/circumstance/location: a valid downgrade
  | 'false-positive' // protected unrelated step was downgraded
  | 'protected-not-downgraded' // protected step, but no downgrade occurred
  | 'unclassified' // no case relationship covers this observed decision
  | 'unresolved'; // the diagnostic step id could not be resolved

export interface TrapObservation {
  trapId: string;
  sourceId: string;
  sourceUrl: string | null;
  sentence: string;
  clause: string | null;
  reasonCode: ContradictionReasonCode;
  modelStepId: string | null;
  finalStepId: string | null;
  stepTitle: string | null;
  stepInstruction: string | null;
  finalStepStatus: string | null;
  classification: TrapObservationClassification;
}

export interface TrapCoverage {
  trapId: string;
  label: string;
  // Relevant wording exists in a genuinely retrieved source text.
  materialRetrieved: boolean;
  // The engine emitted at least one diagnostic decision on matching wording.
  evaluated: boolean;
  // Exercised only when both hold: relevant material was retrieved AND the
  // contradiction pipeline evaluated it. Present-but-affirmative material
  // (no negation cue, no decision needed) is reported, not counted as a gap.
  exercised: boolean;
  detail: string;
  observations: TrapObservation[];
}

export interface CaseAcceptanceResult {
  caseId: string;
  evaluatedAt: string;
  passed: boolean;
  checks: AcceptanceCheck[];
  reasons: string[];
  requestedUrlOutcomes: RequestedUrlOutcome[];
  trapCoverage: TrapCoverage[];
  falsePositiveViolations: string[];
  legitimateContradictions: number;
  contradictionCount: number;
  reasonCodeCounts: Record<string, number>;
}

// Mirrors the ContradictionReasonCode union in server/lib/claim-checks.ts.
// Kept as an explicit runtime set so a malformed diagnostic cannot silently
// pass acceptance with an undocumented reason code.
export const KNOWN_REASON_CODES: ReadonlySet<ContradictionReasonCode> = new Set([
  'currency-mismatch',
  'ungrounded-currency',
  'negated-requirement',
  'conditional-route',
  'fee-context-mismatch',
  'currency-claim-grounded',
  'skipped-scope-route',
  'skipped-scope-location',
  'skipped-applicant-circumstance',
  'skipped-no-negation-cue',
  'skipped-generic-term-only',
  'skipped-clause-subject-mismatch',
  'skipped-money-clause',
  'skipped-no-distinctive-term',
]);

// Retrieval routes that prove the source entered through the live retrieval
// pipeline. Uploaded documents and bundled samples are not live retrievals.
const LIVE_RETRIEVAL_ROUTES = new Set(['direct', 'tavily']);
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA256 = /^[a-f0-9]{64}$/;
// Retrieval is accepted as fresh when the stored timestamp is inside this
// skew around the run window; clock-independent structural checks always run.
const RETRIEVAL_SKEW_MS = 5 * 60 * 1000;

function hostOf(url: string | null | undefined): string {
  if (!url) return 'unknown source';
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return 'unknown source';
  }
}

export function isOfficialHost(host: string, suffixes: readonly string[]): boolean {
  const normalized = host.toLowerCase();
  return suffixes.some((suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`));
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value || !ISO_TIMESTAMP.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// The full provenance contract a source must satisfy before it can evidence
// a live retrieval. Every failure mode is returned as an explicit issue.
function provenanceIssues(
  entry: RetrievedSource,
  definition: LiveCaseDefinition,
  runStartedAt: string | undefined,
  evaluatedAtMs: number,
): string[] {
  const issues: string[] = [];
  const source = entry.source;
  const host = hostOf(source.url);
  if (!source.url) issues.push('source has no URL');
  else if (!isOfficialHost(host, definition.officialHostSuffixes))
    issues.push(`host ${host} is not an allowed official hostname`);
  if (source.authority !== 'official')
    issues.push(`authority is "${source.authority}", expected "official"`);
  if (source.excerpt.trim().length === 0) issues.push('excerpt is empty');
  if (!source.title.trim()) issues.push('pipeline title metadata is missing');
  if (!source.publisher.trim()) issues.push('pipeline publisher metadata is missing');
  if (!LIVE_RETRIEVAL_ROUTES.has(source.retrieval))
    issues.push(`retrieval route "${source.retrieval}" is not a live direct/tavily fetch`);
  if (!SHA256.test(source.contentHash)) issues.push('content hash is not a 64-hex sha256');
  else if (hashText(entry.text) !== source.contentHash)
    issues.push('content hash does not match the retrieved text');
  const stampMs = parseTimestamp(source.retrievedAt);
  if (stampMs === null) issues.push('retrieval timestamp is missing or not parseable ISO-8601');
  else if (runStartedAt) {
    const startMs = parseTimestamp(runStartedAt);
    if (startMs !== null) {
      if (stampMs < startMs - RETRIEVAL_SKEW_MS)
        issues.push('retrieval timestamp predates the live run window (frozen or stale stamp)');
      if (stampMs > evaluatedAtMs + RETRIEVAL_SKEW_MS)
        issues.push('retrieval timestamp is in the future beyond clock skew');
    }
  }
  return issues;
}

function stepText(step: Plan['steps'][number]): string {
  const quotes = step.evidence.map((citation) => citation.quote).join(' ');
  return `${step.title} ${step.instruction} ${quotes}`;
}

// Maps every requested URL to its real retrieval outcome using only the
// sources and warnings the pipeline actually produced. A URL absent from the
// retrieved sources is reported as not-retrieved, never inferred as success.
export function deriveRequestedUrlOutcomes(
  request: TaskInput,
  sources: RetrievedSource[],
  warnings: string[],
  definition: LiveCaseDefinition,
  runStartedAt: string | undefined,
  evaluatedAtMs: number,
): RequestedUrlOutcome[] {
  return request.sourceUrls.map((url) => {
    const host = hostOf(url);
    const match = sources.find((entry) => entry.source.url === url);
    const warning =
      warnings.find((entry) => entry.toLowerCase().includes(host.toLowerCase())) ?? null;
    if (!match) {
      return {
        url,
        outcome: 'not-retrieved',
        host,
        publisher: null,
        authority: null,
        retrievalRoute: null,
        retrievedAt: null,
        contentHash: null,
        excerptLength: 0,
        warning,
        liveRetrievalQualified: false,
        provenanceIssues: ['URL was requested but no source was retrieved'],
      };
    }
    const issues = provenanceIssues(match, definition, runStartedAt, evaluatedAtMs);
    return {
      url,
      outcome: 'retrieved',
      host,
      publisher: match.source.publisher,
      authority: match.source.authority,
      retrievalRoute: match.source.retrieval,
      retrievedAt: match.source.retrievedAt,
      contentHash: match.source.contentHash,
      excerptLength: match.source.excerpt.length,
      warning,
      liveRetrievalQualified: issues.length === 0,
      provenanceIssues: issues,
    };
  });
}

function clip(value: string, max = 160): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Resolves a diagnostic's model step id to the final plan step. validateEvidencePlan
// renumbers model steps positionally to step-N; the model plan is required so
// the acceptance layer can reproduce that mapping without any engine change.
function buildStepResolver(modelPlan: ModelPlan, plan: Plan) {
  const modelToFinal = new Map(
    modelPlan.steps.map((step, index) => [step.id, `step-${index + 1}`]),
  );
  return (modelStepId: string | null) => {
    if (!modelStepId) return null;
    const finalId = modelToFinal.get(modelStepId);
    if (!finalId) return null;
    return plan.steps.find((step) => step.id === finalId) ?? null;
  };
}

function evaluateTrapCoverage(
  definition: LiveCaseDefinition,
  diagnostics: ContradictionDiagnostic[],
  sources: RetrievedSource[],
  modelPlan: ModelPlan,
  plan: Plan,
): { coverage: TrapCoverage[]; violations: string[]; legitimate: number } {
  const resolveStep = buildStepResolver(modelPlan, plan);
  const sourceById = new Map(sources.map((entry) => [entry.source.id, entry]));
  const violations: string[] = [];
  let legitimate = 0;

  const coverage: TrapCoverage[] = definition.trapClasses.map((trap) => {
    const materialSources = sources.filter((entry) => trap.passagePattern.test(entry.text));
    const hits = diagnostics.filter((entry) => {
      if (entry.decision !== 'contradiction') return false;
      const passageText = entry.sentence || entry.clause || '';
      if (passageText && trap.passagePattern.test(passageText)) return true;
      // Currency-section diagnostics carry no sentence: associate them via
      // the genuinely retrieved source they cite, but only when the trap
      // class explicitly opts in with a currency-specific pattern, so one
      // source-level record cannot fan out across unrelated trap classes.
      if (!passageText) {
        if (!trap.currencyPassagePattern) return false;
        const cited = sourceById.get(entry.sourceId);
        return Boolean(cited && trap.currencyPassagePattern.test(cited.text));
      }
      return false;
    });

    const observations: TrapObservation[] = hits.map((diagnostic) => {
      const base = {
        trapId: trap.id,
        sourceId: diagnostic.sourceId,
        sourceUrl: sourceById.get(diagnostic.sourceId)?.source.url ?? null,
        sentence: diagnostic.sentence,
        clause: diagnostic.clause,
        reasonCode: diagnostic.reasonCode,
        modelStepId: diagnostic.instructionId,
      };
      const step = resolveStep(diagnostic.instructionId);
      if (!step) {
        return {
          ...base,
          finalStepId: null,
          stepTitle: null,
          stepInstruction: null,
          finalStepStatus: null,
          classification: 'unresolved' as const,
        };
      }
      const targetText = stepText(step);
      let classification: TrapObservationClassification;
      if (trap.applicableStepPattern.test(targetText)) {
        classification = 'legitimate';
        legitimate += 1;
      } else if (trap.protectedStepPattern.test(targetText)) {
        classification =
          step.status === 'unverifiable' ? 'false-positive' : 'protected-not-downgraded';
      } else {
        classification = 'unclassified';
      }
      return {
        ...base,
        finalStepId: step.id,
        stepTitle: step.title,
        stepInstruction: step.instruction,
        finalStepStatus: step.status,
        classification,
      };
    });

    for (const observation of observations) {
      if (observation.classification === 'false-positive') {
        violations.push(
          `${trap.id}: source ${observation.sourceId} passage "${clip(observation.sentence || observation.clause || '(currency record)')}" ` +
            `downgraded protected step "${observation.stepTitle}" (${observation.finalStepId}, ${observation.reasonCode})`,
        );
      } else if (observation.classification === 'unclassified') {
        violations.push(
          `${trap.id}: contradiction (${observation.reasonCode}) on "${clip(observation.sentence || '(currency record)')}" ` +
            `targets step "${observation.stepTitle}", which matches no expected relationship; manual review required before acceptance`,
        );
      } else if (observation.classification === 'unresolved') {
        violations.push(
          `${trap.id}: contradiction (${observation.reasonCode}) on "${clip(observation.sentence || '(currency record)')}" ` +
            `has an unresolvable step id ${String(observation.modelStepId)}; the downgrade target cannot be audited`,
        );
      }
    }

    const materialRetrieved = materialSources.length > 0;
    const evaluated = hits.length > 0;
    const reasonCodes = [...new Set(hits.map((entry) => entry.reasonCode))];
    const contradictions = hits.length;
    const detail = !materialRetrieved
      ? 'No retrieved source contains material for this trap class in the live run.'
      : !evaluated
        ? `Relevant material retrieved from ${materialSources.length} source(s), but every matching passage was affirmative or out of scope, so no contradiction decision was required.`
        : `${contradictions} contradiction decision(s); reason codes: ${reasonCodes.join(', ')}; classifications: ${observations
            .map((entry) => entry.classification)
            .join(', ')}`;

    return {
      trapId: trap.id,
      label: trap.label,
      materialRetrieved,
      evaluated,
      exercised: materialRetrieved && evaluated,
      detail,
      observations,
    };
  });

  return { coverage, violations, legitimate };
}

export interface EvaluationInput {
  request: TaskInput;
  modelPlan: ModelPlan;
  plan: Plan;
  metrics: EvidenceMetrics;
  diagnostics: ContradictionDiagnostic[];
  sources: RetrievedSource[];
  // ISO timestamp captured immediately before the live run starts. When
  // omitted, only structural provenance checks run (offline fixture mode).
  runStartedAt?: string;
}

export function evaluateEvidenceAcceptance(
  definition: LiveCaseDefinition,
  input: EvaluationInput,
): CaseAcceptanceResult {
  const { request, modelPlan, plan, metrics, diagnostics, sources, runStartedAt } = input;
  const evaluatedAtMs = Date.now();
  const checks: AcceptanceCheck[] = [];
  const record = (id: string, passed: boolean, detail: string) =>
    checks.push({ id, passed, detail });

  const requestContext = `${request.task} ${request.jurisdiction} ${request.category} ${request.details}`;
  const requestPassed =
    request.jurisdiction.trim() === definition.expectedJurisdiction &&
    /adult/i.test(requestContext) &&
    /domestic/i.test(requestContext) &&
    /online/i.test(requestContext) &&
    request.document === null;
  record(
    'request-targets-adult-domestic-online-case',
    requestPassed,
    requestPassed
      ? 'Request names the adult, domestic, online-route case and carries no injected document.'
      : 'Request is missing the adult/domestic/online target, wrong jurisdiction, or injects a document.',
  );

  const anchorSet = new Set(request.sourceUrls);
  const expectedSet = new Set(definition.expectedSourceUrls);
  const anchorsPassed =
    anchorSet.size === expectedSet.size && [...expectedSet].every((url) => anchorSet.has(url));
  record(
    'request-anchored-to-official-starting-urls',
    anchorsPassed,
    anchorsPassed
      ? `All ${expectedSet.size} official starting URLs are present in the request.`
      : 'The request does not carry the exact official starting URL set for this case.',
  );

  // Provenance contract: official host + authority + non-empty excerpt +
  // parseable timestamp + pipeline metadata + hash integrity (+ freshness in
  // a live run). A bare URL, frozen fixture stamp or model citation fails.
  const provenancePerSource = sources.map((entry) => ({
    entry,
    issues: provenanceIssues(entry, definition, runStartedAt, evaluatedAtMs),
  }));
  const qualified = provenancePerSource.filter((item) => item.issues.length === 0);
  const rejected = provenancePerSource.filter((item) => item.issues.length > 0);
  record(
    'official-source-genuinely-retrieved',
    qualified.length > 0,
    qualified.length
      ? `${qualified.length} source(s) satisfy the full live-retrieval provenance contract (official host, authority, excerpt, parseable timestamp, metadata, hash).`
      : `No source satisfies the live-retrieval provenance contract. Rejected: ${
          rejected
            .map((item) => `${item.entry.source.id} (${item.issues.join('; ')})`)
            .join(' | ') || 'none retrieved'
        }`,
  );

  const receipt = plan.runtime;
  const receiptPassed =
    receipt.mode === 'live' &&
    receipt.provider === 'nebius' &&
    typeof receipt.model === 'string' &&
    receipt.model.length > 0 &&
    typeof receipt.responseId === 'string' &&
    receipt.responseId.length > 0;
  record(
    'genuine-live-provider-receipt',
    receiptPassed,
    receiptPassed
      ? `Live Nebius receipt present (model ${receipt.model}, response id captured).`
      : 'Plan lacks a complete live provider/model/response receipt.',
  );

  const diagnosticsValid =
    Array.isArray(diagnostics) &&
    diagnostics.every(
      (entry) =>
        (entry.decision === 'contradiction' || entry.decision === 'not_contradiction') &&
        KNOWN_REASON_CODES.has(entry.reasonCode),
    );
  record(
    'contradiction-diagnostics-threaded-and-valid',
    diagnosticsValid,
    diagnosticsValid
      ? `${diagnostics.length} diagnostic record(s), every reason code is in the documented vocabulary.`
      : 'Diagnostics are missing or contain an undocumented decision/reason code.',
  );

  record(
    'pipeline-produced-a-plan',
    plan.steps.length > 0,
    plan.steps.length ? `Plan contains ${plan.steps.length} step(s).` : 'Plan has no steps.',
  );

  const officialSourceIds = new Set(
    sources
      .filter((entry) => entry.source.authority === 'official')
      .map((entry) => entry.source.id),
  );
  const citesOfficial = (step: Plan['steps'][number]) =>
    step.evidence.some((citation) => officialSourceIds.has(citation.sourceId));

  const biometricStep = plan.steps.find((step) => {
    if (step.status !== 'supported') return false;
    const text = stepText(step);
    return /biometric/i.test(text) && /in person|appear|enrol|enroll|capture/i.test(text);
  });
  const biometricsPassed = Boolean(biometricStep && citesOfficial(biometricStep));
  record(
    'in-person-biometric-obligation-supported',
    biometricsPassed,
    biometricsPassed
      ? `A supported step preserves in-person biometric capture with an official citation (${biometricStep?.title}).`
      : 'No supported step preserves the in-person biometric obligation on an official citation.',
  );

  const onlineOnlyStep = plan.steps.find(
    (step) =>
      step.status === 'supported' &&
      /without visiting|without attending|no immigration office visit|entirely online|fully online|no office visit/i.test(
        stepText(step),
      ),
  );
  record(
    'no-supported-online-only-completion',
    !onlineOnlyStep,
    onlineOnlyStep
      ? `A supported step wrongly claims completion without an office visit: ${onlineOnlyStep.title}.`
      : 'No supported step claims the renewal can finish without an office visit or biometric attendance.',
  );

  const includedChargesStep = plan.steps.find(
    (step) => step.status === 'supported' && /including bank charges/i.test(stepText(step)),
  );
  record(
    'no-supported-included-bank-charges-claim',
    !includedChargesStep,
    includedChargesStep
      ? `A supported step wrongly treats bank charges as included: ${includedChargesStep.title}.`
      : 'No supported step claims bank charges are included.',
  );

  const feeStepWithoutOfficial = plan.steps.find((step) => {
    if (step.status !== 'supported') return false;
    if (!/\bfee|\bpay\b|payment|charge/i.test(stepText(step))) return false;
    return !citesOfficial(step);
  });
  record(
    'supported-fee-steps-cite-official-sources',
    !feeStepWithoutOfficial,
    feeStepWithoutOfficial
      ? `A supported fee/payment step lacks an official citation: ${feeStepWithoutOfficial.title}.`
      : 'Every supported fee or payment step cites an official retrieved source.',
  );

  const citationWarningConsistent =
    metrics.invalidCitationCount === 0 ||
    plan.warnings.some((warning) => warning.includes('invalid model citation'));
  record(
    'citation-fail-closed-warnings-consistent',
    citationWarningConsistent,
    citationWarningConsistent
      ? 'Invalid-citation metric and plan warnings are consistent.'
      : `${metrics.invalidCitationCount} citation(s) removed without the required warning.`,
  );

  const questionsWellFormed = plan.unresolvedQuestions.every(
    (question) =>
      question.id.trim().length > 0 &&
      question.question.trim().length > 0 &&
      question.reason.trim().length > 0,
  );
  record(
    'unresolved-questions-retained-as-structured-fields',
    questionsWellFormed,
    questionsWellFormed
      ? `${plan.unresolvedQuestions.length} unresolved question(s) retained with id, question and reason.`
      : 'An unresolved question is missing its id, question text or reason.',
  );

  // False-positive trap guard: a retrieved trap passage that downgrades a
  // protected unrelated domestic step fails acceptance; same-subject/same-route
  // prohibitions on applicable steps remain legitimate contradictions.
  const { coverage, violations, legitimate } = evaluateTrapCoverage(
    definition,
    diagnostics,
    sources,
    modelPlan,
    plan,
  );
  record(
    'no-false-positive-trap-downgrades',
    violations.length === 0,
    violations.length
      ? `${violations.length} false-positive or unclassifiable trap downgrade(s): ${violations.join(' | ')}`
      : `Every trap-material contradiction targets an applicable step (${legitimate} legitimate decision(s)); no protected domestic step was wrongly downgraded.`,
  );

  const requestedUrlOutcomes = deriveRequestedUrlOutcomes(
    request,
    sources,
    plan.warnings,
    definition,
    runStartedAt,
    evaluatedAtMs,
  );
  const reasonCodeCounts = diagnostics.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.reasonCode] = (acc[entry.reasonCode] ?? 0) + 1;
    return acc;
  }, {});
  const contradictionCount = diagnostics.filter(
    (entry) => entry.decision === 'contradiction',
  ).length;

  const failed = checks.filter((check) => !check.passed);
  return {
    caseId: definition.caseId,
    evaluatedAt: new Date(evaluatedAtMs).toISOString(),
    passed: failed.length === 0,
    checks,
    reasons: failed.map((check) => `${check.id}: ${check.detail}`),
    requestedUrlOutcomes,
    trapCoverage: coverage,
    falsePositiveViolations: violations,
    legitimateContradictions: legitimate,
    contradictionCount,
    reasonCodeCounts,
  };
}
