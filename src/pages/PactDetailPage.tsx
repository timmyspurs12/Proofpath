import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CloudOff,
  ExternalLink,
  FileSearch,
  MapPin,
  Minus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ConnectionRequirements } from '../components/ConnectionRequirements';
import { buttonStyles } from '../components/ui/Button';
import { CopyButton } from '../components/ui/CopyButton';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { PreviewLabel, StatusBadge } from '../components/ui/StatusBadge';
import { SourceNote } from '../components/ui/SourceNote';
import { ThresholdRuler } from '../components/ui/ThresholdRuler';
import { SOURCE_DISCLOSURE, config } from '../config';
import { useWeatherPact } from '../context/WeatherPactContext';
import {
  formatConditionSentence,
  formatCoordinates,
  formatDate,
  formatTimestamp,
  getComparator,
  getMetric,
  shortenAddress,
} from '../lib/weather';

function Unavailable() {
  return <span className="text-slate/70">Unavailable</span>;
}

function HashValue({ value }: { value: string | null }) {
  if (!value) return <Unavailable />;
  const href = config.explorerUrl ? `${config.explorerUrl}/tx/${encodeURIComponent(value)}` : null;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="truncate font-mono text-xs text-teal hover:underline"
        >
          {shortenAddress(value)}
          <ExternalLink className="ml-1 inline h-3 w-3" />
        </a>
      ) : (
        <span className="truncate font-mono text-xs text-current">{shortenAddress(value)}</span>
      )}
      <CopyButton value={value} label="Copy" className="shrink-0" />
    </span>
  );
}

export function PactDetailPage() {
  const { id = '' } = useParams();
  const { getPact, isLoading, error, refresh } = useWeatherPact();
  const pact = getPact(id);

  if (isLoading && !pact) {
    return (
      <div className="space-y-5" aria-busy="true">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
          <Skeleton className="h-[480px]" />
          <Skeleton className="h-[480px]" />
        </div>
      </div>
    );
  }
  if (error && !pact)
    return (
      <div className="surface">
        <ErrorState message={error} retry={() => void refresh()} />
      </div>
    );
  if (!pact) {
    return (
      <div className="surface">
        <EmptyState
          title="This pact isn’t in the record"
          description="The identifier may be wrong, or the public record has not loaded this pact. No chain result is being assumed."
          action={
            <Link to="/explorer" className={buttonStyles('outline')}>
              <ArrowLeft className="h-4 w-4" />
              Back to Explorer
            </Link>
          }
          icon={<FileSearch className="h-5 w-5" />}
        />
      </div>
    );
  }

  const metric = getMetric(pact.metric);
  const comparator = getComparator(pact.comparator);
  const isResolved = pact.status === 'RESOLVED_YES' || pact.status === 'RESOLVED_NO';
  const actualResult =
    pact.status === 'RESOLVED_YES' ? 'YES' : pact.status === 'RESOLVED_NO' ? 'NO' : null;
  const predictionMatched = actualResult ? actualResult === pact.prediction : null;

  return (
    <div className="animate-fade-up">
      <Link
        to="/explorer"
        className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-slate transition-colors hover:text-teal"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Pact Explorer
      </Link>
      <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="max-w-4xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={pact.status} />
            {pact.isPreview && <PreviewLabel />}
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate">
              Record {pact.id}
            </span>
          </div>
          <h1 className="font-heading text-2xl font-semibold leading-[1.35] tracking-[-0.04em] text-current sm:text-[32px]">
            {formatConditionSentence(pact)}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-teal" />
              {pact.location.name}, {pact.location.country}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-teal" />
              {formatDate(pact.targetDate)} · local date
            </span>
          </div>
        </div>
        {pact.status === 'READY_TO_RESOLVE' && (
          <Link to="/resolution" className={buttonStyles('primary', 'shrink-0')}>
            Resolution Desk
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      {pact.isPreview && (
        <div className="mb-5 rounded-[4px] border border-[#CDD9A4] bg-[#EFF4D8] px-4 py-3 text-xs leading-5 text-current">
          <strong>Illustrative preview record.</strong> This is not a chain result. Empty evidence
          and transaction fields are intentionally shown as unavailable.
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <div className="space-y-6">
          <section className="surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-cloud px-5 py-4 sm:px-6">
              <div>
                <div className="section-kicker">The stated condition</div>
                <h2 className="mt-1 font-heading text-lg font-semibold">Measurement field</h2>
              </div>
              <span className="font-mono text-[9px] text-slate">LOCAL / {pact.targetDate}</span>
            </div>
            <div className="grid md:grid-cols-[1fr_240px]">
              <dl className="grid grid-cols-2 gap-x-5 gap-y-6 p-5 sm:p-6">
                <div className="col-span-2">
                  <dt className="technical-label">Place</dt>
                  <dd className="mt-1.5 text-sm font-medium">
                    {pact.location.name}
                    {pact.location.admin1 ? `, ${pact.location.admin1}` : ''},{' '}
                    {pact.location.country}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="technical-label">Coordinates</dt>
                  <dd className="mt-1.5 font-mono text-xs text-teal">
                    {formatCoordinates(pact.location.latitude, pact.location.longitude)}
                  </dd>
                </div>
                <div>
                  <dt className="technical-label">Timezone</dt>
                  <dd className="mt-1.5 font-mono text-xs">{pact.location.timezone}</dd>
                </div>
                <div>
                  <dt className="technical-label">Target local date</dt>
                  <dd className="mt-1.5 text-xs font-medium">{formatDate(pact.targetDate)}</dd>
                </div>
                <div>
                  <dt className="technical-label">Metric</dt>
                  <dd className="mt-1.5 text-xs font-medium">{metric.label}</dd>
                </div>
                <div>
                  <dt className="technical-label">Comparator</dt>
                  <dd className="mt-1.5 text-xs font-medium">
                    {comparator.symbol} · {comparator.label}
                  </dd>
                </div>
                <div>
                  <dt className="technical-label">Threshold</dt>
                  <dd className="mt-1.5 font-mono text-sm text-teal">
                    {pact.threshold} {metric.unit}
                  </dd>
                </div>
                <div>
                  <dt className="technical-label">Creator prediction</dt>
                  <dd className="mt-1.5 font-heading text-sm font-semibold">{pact.prediction}</dd>
                </div>
              </dl>
              <div className="flex flex-col justify-center border-t border-cloud bg-mist/60 p-6 md:border-l md:border-t-0">
                <ThresholdRuler pact={pact} />
                <p className="mt-6 text-[10px] leading-5 text-slate">
                  A visual reading of the declared threshold—not an observation or forecast
                  probability.
                </p>
              </div>
            </div>
          </section>

          <details className="surface group overflow-hidden" open={isResolved}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal/[0.08] text-teal">
                  <FileSearch className="h-4 w-4" />
                </span>
                <div>
                  <div className="section-kicker">Dataset & observation</div>
                  <h2 className="mt-1 font-heading text-base font-semibold">Evidence details</h2>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t border-cloud px-5 py-6 sm:px-6">
              {pact.status === 'SOURCE_UNAVAILABLE' && (
                <div className="mb-5 flex items-start gap-3 rounded border border-coral/25 bg-coral/[0.05] p-4 text-xs leading-5 text-[#833D30]">
                  <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
                  The selected historical dataset has not supplied a usable observation. Resolution
                  can be retried later; no outcome is inferred.
                </div>
              )}
              {!isResolved && pact.status !== 'SOURCE_UNAVAILABLE' && (
                <div className="mb-5 flex items-start gap-3 rounded border border-cloud bg-mist p-4 text-xs leading-5 text-slate">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                  Waiting for the weather record. An observed value appears only after the contract
                  supplies one.
                </div>
              )}
              <dl className="grid gap-5 sm:grid-cols-2">
                <div>
                  <dt className="technical-label">Observed value</dt>
                  <dd className="mt-1.5 font-mono text-lg text-current">
                    {pact.evidence.observedValue ?? '—'}{' '}
                    {pact.evidence.observedValue !== null && (pact.evidence.unit ?? metric.unit)}
                  </dd>
                  {pact.evidence.observedValue === null && (
                    <dd className="mt-1 text-[10px] text-slate">Unavailable</dd>
                  )}
                </div>
                <div>
                  <dt className="technical-label">Actual result</dt>
                  <dd className="mt-1.5 flex items-center gap-2 font-heading text-sm font-semibold">
                    {actualResult ?? 'Not resolved'}
                    {actualResult === 'YES' && <Check className="h-4 w-4 text-teal" />}
                    {actualResult === 'NO' && <X className="h-4 w-4 text-current" />}
                  </dd>
                </div>
                <div>
                  <dt className="technical-label">Creator prediction matched</dt>
                  <dd className="mt-1.5 text-sm">
                    {predictionMatched === null
                      ? 'Not available'
                      : predictionMatched
                        ? 'Yes'
                        : 'No'}
                  </dd>
                </div>
                <div>
                  <dt className="technical-label">Resolved at</dt>
                  <dd className="mt-1.5 text-xs">
                    {pact.evidence.resolvedAt ? (
                      formatTimestamp(pact.evidence.resolvedAt)
                    ) : (
                      <Unavailable />
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="technical-label">Source name</dt>
                  <dd className="mt-1.5 text-xs">{pact.evidence.sourceName ?? <Unavailable />}</dd>
                </div>
                <div>
                  <dt className="technical-label">Source link</dt>
                  <dd className="mt-1.5 text-xs">
                    {pact.evidence.sourceUrl ? (
                      <a
                        href={pact.evidence.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-teal hover:underline"
                      >
                        Open dataset
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <Unavailable />
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="technical-label">Resolution transaction</dt>
                  <dd className="mt-1.5">
                    <HashValue value={pact.onChain.resolutionTxHash} />
                  </dd>
                </div>
                {pact.evidence.datasetNote && (
                  <div className="sm:col-span-2">
                    <dt className="technical-label">Dataset note</dt>
                    <dd className="mt-1.5 text-xs leading-5 text-slate">
                      {pact.evidence.datasetNote}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-6 border-t border-cloud pt-4">
                <p className="text-[10px] leading-5 text-slate">{SOURCE_DISCLOSURE}</p>
                <SourceNote className="mt-2" />
              </div>
            </div>
          </details>
        </div>

        <aside className="space-y-6">
          <section className="surface p-5">
            <div className="section-kicker">Creator’s call</div>
            <div className="mt-4 flex items-center justify-between border-b border-cloud pb-5">
              <span className="font-heading text-4xl font-semibold tracking-[-0.05em] text-teal">
                {pact.prediction}
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lime/45">
                {pact.prediction === 'YES' ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Minus className="h-5 w-5" />
                )}
              </span>
            </div>
            <div className="mt-4">
              <div className="technical-label">Creator address</div>
              {pact.creatorAddress ? (
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-xs">{shortenAddress(pact.creatorAddress)}</span>
                  <CopyButton value={pact.creatorAddress} />
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate">Unavailable in this preview record.</p>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-current bg-current text-white shadow-crisp">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-lime">
                <ShieldCheck className="h-3.5 w-3.5" />
                On-chain record
              </div>
              <h2 className="mt-1 font-heading text-base font-semibold">Transaction trail</h2>
            </div>
            <dl className="space-y-5 px-5 py-5">
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-wider text-white/40">
                  Contract address
                </dt>
                <dd className="mt-1.5">
                  {pact.onChain.contractAddress ? (
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">
                        {shortenAddress(pact.onChain.contractAddress)}
                      </span>
                      <CopyButton
                        value={pact.onChain.contractAddress}
                        className="text-white/60 hover:bg-white/10 hover:text-white"
                      />
                    </span>
                  ) : (
                    <span className="text-xs text-white/45">Unavailable · not connected</span>
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-wider text-white/40">
                    Chain
                  </dt>
                  <dd className="mt-1.5 text-xs">{pact.onChain.chainName ?? 'Unavailable'}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-wider text-white/40">
                    Chain ID
                  </dt>
                  <dd className="mt-1.5 font-mono text-xs">{pact.onChain.chainId ?? '—'}</dd>
                </div>
              </div>
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-wider text-white/40">
                  Creation transaction
                </dt>
                <dd className="mt-1.5">
                  {pact.onChain.creationTxHash ? (
                    <span className="font-mono text-xs text-lime">
                      {shortenAddress(pact.onChain.creationTxHash)}
                    </span>
                  ) : (
                    <span className="text-xs text-white/45">Unavailable</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-wider text-white/40">
                  Resolution transaction
                </dt>
                <dd className="mt-1.5">
                  {pact.onChain.resolutionTxHash ? (
                    <span className="font-mono text-xs text-lime">
                      {shortenAddress(pact.onChain.resolutionTxHash)}
                    </span>
                  ) : (
                    <span className="text-xs text-white/45">Unavailable</span>
                  )}
                </dd>
              </div>
              <div className="border-t border-white/10 pt-4">
                <dt className="font-mono text-[9px] uppercase tracking-wider text-white/40">
                  Current transaction lifecycle
                </dt>
                <dd className="mt-2 flex items-center gap-2 text-xs">
                  <span
                    className={
                      pact.onChain.isFinalized
                        ? 'h-1.5 w-1.5 rounded-full bg-lime'
                        : 'h-1.5 w-1.5 rounded-full bg-white/35'
                    }
                  />
                  {pact.onChain.lifecycle.replaceAll('_', ' ')}
                </dd>
                {!pact.onChain.isFinalized && (
                  <dd className="mt-1 text-[10px] text-white/40">
                    No finalized transaction is claimed.
                  </dd>
                )}
              </div>
            </dl>
          </section>

          {pact.status === 'READY_TO_RESOLVE' && (
            <section>
              <div className="mb-3 technical-label">Resolution setup</div>
              <ConnectionRequirements action="resolve" />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
