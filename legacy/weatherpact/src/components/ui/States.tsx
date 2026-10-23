import { AlertCircle, ArrowUpRight, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded bg-current/[0.07]', className)} aria-hidden="true" />
  );
}

export function PactListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-cloud" aria-label="Loading public pacts" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="grid grid-cols-[1fr_auto] gap-5 px-5 py-5" key={index}>
          <div className="space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-current/10 bg-mist text-teal">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h3 className="font-heading text-lg font-semibold text-current">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div
      className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center"
      role="alert"
    >
      <AlertCircle className="mb-4 h-7 w-7 text-coral" />
      <h3 className="font-heading text-lg font-semibold text-current">The record didn’t arrive</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate">{message}</p>
      {retry && (
        <Button variant="outline" className="mt-5" onClick={retry}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
      )}
    </div>
  );
}

export function InlineLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm font-semibold text-teal hover:text-current"
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </button>
  );
}
