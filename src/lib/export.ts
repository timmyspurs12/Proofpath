import type { Plan } from '../shared/schemas';
import { evidenceLabels, safeFilename } from './utils';

export function planToMarkdown(plan: Plan) {
  const lines = [
    `# ${plan.title}`,
    '',
    `**Goal:** ${plan.goal}`,
    `**Jurisdiction:** ${plan.jurisdiction}`,
    `**Category:** ${plan.category}`,
    `**Exported:** ${new Date().toISOString()}`,
    `**Mode:** ${plan.runtime.mode === 'live' ? 'Live Nebius inference' : 'Labelled sample — not live inference'}`,
    '',
    '> Supported means an exact cited passage was found in a retrieved source. It does not guarantee that the source is current, authoritative, or correctly interpreted.',
    '',
    '## Action plan',
    '',
  ];
  plan.steps.forEach((step, index) => {
    const checked = plan.completedStepIds.includes(step.id);
    lines.push(`### ${index + 1}. [${checked ? 'x' : ' '}] ${step.title}`);
    lines.push('');
    lines.push(
      `**Evidence:** ${evidenceLabels[step.status]}${step.userEdited ? ' · edited by user' : ''}`,
    );
    lines.push('');
    lines.push(step.instruction);
    lines.push('');
    lines.push(`**Done when:** ${step.completionCriteria}`);
    if (step.dueDate) lines.push('', `**Date/deadline:** ${step.dueDate}`);
    if (step.notes.length) lines.push('', `**Notes:** ${step.notes.join(' ')}`);
    if (step.evidence.length) {
      lines.push('', '**Supporting passages:**');
      step.evidence.forEach((citation) => {
        const source = plan.sources.find((entry) => entry.id === citation.sourceId);
        lines.push(
          '',
          `> ${citation.quote}`,
          '',
          `— ${source?.publisher ?? citation.sourceId}${source?.url ? ` <${source.url}>` : ''}`,
        );
      });
    }
    lines.push('');
  });
  if (plan.conflicts.length) {
    lines.push('## Conflicts to review', '');
    plan.conflicts.forEach((conflict) => {
      lines.push(`### ${conflict.topic}`, '', conflict.detail, '');
      conflict.evidence.forEach((citation) => lines.push(`> ${citation.quote}`, ''));
    });
  }
  if (plan.unresolvedQuestions.length) {
    lines.push('## Unresolved questions', '');
    plan.unresolvedQuestions.forEach((question) =>
      lines.push(`- **${question.question}** — ${question.reason}`),
    );
    lines.push('');
  }
  lines.push('## Sources', '');
  plan.sources.forEach((source) => {
    lines.push(
      `- **${source.title}** — ${source.publisher}; retrieved ${source.retrievedAt}; ${source.url ?? 'user-provided document'}`,
    );
  });
  if (plan.runtime.model) lines.push('', `Model: \`${plan.runtime.model}\``);
  if (plan.runtime.responseId) lines.push(`Nebius response ID: \`${plan.runtime.responseId}\``);
  return lines.join('\n');
}

export function planJsonFilename(plan: Plan) {
  return `${safeFilename(plan.title)}.json`;
}

export function planMarkdownFilename(plan: Plan) {
  return `${safeFilename(plan.title)}.md`;
}
