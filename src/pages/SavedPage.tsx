import { useState } from 'react';
import { ArrowRight, FileClock, FolderOpen, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { usePlanLibrary } from '../context/PlanLibraryContext';
import { formatDate, planProgress } from '../lib/utils';
import type { Plan } from '../shared/schemas';
import { Button, ConfirmDialog, EmptyState } from '../components/ui';

type Confirmation = { type: 'delete'; plan: Plan } | { type: 'clear' } | null;

export function SavedPage() {
  const { plans, openPlan, deletePlan, clearPlans } = usePlanLibrary();
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const navigate = useNavigate();

  return (
    <div className="saved-page page-stack">
      <ConfirmDialog
        open={confirmation !== null}
        title={
          confirmation?.type === 'clear' ? 'Clear your saved library?' : 'Delete this saved plan?'
        }
        confirmLabel={confirmation?.type === 'clear' ? 'Clear library' : 'Delete plan'}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation?.type === 'clear') clearPlans();
          if (confirmation?.type === 'delete') deletePlan(confirmation.plan.id);
          setConfirmation(null);
        }}
      >
        {confirmation?.type === 'clear' ? (
          <p>
            Delete all {plans.length} saved {plans.length === 1 ? 'plan' : 'plans'} from this
            browser? Export anything you need first. This cannot be undone.
          </p>
        ) : (
          <p>
            Delete “{confirmation?.plan.title}” from this browser? Exported copies will not be
            affected.
          </p>
        )}
      </ConfirmDialog>

      <div className="page-heading split-heading">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-line" /> Your browser library
          </span>
          <h1>Saved plans</h1>
          <p>Stored only on this device. No account, sync, or server-side copy.</p>
        </div>
        <Link to="/" className="button button-primary button-medium">
          Create a plan <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {plans.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={28} />}
          title="No saved paths yet"
          action={
            <Link to="/" className="button button-secondary button-medium">
              Build your first plan
            </Link>
          }
        >
          <p>
            Generate a plan or open the labelled sample, then choose{' '}
            <strong>Save to this browser</strong>. Your checklist progress will persist here.
          </p>
        </EmptyState>
      ) : (
        <>
          <div className="library-note">
            <span>
              {plans.length} {plans.length === 1 ? 'plan' : 'plans'} saved locally
            </span>
            <Button variant="ghost" size="small" onClick={() => setConfirmation({ type: 'clear' })}>
              Clear library
            </Button>
          </div>
          <div className="saved-grid">
            {plans.map((plan) => {
              const progress = planProgress(plan);
              return (
                <article className="saved-card" key={plan.id}>
                  <button
                    className="saved-card-main"
                    type="button"
                    onClick={() => {
                      openPlan(plan);
                      navigate(`/plans/${plan.id}`);
                    }}
                  >
                    <div className="saved-card-meta">
                      <span className={`mode-dot mode-${plan.runtime.mode}`}>
                        {plan.runtime.mode === 'live' ? 'Live inference' : 'Labelled sample'}
                      </span>
                      <span>Updated {formatDate(plan.updatedAt)}</span>
                    </div>
                    <h2>{plan.title}</h2>
                    <p>{plan.goal}</p>
                    <div className="saved-card-details">
                      <span>{plan.jurisdiction}</span>
                      <span>{plan.sources.length} sources</span>
                      <span>
                        {progress.completed}/{progress.total} complete
                      </span>
                    </div>
                    <div className="progress-track" aria-label={`${progress.percent}% complete`}>
                      <span style={{ width: `${progress.percent}%` }} />
                    </div>
                    <span className="saved-open-cue">
                      Open plan <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </button>
                  <button
                    className="icon-button saved-delete"
                    type="button"
                    aria-label={`Delete ${plan.title}`}
                    onClick={() => setConfirmation({ type: 'delete', plan })}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </div>
          <p className="privacy-footnote">
            <FileClock size={16} aria-hidden="true" /> Export important plans for backup. Browser
            data can be cleared by your browser or device.
          </p>
        </>
      )}
    </div>
  );
}
