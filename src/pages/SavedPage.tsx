import { ArrowRight, FileClock, FolderOpen, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { usePlanLibrary } from '../context/PlanLibraryContext';
import { formatDate, planProgress } from '../lib/utils';
import { Button, EmptyState } from '../components/ui';

export function SavedPage() {
  const { plans, openPlan, deletePlan, clearPlans } = usePlanLibrary();
  const navigate = useNavigate();

  return (
    <div className="saved-page page-stack">
      <div className="page-heading split-heading">
        <div>
          <span className="eyebrow">Your browser library</span>
          <h1>Saved plans</h1>
          <p>Stored only on this device. No account, sync, or server-side copy.</p>
        </div>
        <Link to="/" className="button button-primary button-medium">
          Create a plan <ArrowRight size={16} />
        </Link>
      </div>
      {plans.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={30} />}
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
            <Button
              variant="ghost"
              size="small"
              onClick={() => {
                if (
                  window.confirm(
                    'Delete every saved plan from this browser? This cannot be undone.',
                  )
                )
                  clearPlans();
              }}
            >
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
                      navigate('/plans/current');
                    }}
                  >
                    <div className="saved-card-meta">
                      <span className={`mode-dot mode-${plan.runtime.mode}`}>
                        {plan.runtime.mode === 'live' ? 'Live inference' : 'Sample'}
                      </span>
                      <span>{formatDate(plan.updatedAt)}</span>
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
                  </button>
                  <button
                    className="icon-button saved-delete"
                    type="button"
                    aria-label={`Delete ${plan.title}`}
                    onClick={() => {
                      if (window.confirm(`Delete “${plan.title}” from this browser?`))
                        deletePlan(plan.id);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              );
            })}
          </div>
          <p className="privacy-footnote">
            <FileClock size={15} /> Export important plans for backup. Browser data can be cleared
            by your browser or device.
          </p>
        </>
      )}
    </div>
  );
}
