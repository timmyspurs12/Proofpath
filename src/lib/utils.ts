import type { EvidenceStatus, Plan } from '../shared/schemas';

export const evidenceLabels: Record<EvidenceStatus, string> = {
  supported: 'Supported by source',
  inferred: 'Inferred — confirm',
  conflicting: 'Conflicting evidence',
  unverifiable: 'Unable to verify',
};

export function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' } : {}),
  }).format(new Date(value));
}

export function planProgress(plan: Plan) {
  const completed = plan.steps.filter((step) => plan.completedStepIds.includes(step.id)).length;
  return {
    completed,
    total: plan.steps.length,
    percent: Math.round((completed / plan.steps.length) * 100),
  };
}

export function supportedCount(plan: Plan) {
  return plan.steps.filter((step) => step.status === 'supported').length;
}

export function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function safeFilename(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'proofpath-plan'
  );
}
