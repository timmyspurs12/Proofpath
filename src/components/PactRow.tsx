import { ArrowUpRight, CalendarDays, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Pact } from '../types/weatherpact';
import { formatCompactCondition, formatShortDate, shortenAddress } from '../lib/weather';
import { cn } from '../lib/utils';
import { StatusBadge } from './ui/StatusBadge';

export function PactRow({ pact, compact = false }: { pact: Pact; compact?: boolean }) {
  return (
    <Link
      to={`/pacts/${pact.id}`}
      className={cn(
        'group grid gap-4 px-5 transition-colors hover:bg-mist/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal sm:grid-cols-[minmax(0,1.4fr)_minmax(180px,.9fr)_auto] sm:items-center',
        compact ? 'py-4' : 'py-5',
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 font-heading text-sm font-semibold text-current">
            <MapPin className="h-3.5 w-3.5 text-teal" />
            {pact.location.name}
            <span className="font-sans font-normal text-slate">, {pact.location.country}</span>
          </span>
          {pact.isPreview && (
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate">
              Preview
            </span>
          )}
        </div>
        <div className="mt-2 font-mono text-xs text-teal">{formatCompactCondition(pact)}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate sm:hidden">
          <span>{formatShortDate(pact.targetDate)}</span>
          <span>
            Creator {pact.creatorAddress ? shortenAddress(pact.creatorAddress) : 'illustrative'}
          </span>
        </div>
      </div>
      <div className="hidden min-w-0 sm:block">
        <div className="flex items-center gap-1.5 text-xs text-current">
          <CalendarDays className="h-3.5 w-3.5 text-slate" />
          {formatShortDate(pact.targetDate)}
        </div>
        <div className="mt-2 truncate text-[10px] text-slate">
          {pact.prediction === 'YES' ? 'Creator predicts yes' : 'Creator predicts no'} ·{' '}
          {pact.creatorAddress ? shortenAddress(pact.creatorAddress) : 'Illustrative creator'}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <StatusBadge status={pact.status} />
        <ArrowUpRight className="hidden h-4 w-4 text-slate transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-teal sm:block" />
      </div>
    </Link>
  );
}
