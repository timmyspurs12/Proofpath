import { Check, Clock3, CloudOff, Radar, X } from 'lucide-react';
import type { PactStatus } from '../../types/weatherpact';
import { STATUS_LABELS } from '../../lib/weather';
import { cn } from '../../lib/utils';

const styles: Record<PactStatus, string> = {
  OPEN: 'border-current/15 bg-current/[0.035] text-current',
  READY_TO_RESOLVE: 'border-teal/25 bg-teal/[0.07] text-teal',
  RESOLVED_YES: 'border-teal/25 bg-teal/[0.08] text-teal',
  RESOLVED_NO: 'border-current/15 bg-current/[0.05] text-current',
  SOURCE_UNAVAILABLE: 'border-coral/30 bg-coral/[0.07] text-[#9B4939]',
};

export function StatusBadge({ status, className }: { status: PactStatus; className?: string }) {
  const Icon =
    status === 'READY_TO_RESOLVE'
      ? Radar
      : status === 'SOURCE_UNAVAILABLE'
        ? CloudOff
        : status === 'RESOLVED_YES'
          ? Check
          : status === 'RESOLVED_NO'
            ? X
            : Clock3;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
        styles[status],
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PreviewLabel({
  inverse = false,
  className,
}: {
  inverse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em]',
        inverse ? 'border-lime/30 bg-lime/10 text-lime' : 'border-current/15 bg-mist text-slate',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', inverse ? 'bg-lime' : 'bg-teal')} />
      Preview record
    </span>
  );
}
