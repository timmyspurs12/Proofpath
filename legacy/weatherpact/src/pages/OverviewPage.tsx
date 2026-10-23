import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  FileCheck2,
  MapPin,
  Plus,
  Radar,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PactRow } from '../components/PactRow';
import { buttonStyles } from '../components/ui/Button';
import { ContourArt } from '../components/ui/ContourArt';
import { EmptyState, ErrorState, PactListSkeleton, Skeleton } from '../components/ui/States';
import { PreviewLabel } from '../components/ui/StatusBadge';
import { SourceNote } from '../components/ui/SourceNote';
import { ThresholdRuler } from '../components/ui/ThresholdRuler';
import { useWeatherPact } from '../context/WeatherPactContext';
import {
  formatConditionSentence,
  formatCoordinates,
  formatShortDate,
  getMetric,
} from '../lib/weather';

export function OverviewPage() {
  const { pacts, isLoading, error, refresh, capabilities } = useWeatherPact();
  const ready = pacts.filter((pact) => pact.status === 'READY_TO_RESOLVE');
  const open = pacts.filter((pact) => pact.status === 'OPEN');
  const featured = ready[0];
  const heroPact = pacts.find((pact) => pact.id === 'preview-lagos-rain-20261020') ?? pacts[0];

  return (
    <div className="animate-fade-up">
      <section className="grid overflow-hidden rounded-md border border-current/10 bg-salt shadow-crisp lg:min-h-[400px] lg:grid-cols-[1.08fr_.92fr]">
        <div className="relative flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-12 xl:px-14">
          <div className="mb-5 flex items-center gap-3">
            <span className="h-px w-8 bg-teal" />
            <span className="section-kicker">Public weather claims · GenLayer</span>
          </div>
          <h1 className="max-w-xl font-heading text-[42px] font-semibold leading-[1.06] tracking-[-0.055em] text-current sm:text-[54px] xl:text-[60px]">
            Put the forecast
            <br />
            <span className="text-teal">on record.</span>
          </h1>
          <p className="mt-6 max-w-[500px] text-[15px] leading-7 text-slate">
            State a weather condition clearly. Evaluate it against public historical data. Record
            the outcome through a GenLayer Intelligent Contract.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/create" className={buttonStyles('primary', 'px-5')}>
              <Plus className="h-4 w-4" />
              Create a Pact
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/explorer" className={buttonStyles('ghost', 'px-3')}>
              Explore public pacts
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 flex flex-col gap-3 border-t border-cloud pt-5 sm:flex-row sm:items-center sm:justify-between">
            <SourceNote />
            <span className="text-[10px] text-slate">
              No stakes. No tokens. Just a public record.
            </span>
          </div>
        </div>

        <div className="relative min-h-[360px] overflow-hidden bg-current p-6 text-white sm:p-8">
          <ContourArt inverse className="absolute inset-0 h-full w-full opacity-80" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.17em] text-lime">
                  Atmospheric ledger
                </div>
                <div className="mt-1 font-mono text-[9px] text-white/45">
                  {heroPact
                    ? formatCoordinates(heroPact.location.latitude, heroPact.location.longitude)
                    : 'READING PUBLIC RECORD…'}
                </div>
              </div>
              {heroPact?.isPreview && <PreviewLabel inverse />}
            </div>
            {isLoading && !heroPact ? (
              <div className="my-auto space-y-4">
                <Skeleton className="h-7 w-3/4 bg-white/10" />
                <Skeleton className="h-4 w-1/2 bg-white/10" />
                <Skeleton className="mt-16 h-12 w-full bg-white/10" />
              </div>
            ) : heroPact ? (
              <>
                <div className="my-7">
                  <div className="mb-2 flex items-center gap-2 text-xs text-white/60">
                    <MapPin className="h-3.5 w-3.5 text-lime" />
                    {heroPact.location.name}, {heroPact.location.country}
                    <span>·</span>
                    {formatShortDate(heroPact.targetDate)}
                  </div>
                  <p className="max-w-md font-heading text-[22px] font-medium leading-[1.4] tracking-[-0.025em] text-white">
                    {formatConditionSentence(heroPact)}
                  </p>
                </div>
                <div className="mt-auto">
                  <ThresholdRuler pact={heroPact} inverse />
                </div>
              </>
            ) : (
              <div className="my-auto font-heading text-xl text-white/70">
                The public record is quiet.
              </div>
            )}
            <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
              <span>Forecast locked. Let’s see what the sky says.</span>
              <span className="text-lime">WP / 001</span>
            </div>
          </div>
        </div>
      </section>

      <section
        className="mt-5 grid grid-cols-2 overflow-hidden rounded-md border border-cloud bg-white shadow-crisp lg:grid-cols-4"
        aria-label="Pact status overview"
      >
        <div className="col-span-2 flex items-center justify-between border-b border-cloud px-5 py-4 lg:col-span-1 lg:border-b-0 lg:border-r">
          <div>
            <div className="technical-label">Record status</div>
            <div className="mt-1 text-xs font-semibold text-current">
              {capabilities.mode === 'preview' ? 'Illustrative dataset' : 'Contract dataset'}
            </div>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lime/50 text-current">
            <FileCheck2 className="h-4 w-4" />
          </span>
        </div>
        <div className="border-r border-cloud px-5 py-4">
          <div className="technical-label">Public pacts</div>
          <div className="mt-1 font-mono text-xl text-current">
            {isLoading && !pacts.length ? '—' : String(pacts.length).padStart(2, '0')}
            <span className="ml-2 font-sans text-[10px] font-normal text-slate">
              {capabilities.mode === 'preview' ? 'preview' : 'records'}
            </span>
          </div>
        </div>
        <div className="px-5 py-4 lg:border-r lg:border-cloud">
          <div className="technical-label">Waiting for weather</div>
          <div className="mt-1 font-mono text-xl text-current">
            {isLoading && !pacts.length ? '—' : String(open.length).padStart(2, '0')}
            <span className="ml-2 font-sans text-[10px] font-normal text-slate">open</span>
          </div>
        </div>
        <div className="col-span-2 border-t border-cloud px-5 py-4 lg:col-span-1 lg:border-t-0">
          <div className="technical-label">Ready for the record</div>
          <div className="mt-1 font-mono text-xl text-teal">
            {isLoading && !pacts.length ? '—' : String(ready.length).padStart(2, '0')}
            <span className="ml-2 font-sans text-[10px] font-normal text-slate">to resolve</span>
          </div>
        </div>
      </section>

      {error ? (
        <div className="surface mt-6">
          <ErrorState message={error} retry={() => void refresh()} />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 xl:grid-cols-[.82fr_1.18fr]">
          <section className="surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-cloud px-5 py-4">
              <div>
                <div className="section-kicker">The evidence is in?</div>
                <h2 className="mt-1 font-heading text-lg font-semibold tracking-[-0.025em]">
                  Resolution Desk
                </h2>
              </div>
              <Link
                to="/resolution"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-current/15 text-teal transition-colors hover:bg-current hover:text-white"
                aria-label="Open Resolution Desk"
              >
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            {isLoading && !featured ? (
              <div className="p-5">
                <Skeleton className="h-56 w-full" />
              </div>
            ) : featured ? (
              <div className="relative overflow-hidden p-6">
                <div className="absolute right-0 top-0 h-1 w-20 bg-lime" />
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal">
                    <Radar className="h-4 w-4" />
                    Ready for evaluation
                  </span>
                  {featured.isPreview && <span className="technical-label">Preview</span>}
                </div>
                <Link to={`/pacts/${featured.id}`} className="mt-6 block group">
                  <div className="text-xs text-slate">
                    {featured.location.country} · {formatShortDate(featured.targetDate)}
                  </div>
                  <h3 className="mt-2 font-heading text-2xl font-semibold tracking-[-0.04em] group-hover:text-teal">
                    {featured.location.name}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate">
                    {getMetric(featured.metric).label}{' '}
                    <span className="font-mono text-teal">
                      {featured.comparator === 'gt'
                        ? '>'
                        : featured.comparator === 'gte'
                          ? '≥'
                          : featured.comparator === 'lt'
                            ? '<'
                            : '≤'}{' '}
                      {featured.threshold} {getMetric(featured.metric).unit}
                    </span>
                  </p>
                </Link>
                <div className="my-6 border-t border-dashed border-cloud" />
                <div className="flex items-start gap-3">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                  <p className="text-xs leading-5 text-slate">
                    The target date has passed. The historical record may now be ready for a
                    GenLayer evaluation.
                  </p>
                </div>
                <Link to="/resolution" className={buttonStyles('outline', 'mt-6 w-full')}>
                  Open Resolution Desk
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <EmptyState
                title="Waiting for the weather record"
                description="No target dates have passed in this view. Open pacts will appear here when their evidence window arrives."
              />
            )}
          </section>

          <section className="surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-cloud px-5 py-4">
              <div>
                <div className="section-kicker">Public field notes</div>
                <h2 className="mt-1 font-heading text-lg font-semibold tracking-[-0.025em]">
                  Pact Stream
                </h2>
              </div>
              <Link
                to="/explorer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal hover:text-current"
              >
                View all
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {isLoading && !pacts.length ? (
              <PactListSkeleton rows={4} />
            ) : pacts.length ? (
              <div className="divide-y divide-cloud">
                {pacts.slice(0, 4).map((pact) => (
                  <PactRow key={pact.id} pact={pact} compact />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No pacts found"
                description="The public record is empty. Compose the first clear weather condition."
                action={
                  <Link to="/create" className={buttonStyles('primary')}>
                    Create a Pact
                  </Link>
                }
              />
            )}
          </section>
        </div>
      )}

      <section className="mt-6 flex flex-col gap-5 rounded-md border border-current/10 bg-[#E9EEE7] px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-lime ring-4 ring-lime/25" />
          <div>
            <h2 className="font-heading text-base font-semibold">Your pact has a paper trail.</h2>
            <p className="mt-1 text-xs leading-5 text-slate">
              Condition, public dataset, observed value, and transaction lifecycle—kept distinct and
              inspectable.
            </p>
          </div>
        </div>
        <Link
          to="/create"
          className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-teal hover:text-current"
        >
          Compose a weather challenge
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
