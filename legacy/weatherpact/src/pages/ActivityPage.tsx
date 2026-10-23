import {
  Activity,
  ArrowUpRight,
  Award,
  CalendarClock,
  Check,
  CloudOff,
  FilePlus2,
  LockKeyhole,
  RefreshCw,
  UserRound,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { weatherPactClient } from '../client';
import { PageHeader } from '../components/PageHeader';
import { Button, buttonStyles } from '../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { PreviewLabel } from '../components/ui/StatusBadge';
import { useWallet } from '../context/WalletContext';
import { useWeatherPact } from '../context/WeatherPactContext';
import { formatTimestamp, shortenAddress } from '../lib/weather';
import { cn } from '../lib/utils';
import type { ActivityType, Reputation } from '../types/weatherpact';

const eventLabels: Record<ActivityType, { title: string; detail: string }> = {
  CREATED: {
    title: 'Pact drafted onto the record',
    detail: 'A measurable condition entered the public stream.',
  },
  READY: {
    title: 'Evidence window opened',
    detail: 'The local target date passed; evaluation may be ready.',
  },
  RESOLVED: { title: 'Resolution recorded', detail: 'The contract supplied a finalized outcome.' },
  SOURCE_UNAVAILABLE: {
    title: 'Weather source unavailable',
    detail: 'No outcome was inferred. Resolution can be retried.',
  },
};

function EventIcon({ type }: { type: ActivityType }) {
  const Icon =
    type === 'CREATED'
      ? FilePlus2
      : type === 'READY'
        ? CalendarClock
        : type === 'RESOLVED'
          ? Check
          : CloudOff;
  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        type === 'SOURCE_UNAVAILABLE'
          ? 'bg-coral/10 text-[#9B4939]'
          : type === 'RESOLVED'
            ? 'bg-lime/50 text-current'
            : 'bg-teal/[0.08] text-teal',
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function ActivityPage() {
  const { activity, pacts, isLoading, error, refresh, capabilities } = useWeatherPact();
  const wallet = useWallet();
  const [view, setView] = useState<'public' | 'mine'>('public');
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [reputationLoading, setReputationLoading] = useState(false);
  const [reputationError, setReputationError] = useState<string | null>(null);

  const loadReputation = useCallback(async () => {
    if (!wallet.address || !capabilities.canReadReputation) {
      setReputation(null);
      return;
    }
    setReputationLoading(true);
    setReputationError(null);
    try {
      setReputation(await weatherPactClient.getReputation(wallet.address));
    } catch (reason) {
      setReputationError(
        reason instanceof Error ? reason.message : 'Reputation history is temporarily unavailable.',
      );
    } finally {
      setReputationLoading(false);
    }
  }, [wallet.address, capabilities.canReadReputation]);

  useEffect(() => {
    void loadReputation();
  }, [loadReputation]);

  const visibleActivity = useMemo(() => {
    if (view === 'public') return activity;
    if (!wallet.address || capabilities.mode === 'preview') return [];
    const address = wallet.address.toLowerCase();
    return activity.filter((event) => event.actorAddress?.toLowerCase() === address);
  }, [view, activity, wallet.address, capabilities.mode]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Evidence trail & non-financial reputation"
        title="Activity"
        description="Follow changes to the public record and inspect how finalized predictions contribute to a wallet’s weather-watching history."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              void refresh();
              void loadReputation();
            }}
            loading={isLoading || reputationLoading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-cloud px-4 py-3 sm:px-5">
            <div className="flex rounded-[4px] bg-mist p-1" role="group" aria-label="Activity view">
              <button
                aria-pressed={view === 'public'}
                onClick={() => setView('public')}
                className={cn(
                  'rounded-[3px] px-3 py-2 text-xs font-semibold transition-colors',
                  view === 'public'
                    ? 'bg-white text-current shadow-sm'
                    : 'text-slate hover:text-current',
                )}
              >
                Public record
              </button>
              <button
                aria-pressed={view === 'mine'}
                onClick={() => setView('mine')}
                className={cn(
                  'rounded-[3px] px-3 py-2 text-xs font-semibold transition-colors',
                  view === 'mine'
                    ? 'bg-white text-current shadow-sm'
                    : 'text-slate hover:text-current',
                )}
              >
                Your activity
              </button>
            </div>
            <Activity className="h-4 w-4 text-teal" />
          </div>
          {view === 'mine' && !wallet.address ? (
            <EmptyState
              title="Connect your weather record"
              description="Your activity is derived from the connected wallet’s finalized contract history—not from local drafts or preview data."
              icon={<Wallet className="h-5 w-5" />}
              action={
                <Button
                  onClick={() => void wallet.connect()}
                  loading={wallet.status === 'connecting'}
                >
                  <Wallet className="h-4 w-4" />
                  Connect wallet
                </Button>
              }
            />
          ) : view === 'mine' && capabilities.mode === 'preview' ? (
            <EmptyState
              title="On-chain history unavailable"
              description="A wallet is connected, but this frontend is using isolated preview records. No personal activity or reputation can be inferred from them."
              icon={<LockKeyhole className="h-5 w-5" />}
            />
          ) : isLoading && !activity.length ? (
            <div className="space-y-5 p-6">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-52" />
                    <Skeleton className="h-3 w-80 max-w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <ErrorState message={error} retry={() => void refresh()} />
          ) : visibleActivity.length ? (
            <ol className="divide-y divide-cloud">
              {visibleActivity.map((event) => {
                const pact = pacts.find((item) => item.id === event.pactId);
                const copy = eventLabels[event.type];
                return (
                  <li key={event.id} className="flex gap-3 px-4 py-5 sm:gap-4 sm:px-5">
                    <EventIcon type={event.type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold">{copy.title}</h2>
                        {event.isPreview && <PreviewLabel />}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate">{copy.detail}</p>
                      {pact && (
                        <Link
                          to={`/pacts/${pact.id}`}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal hover:text-current"
                        >
                          {pact.location.name} · {pact.targetDate}
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] text-slate">
                        <span>{formatTimestamp(event.timestamp)}</span>
                        <span>
                          Actor:{' '}
                          {event.actorAddress
                            ? shortenAddress(event.actorAddress)
                            : event.isPreview
                              ? 'Unavailable in preview'
                              : 'Unavailable'}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState
              title="No activity yet"
              description={
                view === 'public'
                  ? 'The public activity trail is empty. New events will appear after the connected contract reports them.'
                  : 'This wallet has no matching finalized activity in the connected record. New events will appear after the contract reports them.'
              }
              icon={<UserRound className="h-5 w-5" />}
            />
          )}
        </section>

        <aside className="space-y-5">
          <section
            id="reputation"
            className="relative overflow-hidden rounded-md border border-current bg-current p-5 text-white shadow-crisp"
          >
            <div className="absolute right-0 top-0 h-1 w-20 bg-lime" />
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-lime">
                  Non-financial reputation
                </div>
                <h2 className="mt-1 font-heading text-lg font-semibold">Your weather record</h2>
              </div>
              <Award className="h-5 w-5 text-lime" />
            </div>
            {reputationLoading ? (
              <div className="mt-6 grid grid-cols-3 gap-3">
                <Skeleton className="h-16 bg-white/10" />
                <Skeleton className="h-16 bg-white/10" />
                <Skeleton className="h-16 bg-white/10" />
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-3 divide-x divide-white/10 border-y border-white/10 py-5">
                <div className="pr-3">
                  <div className="font-mono text-2xl">{reputation?.correctPredictions ?? '—'}</div>
                  <div className="mt-1 text-[9px] leading-4 text-white/45">Correct predictions</div>
                </div>
                <div className="px-3">
                  <div className="font-mono text-2xl">{reputation?.currentStreak ?? '—'}</div>
                  <div className="mt-1 text-[9px] leading-4 text-white/45">Current streak</div>
                </div>
                <div className="pl-3">
                  <div className="font-mono text-2xl">{reputation?.finalizedPacts ?? '—'}</div>
                  <div className="mt-1 text-[9px] leading-4 text-white/45">Finalized pacts</div>
                </div>
              </div>
            )}
            {!wallet.address ? (
              <p className="mt-4 text-xs leading-5 text-white/50">
                Connect a wallet to request its verified history. No score is assigned to
                disconnected or preview sessions.
              </p>
            ) : !capabilities.canReadReputation ? (
              <p className="mt-4 text-xs leading-5 text-white/50">
                On-chain history cannot be loaded yet. These neutral marks are unavailable
                values—not zero scores.
              </p>
            ) : reputation ? (
              <p className="mt-4 text-xs leading-5 text-white/50">{reputation.calculation}</p>
            ) : null}
            {reputationError && (
              <div
                className="mt-4 rounded border border-coral/40 bg-coral/10 p-3 text-xs leading-5 text-white/70"
                role="alert"
              >
                <p>{reputationError}</p>
                <button
                  onClick={() => void loadReputation()}
                  className="mt-2 inline-flex items-center gap-1.5 font-semibold text-lime hover:text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try loading history again
                </button>
              </div>
            )}
          </section>

          <section className="surface p-5">
            <div className="section-kicker">Achievement labels</div>
            <h2 className="mt-1 font-heading text-base font-semibold">Earned from evidence only</h2>
            <div className="mt-4 divide-y divide-cloud">
              {(
                reputation?.achievements ?? [
                  {
                    id: 'rainmaker',
                    label: 'Rainmaker',
                    description: 'One finalized correct rain prediction.',
                    earned: null,
                  },
                  {
                    id: 'clear-sky-streak',
                    label: 'Clear-Sky Streak',
                    description: 'Three correct finalized predictions in a row.',
                    earned: null,
                  },
                  {
                    id: 'weather-watcher',
                    label: 'Weather Watcher',
                    description: 'Five finalized pacts with verified outcomes.',
                    earned: null,
                  },
                ]
              ).map((badge) => (
                <div key={badge.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      badge.earned ? 'bg-lime text-current' : 'bg-mist text-slate',
                    )}
                  >
                    <LockKeyhole className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <div className="text-xs font-semibold">{badge.label}</div>
                    <p className="mt-1 text-[10px] leading-5 text-slate">{badge.description}</p>
                    <div className="mt-1 font-mono text-[8px] uppercase tracking-wider text-slate">
                      {badge.earned === null
                        ? 'Unavailable until chain history loads'
                        : badge.earned
                          ? 'Earned'
                          : 'Not yet earned'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-cloud bg-[#E9EEE7] p-5">
            <div className="section-kicker">How the score works</div>
            <p className="mt-3 text-xs leading-6 text-slate">
              Correct predictions count only finalized pacts where the contract outcome matches the
              creator’s prediction. Streaks are consecutive correct finalized outcomes in resolution
              order. Unfinalized transactions, mocked pacts, and unavailable evidence add nothing.
            </p>
            <Link
              to="/explorer"
              className={buttonStyles('ghost', 'mt-3 -ml-3 min-h-8 px-3 text-xs')}
            >
              Inspect public records
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
