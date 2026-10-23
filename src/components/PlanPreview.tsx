import { ArrowRight, ArrowUpRight, CircleHelp, ListChecks, Quote, ShieldCheck } from 'lucide-react';
import { samplePlan } from '../data/sample-plan';
import { formatDate } from '../lib/utils';
import { Button, EvidenceBadge } from './ui';

/** A compact preview composed from the same labelled sample used by the real workspace. */
export function PlanPreview({ onOpen }: { onOpen: () => void }) {
  const evidenceStep = samplePlan.steps[3];
  const citation = evidenceStep.evidence[0];
  const source = samplePlan.sources.find((item) => item.id === citation.sourceId)!;

  return (
    <aside className="hero-preview" aria-label="Labelled sample plan preview">
      <div className="preview-chrome">
        <div className="preview-title">
          <span className="preview-app-icon" aria-hidden="true">
            <ListChecks size={18} />
          </span>
          <div>
            <span>ACTION PLAN</span>
            <strong>{samplePlan.title}</strong>
          </div>
        </div>
        <span className="preview-sample-label">Labelled sample</span>
      </div>

      <div className="preview-context">
        <span>{samplePlan.jurisdiction}</span>
        <span>
          {samplePlan.steps.length} steps · {samplePlan.sources.length} source pages
        </span>
      </div>

      <div className="preview-progress" aria-label="Sample checklist progress">
        <div>
          <span>Checklist progress</span>
          <strong>
            {samplePlan.completedStepIds.length} / {samplePlan.steps.length}
          </strong>
        </div>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: '0%' }} />
        </div>
      </div>

      <ol className="preview-steps">
        {samplePlan.steps.slice(0, 3).map((step) => (
          <li key={step.id}>
            <span className="preview-check" aria-hidden="true" />
            <div>
              <strong>{step.title}</strong>
              <div className="preview-step-meta">
                <EvidenceBadge status={step.status} short />
                {step.dependsOn.length > 0 && <span>After step 1</span>}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="preview-evidence">
        <div className="preview-evidence-heading">
          <span>
            <Quote size={14} aria-hidden="true" /> Supporting passage
          </span>
          <span>{source.id}</span>
        </div>
        <blockquote>“{citation.quote}”</blockquote>
        <div className="preview-source-line">
          <span>
            {source.publisher} · Checked {formatDate(source.retrievedAt)}
          </span>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open the GOV.UK passport renewal source in a new tab"
            >
              Original <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      <div className="preview-open-question">
        <CircleHelp size={16} aria-hidden="true" />
        <div>
          <strong>Uncertainty stays visible</strong>
          <span>{samplePlan.unresolvedQuestions[0].question}</span>
        </div>
      </div>

      <div className="preview-footer">
        <span>
          <ShieldCheck size={15} aria-hidden="true" /> No passage, no “supported” label
        </span>
        <Button variant="ghost" size="small" onClick={onOpen}>
          Open interactive sample <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </aside>
  );
}
