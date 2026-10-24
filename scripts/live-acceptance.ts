import type { ContradictionDiagnostic, ContradictionReasonCode } from '../server/lib/claim-checks';
import type { EvidenceMetrics } from '../server/lib/evidence';
import type { RetrievedSource } from '../server/lib/retrieval';
import type { Plan, TaskInput } from '../src/shared/schemas';
import type { TrapClassDefinition } from './live-cases/nigeria-domestic-renewal';

// Pure, side-effect-free acceptance evaluation for live verification runs.
// It contains no provider client and performs no network or filesystem work,
// so the evidence-quality verdict is fully unit-testable offline. Case-
// specific wording (jurisdiction, hosts, trap patterns) arrives through the
// LiveCaseDefinition; nothing here teaches the universal engine a country.

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
}

export interface CaseAcceptanceResult {
  caseId: string;
  evaluatedAt: string;
  passed: boolean;
  checks: AcceptanceCheck[];
  reasons: string[];
  requestedUrlOutcomes: RequestedUrlOutcome[];
  trapCoverage: TrapCoverage[];
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

function hostOf(url: string): string {
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
      };
    }
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
    };
  });
}

function evaluateTrapCoverage(
  definition: LiveCaseDefinition,
  diagnostics: ContradictionDiagnostic[],
  sources: RetrievedSource[],
): TrapCoverage[] {
  return definition.trapClasses.map((trap) => {
    const materialSources = sources.filter((entry) => trap.passagePattern.test(entry.text));
    const hits = diagnostics.filter((entry) => {
      const haystack = `${entry.sentence} ${entry.clause ?? ''}`;
      return trap.passagePattern.test(haystack);
    });
    const materialRetrieved = materialSources.length > 0;
    const evaluated = hits.length > 0;
    if (!materialRetrieved) {
      return {
        trapId: trap.id,
        label: trap.label,
        materialRetrieved: false,
        evaluated: false,
        exercised: false,
        detail: 'No retrieved source contains material for this trap class in the live run.',
      };
    }
    if (!evaluated) {
      return {
        trapId: trap.id,
        label: trap.label,
        materialRetrieved: true,
        evaluated: false,
        exercised: false,
        detail: `Relevant material retrieved from ${materialSources.length} source(s), but every matching passage was affirmative or out of scope, so no contradiction decision was required.`,
      };
    }
    const reasonCodes = [...new Set(hits.map((entry) => entry.reasonCode))];
    const contradictions = hits.filter((entry) => entry.decision === 'contradiction').length;
    return {
      trapId: trap.id,
      label: trap.label,
      materialRetrieved: true,
      evaluated: true,
      exercised: true,
      detail: `${hits.length} diagnostic record(s); ${contradictions} contradiction decision(s); reason codes: ${reasonCodes.join(', ')}`,
    };
  });
}

export interface EvaluationInput {
  request: TaskInput;
  plan: Plan;
  metrics: EvidenceMetrics;
  diagnostics: ContradictionDiagnostic[];
  sources: RetrievedSource[];
}

export function evaluateEvidenceAcceptance(
  definition: LiveCaseDefinition,
  input: EvaluationInput,
): CaseAcceptanceResult {
  const { request, plan, metrics, diagnostics, sources } = input;
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

  const officialRetrieved = sources.filter(
    (entry) =>
      entry.source.authority === 'official' &&
      isOfficialHost(hostOf(entry.source.url ?? ''), definition.officialHostSuffixes) &&
      entry.source.excerpt.trim().length > 0,
  );
  record(
    'official-source-genuinely-retrieved',
    officialRetrieved.length > 0,
    officialRetrieved.length
      ? `${officialRetrieved.length} official host source(s) retrieved with non-empty excerpts and timestamps.`
      : 'No official-host source with a non-empty excerpt was retrieved; a URL alone is not evidence.',
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

  const requestedUrlOutcomes = deriveRequestedUrlOutcomes(request, sources, plan.warnings);
  const trapCoverage = evaluateTrapCoverage(definition, diagnostics, sources);
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
    evaluatedAt: new Date().toISOString(),
    passed: failed.length === 0,
    checks,
    reasons: failed.map((check) => `${check.id}: ${check.detail}`),
    requestedUrlOutcomes,
    trapCoverage,
    contradictionCount,
    reasonCodeCounts,
  };
}
