// Deterministic, provider-independent clarification guard.
//
// The model-driven intake can ask follow-up questions, but universality must
// not depend on the model remembering to. This module inspects only the
// user's own text and the presence of evidence anchors; it contains no
// country, language, or task-category tables. A blank jurisdiction is a
// reason to ask, never a reason to guess one.
import type { Question, TaskInput } from '../../src/shared/schemas';

type ClarificationInput = Pick<
  TaskInput,
  'task' | 'jurisdiction' | 'category' | 'details' | 'sourceUrls' | 'document'
>;

// Generic application-process vocabulary. Route markers describe *how* a
// process is transacted, not which country or agency runs it.
const APPLICATION_VERBS =
  /\b(?:apply|application|renew|renewal|replace|replacement|register|registration|licen[cs]e|permit|visa|enrol|enroll|claim|submit|submission|appointment|declaration|appeal)\b/i;

const ROUTE_MARKERS =
  /\b(?:online|digitally|digital|paper|by post|postal|mail|in person|in-person|walk.?in|counter|embassy|consulate|consular|high commission|abroad|overseas|from outside|agent|proxy)\b/i;

function hasEvidenceAnchor(input: ClarificationInput) {
  return input.sourceUrls.length > 0 || input.document !== null;
}

export function requiredClarifications(input: ClarificationInput): Question[] {
  const questions: Question[] = [];
  const jurisdiction = input.jurisdiction.trim();
  const context = `${input.task} ${input.details}`.trim();

  if (jurisdiction.length < 2) {
    questions.push({
      id: 'clarify-jurisdiction',
      question:
        'Which country or jurisdiction runs this process, and are you applying from inside it or from abroad?',
      reason:
        'Requirements differ between countries and between domestic and consular applications, so ProofPath cannot infer a jurisdiction safely.',
    });
  }

  // Only ask about the transaction route when the request describes an
  // application-type process, gives no route itself, and the user has not
  // anchored the plan to their own official source or document.
  if (
    APPLICATION_VERBS.test(context) &&
    !ROUTE_MARKERS.test(context) &&
    !hasEvidenceAnchor(input)
  ) {
    questions.push({
      id: 'clarify-route',
      question:
        'Which application route do you intend to use: online, paper or post, in person, or a consular route from abroad?',
      reason:
        'Fees, documents and submission steps are route-specific; mixing routes is a common evidence error.',
    });
  }

  return questions.slice(0, 5);
}

function significantTokens(value: string): Set<string> {
  return new Set(
    (value.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(
      (token) =>
        !['which', 'what', 'where', 'when', 'your', 'from', 'with', 'this'].includes(token),
    ),
  );
}

function questionsOverlap(a: Question, b: Question) {
  const left = significantTokens(a.question);
  const right = significantTokens(b.question);
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  // Two substantial shared content words means the model already asked it.
  return shared >= 2;
}

// Deterministic questions lead; model questions supplement without
// duplicating them. The five-question schema cap is always respected.
export function mergeClarifications(
  deterministic: Question[],
  modelQuestions: Question[],
): Question[] {
  const merged = [...deterministic];
  for (const question of modelQuestions) {
    if (merged.length >= 5) break;
    if (!merged.some((existing) => questionsOverlap(existing, question))) {
      merged.push(question);
    }
  }
  return merged.slice(0, 5);
}
