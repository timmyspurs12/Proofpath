import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  CloudOff,
  Database,
  FileCheck2,
  Radar,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { weatherPactClient } from '../client';
import { ConnectionRequirements } from '../components/ConnectionRequirements';
import { PageHeader } from '../components/PageHeader';
import { Button, buttonStyles } from '../components/ui/Button';
import { EmptyState, ErrorState, PactListSkeleton } from '../components/ui/States';
import { SourceNote } from '../components/ui/SourceNote';
import { PreviewLabel, StatusBadge } from '../components/ui/StatusBadge';
import {
  idleTransaction,
  transactionError,
  TransactionNotice,
  type TransactionState,
} from '../components/TransactionNotice';
import { hasPublicContractConfig } from '../config';
import { useWallet } from '../context/WalletContext';
import { useWeatherPact } from '../context/WeatherPactContext';
import {
  formatCompactCondition,
  formatConditionSentence,
  formatDate,
  hasTargetDatePassed,
} from '../lib/weather';
import type { Pact } from '../types/weatherpact';

export function ResolutionDeskPage() {
  const { pacts, isLoading, error, refresh, capabilities } = useWeatherPact();
  const wallet = useWallet();
  const [transactions, setTransactions] = useState<Record<string, TransactionState>>({});
  const writeReady =
    capabilities.canResolve &&
    hasPublicContractConfig &&
    Boolean(wallet.address) &&
    wallet.isCorrectNetwork === true;
  const candidates = pacts.filter(
    (pact) =>
      pact.status === 'READY_TO_RESOLVE' ||
      pact.status === 'SOURCE_UNAVAILABLE' ||
      (pact.status === 'OPEN' && hasTargetDatePassed(pact)),
  );
  const readyCount = pacts.filter((pact) => pact.status === 'READY_TO_RESOLVE').length;

  async function resolve(pact: Pact) {
    if (!writeReady) return;
    const current = transactions[pact.id] ?? idleTransaction;
    const currentPending =
      ['AWAITING_SIGNATURE', 'SUBMITTED'].includes(current.lifecycle) ||
      (current.lifecycle === 'FINALIZING' && !current.error);
    if (currentPending || current.lifecycle === 'FINALIZED') return;
    let submittedHash: string | null = null;
    setTransactions((all) => ({
      ...all,
      [pact.id]: { lifecycle: 'AWAITING_SIGNATURE', hash: null, error: null },
    }));
    try {
      let result = await weatherPactClient.resolvePact(pact.id);
      submittedHash = result.transactionHash;
      setTransactions((all) => ({
        ...all,
        [pact.id]: { lifecycle: result.lifecycle, hash: result.transactionHash, error: null },
      }));
      if (result.lifecycle === 'SUBMITTED' || result.lifecycle === 'FINALIZING') {
        setTransactions((all) => ({
          ...all,
          [pact.id]: { lifecycle: 'FINALIZING', hash: result.transactionHash, error: null },
        }));
        result = await weatherPactClient.waitForFinality(result.transactionHash);
        setTransactions((all) => ({
          ...all,
          [pact.id]: { lifecycle: result.lifecycle, hash: result.transactionHash, error: null },
        }));
      }
      if (result.lifecycle === 'FINALIZED') await refresh();
    } catch (reason) {
      setTransactions((all) => ({
        ...all,
        [pact.id]: transactionError(reason, submittedHash),
      }));
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Past dates · public evidence"
        title="Resolution Desk"
        description="Evaluate pacts whose local target dates have passed. A transaction is only offered when the source, contract, wallet, and network are ready."
        actions={
          <Button variant="outline" onClick={() => void refresh()} loading={isLoading}>
            <RefreshCw className="h-4 w-4" />
            Refresh record
          </Button>
        }
      />

      <section className="mb-6 grid overflow-hidden rounded-md border border-current bg-current text-white shadow-crisp md:grid-cols-[1fr_1.2fr]">
        <div className="border-b border-white/10 p-6 md:border-b-0 md:border-r">
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-lime">
            <Radar className="h-3.5 w-3.5" />
            Evaluation window
          </div>
          <div className="mt-4 flex items-end gap-3">
            <span className="font-mono text-4xl text-white">
              {isLoading && !pacts.length ? '—' : String(readyCount).padStart(2, '0')}
            </span>
            <span className="pb-1 text-xs text-white/55">marked ready to resolve</span>
          </div>
          <p className="mt-3 text-[10px] text-white/40">
            {capabilities.mode === 'preview'
              ? 'Count derived from illustrative preview records only.'
              : 'Count derived from the connected contract record.'}
          </p>
        </div>
        <div className="flex items-center gap-4 p-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime text-current">
            <FileCheck2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-heading text-base font-semibold">
              The evidence is in. Make it final.
            </h2>
            <p className="mt-1 text-xs leading-5 text-white/55">
              Resolution asks the Intelligent Contract to evaluate the selected historical dataset.
              It does not create a second weather source.
            </p>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-cloud px-5 py-4">
            <div>
              <div className="section-kicker">Evidence queue</div>
              <h2 className="mt-1 font-heading text-lg font-semibold">Dates that have passed</h2>
            </div>
            <span className="technical-label">{candidates.length} in view</span>
          </div>
          {isLoading && !pacts.length ? (
            <PactListSkeleton rows={4} />
          ) : error ? (
            <ErrorState message={error} retry={() => void refresh()} />
          ) : candidates.length ? (
            <div className="divide-y divide-cloud">
              {candidates.map((pact) => {
                const transaction = transactions[pact.id] ?? idleTransaction;
                const pending =
                  ['AWAITING_SIGNATURE', 'SUBMITTED'].includes(transaction.lifecycle) ||
                  (transaction.lifecycle === 'FINALIZING' && !transaction.error);
                const canResume =
                  transaction.lifecycle === 'FINALIZING' && Boolean(transaction.error);
                const waiting = pact.status === 'OPEN';
                return (
                  <article key={pact.id} className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={pact.status} />
                          {pact.isPreview && <PreviewLabel />}
                        </div>
                        <Link
                          to={`/pacts/${pact.id}`}
                          className="mt-3 block font-heading text-xl font-semibold tracking-[-0.03em] hover:text-teal"
                        >
                          {pact.location.name}
                          <span className="font-normal text-slate">, {pact.location.country}</span>
                        </Link>
                      </div>
                      <div className="text-right">
                        <div className="technical-label">Target local date</div>
                        <div className="mt-1 font-mono text-[11px]">
                          {formatDate(pact.targetDate)}
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate">
                      {formatConditionSentence(pact)}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-slate">
                      <span className="font-mono text-teal">{formatCompactCondition(pact)}</span>
                      <span>
                        Creator predicts <strong className="text-current">{pact.prediction}</strong>
                      </span>
                      <Link
                        to={`/pacts/${pact.id}`}
                        className="inline-flex items-center gap-1 font-semibold text-teal"
                      >
                        Inspect record
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                    {pact.status === 'SOURCE_UNAVAILABLE' && (
                      <div className="mt-4 flex items-start gap-2 rounded border border-coral/25 bg-coral/[0.05] p-3 text-xs leading-5 text-[#833D30]">
                        <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
                        The historical dataset is not available yet. No result has been inferred;
                        resolution can be retried later.
                      </div>
                    )}
                    {waiting && (
                      <div className="mt-4 flex items-start gap-2 rounded border border-cloud bg-mist p-3 text-xs leading-5 text-slate">
                        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                        The date has passed, but the contract has not marked this pact ready. Wait
                        for the source window or refresh later.
                      </div>
                    )}
                    <div className="mt-5 flex flex-col gap-3 border-t border-cloud pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-[10px] text-slate">
                        {writeReady
                          ? 'Wallet and contract requirements are ready.'
                          : 'Resolve is disabled until all GenLayer requirements are met.'}
                      </div>
                      <Button
                        onClick={() => void resolve(pact)}
                        disabled={
                          !writeReady ||
                          (waiting && !canResume) ||
                          transaction.lifecycle === 'FINALIZED'
                        }
                        loading={pending}
                        title={
                          !writeReady
                            ? 'Contract, adapter, wallet, and correct network are required'
                            : waiting
                              ? 'The contract has not marked this pact ready'
                              : undefined
                        }
                      >
                        {transaction.lifecycle === 'FINALIZED'
                          ? 'Resolution finalized'
                          : canResume
                            ? 'Resume same transaction'
                            : pact.status === 'SOURCE_UNAVAILABLE'
                              ? 'Retry resolution'
                              : 'Resolve on GenLayer'}
                        {transaction.lifecycle === 'FINALIZED' ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {transaction.lifecycle !== 'NOT_SUBMITTED' && (
                      <div className="mt-4">
                        <TransactionNotice state={transaction} />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Waiting for the weather record"
              description="No pacts in this view have a passed target date. When the local calendar catches up, their evaluation window will open here."
              icon={<CalendarClock className="h-5 w-5" />}
              action={
                <Link to="/explorer" className={buttonStyles('outline')}>
                  Explore open pacts
                </Link>
              }
            />
          )}
        </section>

        <aside className="space-y-5 xl:sticky xl:top-24">
          <section className="surface p-5">
            <div className="section-kicker">Resolution protocol</div>
            <h2 className="mt-1 font-heading text-lg font-semibold">
              Three checks before finality
            </h2>
            <ol className="mt-5 space-y-5">
              {[
                {
                  icon: CalendarClock,
                  title: 'Local date has passed',
                  text: 'The target day is evaluated in the pact’s own timezone.',
                },
                {
                  icon: Database,
                  title: 'Historical data is available',
                  text: 'The selected public dataset must return a usable daily value.',
                },
                {
                  icon: ShieldCheck,
                  title: 'GenLayer reaches a result',
                  text: 'The UI follows the transaction lifecycle and never assumes finality.',
                },
              ].map((item, index) => (
                <li key={item.title} className="flex gap-3">
                  <div className="relative">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mist text-teal">
                      <item.icon className="h-4 w-4" />
                    </span>
                    {index < 2 && <span className="absolute left-1/2 top-9 h-6 w-px bg-cloud" />}
                  </div>
                  <div>
                    <div className="text-xs font-semibold">{item.title}</div>
                    <p className="mt-1 text-[10px] leading-5 text-slate">{item.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 border-t border-cloud pt-4">
              <SourceNote />
            </div>
          </section>
          <section>
            <div className="mb-3 technical-label">Resolution setup</div>
            <ConnectionRequirements action="resolve" />
            {wallet.isCorrectNetwork === false && (
              <Button
                variant="outline"
                className="mt-3 w-full text-xs"
                onClick={() => void wallet.switchNetwork()}
              >
                Switch to configured network
              </Button>
            )}
          </section>
          <div className="flex items-start gap-2 px-1 text-[10px] leading-5 text-slate">
            <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-teal" />
            Only a finalized contract result can change a pact to RESOLVED YES or RESOLVED NO.
          </div>
        </aside>
      </div>
    </div>
  );
}
