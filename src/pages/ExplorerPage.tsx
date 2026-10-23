import { FilterX, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { PactRow } from '../components/PactRow';
import { buttonStyles } from '../components/ui/Button';
import { EmptyState, ErrorState, PactListSkeleton } from '../components/ui/States';
import { useWeatherPact } from '../context/WeatherPactContext';
import {
  formatConditionSentence,
  getTodayInTimezone,
  METRICS,
  STATUS_LABELS,
} from '../lib/weather';
import type { PactStatus, WeatherMetric } from '../types/weatherpact';

type DateFilter = 'all' | 'upcoming' | 'passed' | 'this-month';
type SortMode = 'newest' | 'earliest' | 'resolved';

export function ExplorerPage() {
  const { pacts, isLoading, error, refresh, capabilities } = useWeatherPact();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | PactStatus>('all');
  const [metric, setMetric] = useState<'all' | WeatherMetric>('all');
  const [date, setDate] = useState<DateFilter>('all');
  const [sort, setSort] = useState<SortMode>('newest');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pacts
      .filter((pact) => {
        const searchText =
          `${pact.location.name} ${pact.location.country ?? ''} ${formatConditionSentence(pact)}`.toLowerCase();
        if (query && !searchText.includes(query)) return false;
        if (status !== 'all' && pact.status !== status) return false;
        if (metric !== 'all' && pact.metric !== metric) return false;
        const today = getTodayInTimezone(pact.location.timezone);
        if (date === 'upcoming' && pact.targetDate < today) return false;
        if (date === 'passed' && pact.targetDate >= today) return false;
        if (date === 'this-month' && pact.targetDate.slice(0, 7) !== today.slice(0, 7))
          return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === 'earliest') return a.targetDate.localeCompare(b.targetDate);
        if (sort === 'resolved') {
          const aTime = a.evidence.resolvedAt ?? '';
          const bTime = b.evidence.resolvedAt ?? '';
          return bTime.localeCompare(aTime) || b.createdAt.localeCompare(a.createdAt);
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [pacts, search, status, metric, date, sort]);

  const hasFilters = Boolean(search || status !== 'all' || metric !== 'all' || date !== 'all');
  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setMetric('all');
    setDate('all');
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Public atmospheric ledger"
        title="Pact Explorer"
        description="Search clear weather conditions, inspect their target dates, and follow each claim toward its evidence record."
        actions={
          <Link to="/create" className={buttonStyles('primary')}>
            <Plus className="h-4 w-4" />
            Create a Pact
          </Link>
        }
      />

      <section className="surface mb-5 p-4" aria-label="Filter public pacts">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.5fr)_repeat(3,minmax(140px,.7fr))]">
          <label className="relative block">
            <span className="sr-only">Search by location or pact condition</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="field-input pl-10 pr-9"
              placeholder="Search Lagos, rainfall, temperature…"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-slate hover:bg-mist hover:text-current"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select
              className="field-select"
              value={status}
              onChange={(event) => setStatus(event.target.value as 'all' | PactStatus)}
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by weather metric</span>
            <select
              className="field-select"
              value={metric}
              onChange={(event) => setMetric(event.target.value as 'all' | WeatherMetric)}
            >
              <option value="all">All metrics</option>
              {METRICS.map((item) => (
                <option value={item.value} key={item.value}>
                  {item.shortLabel}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by target date</span>
            <select
              className="field-select"
              value={date}
              onChange={(event) => setDate(event.target.value as DateFilter)}
            >
              <option value="all">Any target date</option>
              <option value="upcoming">Today & upcoming</option>
              <option value="passed">Target date passed</option>
              <option value="this-month">This local month</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-cloud pt-3">
          <div className="flex items-center gap-2 text-[11px] text-slate">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>
              {isLoading
                ? 'Reading record…'
                : `${filtered.length} ${filtered.length === 1 ? 'pact' : 'pacts'} in this view`}
            </span>
            {capabilities.mode === 'preview' && (
              <span className="font-mono text-[9px] uppercase tracking-wider">· Preview only</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate hover:text-current"
              >
                <FilterX className="h-3.5 w-3.5" />
                Clear filters
              </button>
            )}
            <label className="flex items-center gap-2 text-xs text-slate">
              Sort<span className="sr-only">pacts</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                className="rounded border border-current/15 bg-white px-2 py-1.5 text-xs text-current outline-none focus:border-teal"
              >
                <option value="newest">Newest created</option>
                <option value="earliest">Earliest target date</option>
                <option value="resolved">Recently resolved</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="surface overflow-hidden" aria-live="polite">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(180px,.9fr)_auto] gap-4 border-b border-cloud bg-mist/50 px-5 py-3 technical-label sm:grid">
          <span>Place & condition</span>
          <span>Target & creator</span>
          <span>Status</span>
        </div>
        {isLoading && !pacts.length ? (
          <PactListSkeleton rows={6} />
        ) : error ? (
          <ErrorState message={error} retry={() => void refresh()} />
        ) : filtered.length ? (
          <div className="divide-y divide-cloud">
            {filtered.map((pact) => (
              <PactRow key={pact.id} pact={pact} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={pacts.length ? 'No pacts match this view' : 'No pacts found'}
            description={
              pacts.length
                ? 'Try widening the date or clearing a filter. The underlying public record is unchanged.'
                : 'There are no public pacts to show yet. A clearly stated condition is a good place to begin.'
            }
            action={
              hasFilters ? (
                <button onClick={clearFilters} className={buttonStyles('outline')}>
                  <FilterX className="h-4 w-4" />
                  Clear all filters
                </button>
              ) : (
                <Link to="/create" className={buttonStyles('primary')}>
                  Create a Pact
                </Link>
              )
            }
          />
        )}
      </section>
      <p className="mt-4 text-[10px] leading-5 text-slate">
        Preview records are isolated layout examples. They are not contract records and do not
        contribute to reputation or resolved-pact statistics.
      </p>
    </div>
  );
}
