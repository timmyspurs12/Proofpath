import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<FileQuestion size={28} />}
      title="This path has no proof"
      action={
        <Link className="button button-primary button-medium" to="/">
          Start a new plan
        </Link>
      }
    >
      <p>The page may have moved, or an unsaved plan was lost when this tab was reloaded.</p>
    </EmptyState>
  );
}
