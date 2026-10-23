import { AlertCircle, Check, LoaderCircle, PenLine, Send } from 'lucide-react';
import type { TransactionLifecycle } from '../types/weatherpact';
import { cn } from '../lib/utils';
import { CopyButton } from './ui/CopyButton';

export interface TransactionState {
  lifecycle: TransactionLifecycle;
  hash: string | null;
  error: string | null;
}

export const idleTransaction: TransactionState = {
  lifecycle: 'NOT_SUBMITTED',
  hash: null,
  error: null,
};

export function transactionError(reason: unknown, hash: string | null = null): TransactionState {
  const code = (reason as { code?: number })?.code;
  const rejected = code === 4001;
  const tracking = (reason as { pending?: boolean })?.pending === true;
  const trackedHash = (reason as { transactionHash?: string })?.transactionHash;
  return {
    lifecycle: rejected ? 'REJECTED' : tracking ? 'FINALIZING' : 'FAILED',
    hash: rejected ? null : (trackedHash ?? hash),
    error: rejected
      ? 'Transaction rejected in the wallet. Nothing was submitted.'
      : reason instanceof Error
        ? reason.message
        : 'The transaction failed. No final result was recorded.',
  };
}

export function TransactionNotice({ state }: { state: TransactionState }) {
  if (state.lifecycle === 'NOT_SUBMITTED') return null;
  const interrupted = state.lifecycle === 'FINALIZING' && Boolean(state.error);
  const pending =
    ['AWAITING_SIGNATURE', 'SUBMITTED', 'FINALIZING'].includes(state.lifecycle) && !interrupted;
  const failed = state.lifecycle === 'REJECTED' || state.lifecycle === 'FAILED';
  const finalized = state.lifecycle === 'FINALIZED';
  const title = interrupted
    ? 'Transaction tracking interrupted'
    : state.lifecycle === 'AWAITING_SIGNATURE'
      ? 'Check your wallet'
      : state.lifecycle === 'SUBMITTED'
        ? 'Transaction submitted'
        : state.lifecycle === 'FINALIZING'
          ? 'Waiting for transaction finality'
          : state.lifecycle === 'REJECTED'
            ? 'Transaction rejected'
            : state.lifecycle === 'FAILED'
              ? 'Transaction failed'
              : 'Finalized on-chain';
  const description =
    state.error ??
    (state.lifecycle === 'AWAITING_SIGNATURE'
      ? 'Review and approve the request. The pact is not created yet.'
      : state.lifecycle === 'SUBMITTED'
        ? 'The transaction has a hash, but it is not final yet.'
        : state.lifecycle === 'FINALIZING'
          ? 'Keep this view open or return later. No finalized result is being claimed yet.'
          : finalized
            ? 'Finality and successful execution were verified by the GenLayer SDK.'
            : '');

  return (
    <div
      className={cn(
        'rounded-[5px] border p-4',
        failed || interrupted
          ? 'border-coral/35 bg-coral/[0.06]'
          : finalized
            ? 'border-teal/25 bg-teal/[0.06]'
            : 'border-current/15 bg-mist',
      )}
      role={failed || interrupted ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            failed || interrupted
              ? 'bg-coral/10 text-[#9B4939]'
              : finalized
                ? 'bg-teal/10 text-teal'
                : 'bg-white text-teal',
          )}
        >
          {pending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : finalized ? (
            <Check className="h-4 w-4" />
          ) : failed || interrupted ? (
            <AlertCircle className="h-4 w-4" />
          ) : state.lifecycle === 'AWAITING_SIGNATURE' ? (
            <PenLine className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-current">{title}</div>
          {description && <p className="mt-1 text-xs leading-5 text-slate">{description}</p>}
          {state.hash && (
            <div className="mt-2 flex items-center gap-1 font-mono text-[10px] text-slate">
              <span className="truncate">TX {state.hash}</span>
              <CopyButton value={state.hash} label="Copy hash" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
