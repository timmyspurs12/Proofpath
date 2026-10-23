import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { usePlanLibrary } from '../context/PlanLibraryContext';
import { PlanView } from '../components/PlanView';
import { EmptyState } from '../components/ui';

export function PlanPage() {
  const { id } = useParams();
  const { currentPlan, plans, openPlan } = usePlanLibrary();
  const savedPlan = plans.find((plan) => plan.id === id);
  const plan = id === 'current' ? currentPlan : currentPlan?.id === id ? currentPlan : savedPlan;

  useEffect(() => {
    if (plan && currentPlan?.id !== plan.id) openPlan(plan);
    // The saved ID is the synchronization boundary; live edits already share context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, plan?.id]);

  if (!plan) {
    return (
      <EmptyState
        icon={<FileQuestion size={30} />}
        title="This plan is not in the workspace"
        action={
          <Link to="/" className="button button-primary button-medium">
            Start a new plan
          </Link>
        }
      >
        <p>
          Unsaved plans disappear after a reload. Open a saved plan from your browser library or
          create a new one.
        </p>
      </EmptyState>
    );
  }
  return <PlanView plan={plan} />;
}
