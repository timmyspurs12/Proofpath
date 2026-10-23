import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  GitBranch,
  Link2,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  VerifySourcesResponseSchema,
  type Plan,
  type PlanStep,
  type Source,
} from '../shared/schemas';
import { usePlanLibrary } from '../context/PlanLibraryContext';
import { apiFetch, ApiError } from '../lib/api';
import { downloadText, formatDate, planProgress, safeFilename, supportedCount } from '../lib/utils';
import { planJsonFilename, planMarkdownFilename, planToMarkdown } from '../lib/export';
import { Alert, Button, ConfirmDialog, EvidenceBadge, Toast } from './ui';

interface StepDraft {
  title: string;
  instruction: string;
  completionCriteria: string;
  dueDate: string;
}

function draftFor(step: PlanStep): StepDraft {
  return {
    title: step.title,
    instruction: step.instruction,
    completionCriteria: step.completionCriteria,
    dueDate: step.dueDate ?? '',
  };
}

function SourceCard({ source, check }: { source: Source; check?: Plan['sourceChecks'][number] }) {
  return (
    <article className="source-card" id={`source-${source.id}`}>
      <div className="source-card-top">
        <span className="source-index">{source.id}</span>
        <span className={`authority-label authority-${source.authority}`}>
          {source.authority === 'official'
            ? 'Official-domain signal'
            : source.authority === 'user'
              ? 'User supplied'
              : 'Publisher page'}
        </span>
      </div>
      <h3>{source.title}</h3>
      <p>{source.publisher}</p>
      <dl className="source-meta">
        <div>
          <dt>Retrieved</dt>
          <dd>{formatDate(source.retrievedAt, true)}</dd>
        </div>
        {source.publishedAt && (
          <div>
            <dt>Published</dt>
            <dd>{source.publishedAt}</dd>
          </div>
        )}
        <div>
          <dt>Snapshot</dt>
          <dd>
            <code>{source.contentHash.slice(0, 10)}…</code>
          </dd>
        </div>
      </dl>
      {source.stale && (
        <span className="stale-label">
          <Clock3 size={13} /> Older publication date — recheck
        </span>
      )}
      {source.url ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="source-link">
          Open original <ExternalLink size={13} />
        </a>
      ) : (
        <span className="source-link muted">Local upload · no remote URL</span>
      )}
      <details className="source-excerpt">
        <summary>
          Inspect source excerpt <ChevronDown size={13} />
        </summary>
        <p>{source.excerpt}</p>
      </details>
      {check && (
        <div className={`source-check check-${check.status}`} role="status">
          <strong>
            {check.status === 'unchanged'
              ? 'Unchanged'
              : check.status === 'changed'
                ? 'Changed'
                : check.status === 'unavailable'
                  ? 'Unavailable'
                  : 'Not checkable'}
          </strong>
          <p>{check.detail}</p>
          <span>{formatDate(check.checkedAt, true)}</span>
        </div>
      )}
    </article>
  );
}

export function PlanView({ plan }: { plan: Plan }) {
  const navigate = useNavigate();
  const { currentIsSaved, updateCurrentPlan, saveCurrentPlan } = usePlanLibrary();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, StepDraft>>({});
  const [checking, setChecking] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const progress = planProgress(plan);
  const supported = supportedCount(plan);

  function updatePlan(next: Plan) {
    updateCurrentPlan({ ...next, updatedAt: new Date().toISOString() }, currentIsSaved);
  }

  function toggleStep(id: string) {
    const completed = plan.completedStepIds.includes(id)
      ? plan.completedStepIds.filter((stepId) => stepId !== id)
      : [...plan.completedStepIds, id];
    updatePlan({ ...plan, completedStepIds: completed });
  }

  function startEditing() {
    setDrafts(Object.fromEntries(plan.steps.map((step) => [step.id, draftFor(step)])));
    setEditing(true);
    setError(null);
  }

  function saveStep(step: PlanStep) {
    const draft = drafts[step.id];
    if (
      !draft ||
      !draft.title.trim() ||
      !draft.instruction.trim() ||
      !draft.completionCriteria.trim()
    ) {
      setError('Each step needs a title, instruction, and completion criterion.');
      return;
    }
    const factualEdit =
      draft.title !== step.title ||
      draft.instruction !== step.instruction ||
      draft.dueDate !== (step.dueDate ?? '');
    const notes =
      factualEdit && step.status === 'supported'
        ? [
            ...step.notes,
            'Edited by you; automatic source support was withdrawn for review.',
          ].slice(0, 5)
        : step.notes;
    const nextSteps = plan.steps.map((entry) =>
      entry.id === step.id
        ? {
            ...entry,
            title: draft.title.trim(),
            instruction: draft.instruction.trim(),
            completionCriteria: draft.completionCriteria.trim(),
            dueDate: draft.dueDate.trim() || null,
            status: factualEdit ? ('inferred' as const) : entry.status,
            userEdited:
              entry.userEdited ||
              factualEdit ||
              draft.completionCriteria !== entry.completionCriteria,
            notes,
          }
        : entry,
    );
    updatePlan({ ...plan, steps: nextSteps });
    setDrafts((current) => ({
      ...current,
      [step.id]: draftFor(nextSteps.find((entry) => entry.id === step.id)!),
    }));
    setToast(
      factualEdit
        ? 'Step saved. Its evidence status is now “Inferred — confirm”.'
        : 'Step updated.',
    );
  }

  function deleteStep(id: string) {
    const steps = plan.steps
      .filter((step) => step.id !== id)
      .map((step) => ({
        ...step,
        dependsOn: step.dependsOn.filter((dependency) => dependency !== id),
      }));
    if (!steps.length) {
      setError('A plan must keep at least one step.');
      return;
    }
    updatePlan({
      ...plan,
      steps,
      completedStepIds: plan.completedStepIds.filter((stepId) => stepId !== id),
      conflicts: plan.conflicts
        .filter((conflict) => conflict.stepIds.some((stepId) => stepId !== id))
        .map((conflict) => ({
          ...conflict,
          stepIds: conflict.stepIds.filter((stepId) => stepId !== id),
        })),
    });
  }

  function addStep() {
    if (plan.steps.length >= 20) {
      setError('A plan can contain at most 20 steps.');
      return;
    }
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    const step: PlanStep = {
      id,
      title: 'Your custom step',
      instruction: 'Describe what you need to do.',
      completionCriteria: 'Describe the observable result that completes this step.',
      status: 'inferred',
      evidence: [],
      dueDate: null,
      dependsOn: plan.steps.length ? [plan.steps[plan.steps.length - 1].id] : [],
      userEdited: true,
      notes: ['Added by you; no source support is claimed.'],
    };
    updatePlan({ ...plan, steps: [...plan.steps, step] });
    setDrafts((current) => ({ ...current, [id]: draftFor(step) }));
  }

  function saveLibrary() {
    const saved = saveCurrentPlan();
    if (saved) {
      setToast('Plan saved to this browser.');
      navigate(`/plans/${saved.id}`, { replace: true });
    }
  }

  async function recheckSources() {
    setChecking(true);
    setError(null);
    try {
      const result = await apiFetch(
        '/api/sources/verify',
        VerifySourcesResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify({
            sources: plan.sources.map((source) => ({
              id: source.id,
              url: source.url,
              contentHash: source.contentHash,
            })),
          }),
        },
        30_000,
      );
      updatePlan({ ...plan, sourceChecks: result.checks });
      setToast('Source recheck complete. Review any changed or unavailable sources.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Sources could not be rechecked.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="plan-page">
      {toast && <Toast onClose={() => setToast(null)}>{toast}</Toast>}
      <ConfirmDialog
        open={stepToDelete !== null}
        title="Delete this step?"
        confirmLabel="Delete step"
        onCancel={() => setStepToDelete(null)}
        onConfirm={() => {
          if (stepToDelete) deleteStep(stepToDelete);
          setStepToDelete(null);
        }}
      >
        <p>
          The step will be removed from this plan. Other steps will remain, and this prerequisite
          will be removed from their dependency lists.
        </p>
      </ConfirmDialog>
      <div className="plan-breadcrumb no-print">
        <button type="button" onClick={() => navigate('/saved')}>
          <ArrowLeft size={15} /> Saved plans
        </button>
        <span>/</span>
        <span>{plan.runtime.mode === 'sample' ? 'Labelled sample' : 'Live plan'}</span>
      </div>
      <header className="plan-header">
        <div>
          <div className="plan-labels">
            <span className={`runtime-badge runtime-${plan.runtime.mode}`}>
              {plan.runtime.mode === 'live' ? (
                <>
                  <span className="live-dot" /> Live Nebius inference
                </>
              ) : (
                'Sample · not generated live'
              )}
            </span>
            <span>{plan.jurisdiction}</span>
            <span>{plan.category}</span>
          </div>
          <h1>{plan.title}</h1>
          <p>{plan.goal}</p>
        </div>
      </header>

      {plan.runtime.mode === 'sample' && (
        <Alert tone="info" title="Interface sample — not a live AI result">
          This hand-authored example uses short passages read from the linked GOV.UK pages on
          October 23, 2026. It demonstrates inspection and editing; it does not demonstrate Nebius
          inference or source rechecking.
        </Alert>
      )}
      {plan.warnings.length > 0 && plan.runtime.mode === 'live' && (
        <Alert tone="warning" title="Review before acting">
          <ul className="inline-list">
            {plan.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="plan-toolbar no-print">
        <div className="toolbar-group" role="group" aria-label="Plan actions">
          <span className="toolbar-label">PLAN</span>
          <Button
            variant={editing ? 'primary' : 'secondary'}
            size="small"
            onClick={() => (editing ? setEditing(false) : startEditing())}
          >
            {editing ? (
              <>
                <Check size={15} /> Finish editing
              </>
            ) : (
              <>
                <Pencil size={15} /> Edit plan
              </>
            )}
          </Button>
          <Button
            variant={currentIsSaved ? 'secondary' : 'primary'}
            size="small"
            onClick={saveLibrary}
          >
            <Save size={15} /> {currentIsSaved ? 'Save changes' : 'Save to browser'}
          </Button>
        </div>
        <div className="toolbar-group" role="group" aria-label="Export plan">
          <span className="toolbar-label">EXPORT</span>
          <Button
            variant="ghost"
            size="small"
            onClick={() =>
              downloadText(planMarkdownFilename(plan), planToMarkdown(plan), 'text/markdown')
            }
          >
            <FileText size={15} /> Markdown
          </Button>
          <Button
            variant="ghost"
            size="small"
            onClick={() =>
              downloadText(
                planJsonFilename(plan),
                JSON.stringify(plan, null, 2),
                'application/json',
              )
            }
          >
            <FileJson size={15} /> JSON
          </Button>
          <Button variant="ghost" size="small" onClick={() => window.print()}>
            <Printer size={15} /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="progress-panel">
        <div className="progress-summary">
          <span>Checklist progress</span>
          <strong>
            {progress.completed} of {progress.total} complete
          </strong>
        </div>
        <div
          className="progress-track large"
          role="progressbar"
          aria-label="Plan completion"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <span className="progress-percent">{progress.percent}%</span>
        <div className="progress-evidence">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>
            <strong>{supported}</strong> of {plan.steps.length} steps source-supported
          </span>
        </div>
      </div>

      <div className="plan-layout">
        <div className="plan-main">
          <section aria-labelledby="steps-heading" className="steps-section">
            <div className="section-heading">
              <div>
                <span className="step-kicker">YOUR ACTION PATH</span>
                <h2 id="steps-heading">In order, with the proof attached</h2>
              </div>
              {editing && (
                <Button variant="ghost" size="small" onClick={addStep}>
                  <Plus size={15} /> Add step
                </Button>
              )}
            </div>
            <div className="step-list">
              {plan.steps.map((step, index) => {
                const complete = plan.completedStepIds.includes(step.id);
                const draft = drafts[step.id];
                const dependencies = step.dependsOn.flatMap((dependencyId) => {
                  const dependencyIndex = plan.steps.findIndex(
                    (entry) => entry.id === dependencyId,
                  );
                  if (dependencyIndex < 0) return [];
                  return [
                    {
                      number: dependencyIndex + 1,
                      title: plan.steps[dependencyIndex].title,
                    },
                  ];
                });
                return (
                  <article
                    id={`step-${step.id}`}
                    className={`action-step ${complete ? 'step-complete' : ''}`}
                    key={step.id}
                  >
                    <div className="step-rail">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <div />
                    </div>
                    <div className="step-card">
                      <div className="step-card-header">
                        {!editing && (
                          <button
                            type="button"
                            className={`check-button ${complete ? 'checked' : ''}`}
                            onClick={() => toggleStep(step.id)}
                            aria-label={`${complete ? 'Mark incomplete' : 'Mark complete'}: ${step.title}`}
                            aria-pressed={complete}
                          >
                            {complete && <Check size={17} />}
                          </button>
                        )}
                        <div className="step-title-wrap">
                          {editing && draft ? (
                            <input
                              aria-label={`Title for step ${index + 1}`}
                              value={draft.title}
                              maxLength={240}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [step.id]: { ...draft, title: event.target.value },
                                }))
                              }
                            />
                          ) : (
                            <h3>{step.title}</h3>
                          )}
                          <div className="step-badges">
                            <EvidenceBadge status={step.status} />
                            {step.userEdited && <span className="edited-badge">Edited by you</span>}
                          </div>
                        </div>
                        {editing && (
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`Delete step ${index + 1}`}
                            onClick={() => setStepToDelete(step.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div className="step-body">
                        {editing && draft ? (
                          <div className="edit-fields">
                            <label>
                              Instruction
                              <textarea
                                rows={4}
                                maxLength={1500}
                                value={draft.instruction}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [step.id]: { ...draft, instruction: event.target.value },
                                  }))
                                }
                              />
                            </label>
                            <label>
                              Done when
                              <textarea
                                rows={2}
                                maxLength={700}
                                value={draft.completionCriteria}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [step.id]: { ...draft, completionCriteria: event.target.value },
                                  }))
                                }
                              />
                            </label>
                            <label>
                              Date or deadline{' '}
                              <span>(optional; editing removes supported status)</span>
                              <input
                                value={draft.dueDate}
                                maxLength={100}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [step.id]: { ...draft, dueDate: event.target.value },
                                  }))
                                }
                              />
                            </label>
                            <Button size="small" onClick={() => saveStep(step)}>
                              Save step
                            </Button>
                          </div>
                        ) : (
                          <>
                            <p className="step-instruction">{step.instruction}</p>
                            {dependencies.length > 0 && (
                              <div className="step-dependencies">
                                <GitBranch size={15} aria-hidden="true" />
                                <div>
                                  <span>
                                    {dependencies.length === 1 ? 'Prerequisite' : 'Prerequisites'}
                                  </span>
                                  <p>
                                    {dependencies
                                      .map(
                                        (dependency) =>
                                          `Step ${dependency.number} — ${dependency.title}`,
                                      )
                                      .join(' · ')}
                                  </p>
                                </div>
                              </div>
                            )}
                            <div className="completion-criteria">
                              <CheckCircle2 size={16} />
                              <div>
                                <span>Done when</span>
                                <p>{step.completionCriteria}</p>
                              </div>
                            </div>
                            {step.dueDate && (
                              <div className="due-date">
                                <Clock3 size={15} /> {step.dueDate}
                              </div>
                            )}
                          </>
                        )}
                        {step.notes.length > 0 && (
                          <div className="step-notes">
                            {step.notes.map((note) => (
                              <p key={note}>
                                <CircleHelp size={14} />
                                {note}
                              </p>
                            ))}
                          </div>
                        )}
                        {step.evidence.length > 0 && (
                          <div className="evidence-list">
                            {step.evidence.map((citation, citationIndex) => {
                              const source = plan.sources.find(
                                (entry) => entry.id === citation.sourceId,
                              );
                              return (
                                <details
                                  className="evidence-detail"
                                  key={`${citation.sourceId}-${citationIndex}`}
                                >
                                  <summary>
                                    <Link2 size={14} /> Evidence from {citation.sourceId}
                                    <span>{source?.publisher}</span>
                                    <ChevronDown size={14} />
                                  </summary>
                                  <div>
                                    <blockquote>“{citation.quote}”</blockquote>
                                    {source && (
                                      <div className="evidence-source-meta">
                                        <span>{source.publisher}</span>
                                        <span>
                                          Retrieved {formatDate(source.retrievedAt, true)}
                                        </span>
                                      </div>
                                    )}
                                    <p className="evidence-limitation">
                                      The passage is matched exactly. Authority, freshness, and
                                      interpretation still require your review.
                                    </p>
                                    <div className="evidence-links">
                                      <a href={`#source-${citation.sourceId}`}>
                                        Source record <Link2 size={13} aria-hidden="true" />
                                      </a>
                                      {source?.url && (
                                        <a
                                          href={source.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          Inspect original source{' '}
                                          <ExternalLink size={13} aria-hidden="true" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </details>
                              );
                            })}
                          </div>
                        )}
                        {!editing && step.status === 'unverifiable' && (
                          <p className="unverified-note">
                            This is a model-generated suggestion without a verified supporting
                            passage. Confirm it independently before acting.
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {plan.conflicts.length > 0 && (
            <section className="conflict-section" aria-labelledby="conflicts-heading">
              <span className="step-kicker">CONFLICTS TO RESOLVE</span>
              <h2 id="conflicts-heading">Do not choose a version silently</h2>
              <p>
                Nemotron flagged these cited passages as conflicting. The quotes are validated; the
                interpretation still needs your review.
              </p>
              {plan.conflicts.map((conflict) => {
                const conflictSources = conflict.evidence
                  .flatMap((citation) => {
                    const source = plan.sources.find((entry) => entry.id === citation.sourceId);
                    return source ? [source] : [];
                  })
                  .filter(
                    (source, index, sources) =>
                      sources.findIndex((entry) => entry.id === source.id) === index,
                  );
                return (
                  <article className="conflict-card" key={conflict.id}>
                    <h3>{conflict.topic}</h3>
                    <p>{conflict.detail}</p>
                    <div className="conflict-quotes">
                      {conflict.evidence.map((citation, index) => {
                        const source = plan.sources.find((entry) => entry.id === citation.sourceId);
                        return (
                          <blockquote key={`${citation.sourceId}-${index}`}>
                            <span>
                              {citation.sourceId} ·{' '}
                              {source?.publisher ?? 'Source record unavailable'}
                            </span>
                            <p>“{citation.quote}”</p>
                            {source && (
                              <small>Retrieved {formatDate(source.retrievedAt, true)}</small>
                            )}
                          </blockquote>
                        );
                      })}
                    </div>
                    <div className="conflict-next-step">
                      <strong>Safe next step</strong>
                      <p>
                        Do not act on either version until you have compared the current original
                        publications or asked the responsible publisher.
                      </p>
                      {conflictSources.some((source) => source.url) && (
                        <div>
                          {conflictSources.map((source) =>
                            source.url ? (
                              <a
                                key={source.id}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Recheck {source.id} <ExternalLink size={13} aria-hidden="true" />
                              </a>
                            ) : null,
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          {plan.unresolvedQuestions.length > 0 && (
            <section className="questions-section" aria-labelledby="questions-heading">
              <span className="step-kicker">STILL UNRESOLVED</span>
              <h2 id="questions-heading">Questions, not guesses</h2>
              {plan.unresolvedQuestions.map((question) => (
                <div className="question-row" key={question.id}>
                  <CircleHelp size={19} />
                  <div>
                    <h3>{question.question}</h3>
                    <p>{question.reason}</p>
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>

        <aside className="sources-sidebar" aria-labelledby="sources-heading">
          <div className="sources-heading">
            <div>
              <span className="step-kicker">SOURCE LEDGER</span>
              <h2 id="sources-heading">
                {plan.sources.length} {plan.sources.length === 1 ? 'source' : 'sources'}
              </h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <p className="sources-explainer">
            A supported label means the exact passage exists. It is not a guarantee of authority,
            freshness, or correct interpretation.
          </p>
          {plan.runtime.mode === 'live' && (
            <Button
              variant="secondary"
              size="small"
              loading={checking}
              onClick={() => void recheckSources()}
            >
              <RefreshCw size={14} /> Recheck sources now
            </Button>
          )}
          <div className="source-list">
            {plan.sources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                check={plan.sourceChecks.find((check) => check.sourceId === source.id)}
              />
            ))}
          </div>
          <details className="runtime-receipt">
            <summary>
              Runtime receipt <ChevronDown size={14} />
            </summary>
            <dl>
              <div>
                <dt>Mode</dt>
                <dd>{plan.runtime.mode === 'live' ? 'Live API response' : 'Static sample'}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{plan.runtime.provider === 'nebius' ? 'Nebius Token Factory' : 'None'}</dd>
              </div>
              {plan.runtime.model && (
                <div>
                  <dt>Model</dt>
                  <dd>
                    <code>{plan.runtime.model}</code>
                  </dd>
                </div>
              )}
              {plan.runtime.responseId && (
                <div>
                  <dt>Response ID</dt>
                  <dd>
                    <code>{plan.runtime.responseId}</code>
                  </dd>
                </div>
              )}
              {plan.runtime.latencyMs !== null && (
                <div>
                  <dt>Model latency</dt>
                  <dd>{(plan.runtime.latencyMs / 1000).toFixed(1)} s</dd>
                </div>
              )}
              {plan.runtime.usage && (
                <div>
                  <dt>Tokens</dt>
                  <dd>
                    {plan.runtime.usage.inputTokens} in · {plan.runtime.usage.outputTokens} out
                  </dd>
                </div>
              )}
              <div>
                <dt>Retrieval</dt>
                <dd>
                  {plan.runtime.retrieval.directFetches} direct ·{' '}
                  {plan.runtime.retrieval.tavilyCalls} Tavily
                </dd>
              </div>
              {plan.runtime.retrieval.tavilyRequestIds.map((id) => (
                <div key={id}>
                  <dt>Tavily ID</dt>
                  <dd>
                    <code>{id}</code>
                  </dd>
                </div>
              ))}
            </dl>
          </details>
          <div className="export-note no-print">
            <Download size={15} />
            <p>
              Need a backup? Export{' '}
              <button
                onClick={() =>
                  downloadText(
                    `${safeFilename(plan.title)}.md`,
                    planToMarkdown(plan),
                    'text/markdown',
                  )
                }
              >
                Markdown with evidence
              </button>{' '}
              before clearing browser data.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
