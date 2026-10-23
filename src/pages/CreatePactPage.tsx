import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CloudDrizzle,
  CloudRain,
  Info,
  MapPin,
  PenLine,
  ShieldCheck,
  ThermometerSnowflake,
  ThermometerSun,
  Wind,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { weatherPactClient } from '../client';
import { ConnectionRequirements } from '../components/ConnectionRequirements';
import { LocationSearch } from '../components/LocationSearch';
import { PageHeader } from '../components/PageHeader';
import { Button, buttonStyles } from '../components/ui/Button';
import { ContourArt } from '../components/ui/ContourArt';
import { SourceNote } from '../components/ui/SourceNote';
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
  COMPARATORS,
  formatConditionSentence,
  formatCoordinates,
  formatDate,
  getComparator,
  getMetric,
  getTodayInTimezone,
  METRICS,
} from '../lib/weather';
import { cn } from '../lib/utils';
import type {
  Comparator,
  CreatePactInput,
  Location,
  Prediction,
  WeatherMetric,
} from '../types/weatherpact';

const metricIcons = {
  rain_sum: CloudRain,
  precipitation_sum: CloudDrizzle,
  temperature_2m_max: ThermometerSun,
  temperature_2m_min: ThermometerSnowflake,
  wind_speed_10m_max: Wind,
};

const steps = [
  { number: 1, label: 'Place & date', note: 'Set the scene' },
  { number: 2, label: 'Condition', note: 'Make it measurable' },
  { number: 3, label: 'Prediction', note: 'Review the pact' },
];

export function CreatePactPage() {
  const [stage, setStage] = useState(1);
  const [location, setLocation] = useState<Location | null>(null);
  const [targetDate, setTargetDate] = useState('');
  const [metric, setMetric] = useState<WeatherMetric>('rain_sum');
  const [comparator, setComparator] = useState<Comparator>('gt');
  const [threshold, setThreshold] = useState('10');
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transaction, setTransaction] = useState<TransactionState>(idleTransaction);
  const [createdPactId, setCreatedPactId] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const wallet = useWallet();
  const { capabilities, refresh } = useWeatherPact();
  const metricDefinition = getMetric(metric);
  const today = useMemo(
    () =>
      getTodayInTimezone(location?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone),
    [location],
  );
  const pending =
    ['AWAITING_SIGNATURE', 'SUBMITTED'].includes(transaction.lifecycle) ||
    (transaction.lifecycle === 'FINALIZING' && !transaction.error);
  const dialogLocked = transaction.lifecycle === 'AWAITING_SIGNATURE';
  const writeReady =
    capabilities.canWrite &&
    hasPublicContractConfig &&
    Boolean(wallet.address) &&
    wallet.isCorrectNetwork === true;
  const numericThreshold = Number(threshold);
  const canDescribeCondition = Boolean(
    location && targetDate && threshold.trim() && Number.isFinite(numericThreshold),
  );
  const draftForSentence =
    location && canDescribeCondition
      ? { location, targetDate, metric, comparator, threshold: numericThreshold }
      : null;

  function moveTo(next: number) {
    setStage(next);
    setErrors({});
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    topRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  function validatePlaceAndDate() {
    const nextErrors: Record<string, string> = {};
    const dateSchema = z
      .string()
      .min(1, 'Choose a target local calendar date.')
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid calendar date.');
    if (!location) nextErrors.location = 'Select a search result or add manual coordinates.';
    const parsedDate = dateSchema.safeParse(targetDate);
    if (!parsedDate.success)
      nextErrors.targetDate = parsedDate.error.issues[0]?.message ?? 'Choose a valid date.';
    else if (targetDate < today)
      nextErrors.targetDate = `Choose ${formatDate(today)} or a later date in the selected location.`;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function validateCondition() {
    const nextErrors: Record<string, string> = {};
    const thresholdSchema = z
      .string()
      .trim()
      .min(1, 'Enter a numeric threshold.')
      .refine((value) => Number.isFinite(Number(value)), 'Threshold must be a valid number.')
      .refine(
        (value) => Number(value) >= metricDefinition.min && Number(value) <= metricDefinition.max,
        `Use a value from ${metricDefinition.min} to ${metricDefinition.max} ${metricDefinition.unit}.`,
      );
    const parsed = thresholdSchema.safeParse(threshold);
    if (!parsed.success)
      nextErrors.threshold = parsed.error.issues[0]?.message ?? 'Enter a valid threshold.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function openReview() {
    const nextErrors: Record<string, string> = {};
    if (!prediction) nextErrors.prediction = 'Choose YES or NO as your prediction.';
    if (!confirmed)
      nextErrors.confirmed = 'Confirm the dataset and transaction notes before reviewing.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      // Preserve submitted/finalized state when the review is reopened. This prevents
      // an unfinished transaction from being accidentally reset and submitted twice.
      setConfirmOpen(true);
    }
  }

  function pactInput(): CreatePactInput | null {
    if (!location || !prediction || !targetDate || !Number.isFinite(numericThreshold)) return null;
    return { location, targetDate, metric, comparator, threshold: numericThreshold, prediction };
  }

  async function createPact() {
    const input = pactInput();
    if (!input || !writeReady || pending) return;
    let submittedHash: string | null = null;
    setTransaction({ lifecycle: 'AWAITING_SIGNATURE', hash: null, error: null });
    try {
      let result = await weatherPactClient.createPact(input);
      submittedHash = result.transactionHash;
      setTransaction({ lifecycle: result.lifecycle, hash: result.transactionHash, error: null });
      setCreatedPactId(result.pactId);
      if (result.lifecycle === 'SUBMITTED' || result.lifecycle === 'FINALIZING') {
        setTransaction({ lifecycle: 'FINALIZING', hash: result.transactionHash, error: null });
        result = await weatherPactClient.waitForFinality(result.transactionHash);
        setTransaction({ lifecycle: result.lifecycle, hash: result.transactionHash, error: null });
        setCreatedPactId(result.pactId);
      }
      if (result.lifecycle === 'FINALIZED') await refresh();
    } catch (reason) {
      setTransaction(transactionError(reason, submittedHash));
    }
  }

  function startNewDraft() {
    setStage(1);
    setLocation(null);
    setTargetDate('');
    setMetric('rain_sum');
    setComparator('gt');
    setThreshold('10');
    setPrediction(null);
    setConfirmed(false);
    setErrors({});
    setTransaction(idleTransaction);
    setCreatedPactId(null);
  }

  return (
    <div className="animate-fade-up" ref={topRef}>
      <PageHeader
        eyebrow="Compose a public weather challenge"
        title="Create a Pact"
        description="Turn a place, a date, and a measurable threshold into a clear condition. Nothing is submitted without your wallet’s confirmation."
      />

      <ol
        className="mb-6 grid grid-cols-3 overflow-hidden rounded-md border border-cloud bg-white"
        aria-label="Pact creation progress"
      >
        {steps.map((item, index) => {
          const active = stage === item.number;
          const complete = stage > item.number;
          return (
            <li key={item.number} className={cn('relative', index > 0 && 'border-l border-cloud')}>
              <button
                type="button"
                onClick={() => item.number < stage && moveTo(item.number)}
                disabled={item.number > stage}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-4 text-left transition-colors sm:px-5',
                  active && 'bg-teal/[0.055]',
                  complete && 'cursor-pointer hover:bg-mist',
                )}
                aria-current={active ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]',
                    active
                      ? 'border-teal bg-teal text-white'
                      : complete
                        ? 'border-teal/30 bg-lime/40 text-current'
                        : 'border-current/15 text-slate',
                  )}
                >
                  {complete ? <Check className="h-3.5 w-3.5" /> : `0${item.number}`}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block truncate text-[11px] font-semibold sm:text-xs',
                      active ? 'text-teal' : 'text-current',
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="mt-0.5 hidden truncate text-[9px] text-slate sm:block">
                    {item.note}
                  </span>
                </span>
              </button>
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-teal" />}
            </li>
          );
        })}
      </ol>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="surface overflow-hidden">
          {stage === 1 && (
            <div key="stage-1" className="animate-fade-up">
              <div className="border-b border-cloud px-5 py-5 sm:px-7">
                <div className="section-kicker">Stage 01 · Set the scene</div>
                <h2 className="mt-1 font-heading text-xl font-semibold tracking-[-0.03em]">
                  Where and when?
                </h2>
                <p className="mt-2 text-xs leading-5 text-slate">
                  The target date follows the selected location’s local calendar, not your wallet’s
                  timezone.
                </p>
              </div>
              <div className="space-y-7 p-5 sm:p-7">
                <LocationSearch
                  value={location}
                  onChange={(next) => {
                    setLocation(next);
                    setErrors((current) => ({ ...current, location: '' }));
                  }}
                  error={errors.location}
                />
                <div className="max-w-sm">
                  <label htmlFor="target-date" className="field-label">
                    Target local calendar date
                  </label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-teal" />
                    <input
                      id="target-date"
                      type="date"
                      min={today}
                      value={targetDate}
                      onChange={(event) => {
                        setTargetDate(event.target.value);
                        setErrors((current) => ({ ...current, targetDate: '' }));
                      }}
                      className="field-input pl-10 font-mono text-xs"
                      aria-describedby="date-help"
                    />
                    {errors.targetDate && (
                      <p className="mt-2 text-xs text-[#9B4939]" role="alert">
                        {errors.targetDate}
                      </p>
                    )}
                    <p id="date-help" className="mt-2 text-[10px] text-slate">
                      {location
                        ? `Today in ${location.name}: ${formatDate(today)} (${location.timezone}).`
                        : 'Select a place to anchor the date to its local timezone.'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end border-t border-cloud bg-mist/40 px-5 py-4 sm:px-7">
                <Button onClick={() => validatePlaceAndDate() && moveTo(2)}>
                  Define the condition
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {stage === 2 && location && (
            <div key="stage-2" className="animate-fade-up">
              <div className="border-b border-cloud px-5 py-5 sm:px-7">
                <div className="section-kicker">Stage 02 · Make it measurable</div>
                <h2 className="mt-1 font-heading text-xl font-semibold tracking-[-0.03em]">
                  What should the record measure?
                </h2>
                <p className="mt-2 text-xs leading-5 text-slate">
                  Choose one daily metric and a precise numerical threshold.
                </p>
              </div>
              <div className="space-y-7 p-5 sm:p-7">
                <fieldset>
                  <legend className="field-label">Weather metric</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {METRICS.map((item) => {
                      const Icon = metricIcons[item.value];
                      const selected = metric === item.value;
                      return (
                        <label
                          key={item.value}
                          className={cn(
                            'flex min-h-[68px] cursor-pointer items-center gap-3 rounded-[5px] border p-3 transition-all focus-within:ring-2 focus-within:ring-teal',
                            selected
                              ? 'border-teal bg-teal/[0.055]'
                              : 'border-cloud bg-white hover:border-current/30',
                          )}
                        >
                          <input
                            type="radio"
                            name="metric"
                            value={item.value}
                            checked={selected}
                            onChange={() => {
                              setMetric(item.value);
                              setErrors({});
                            }}
                            className="sr-only"
                          />
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                              selected ? 'bg-teal text-white' : 'bg-mist text-slate',
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="flex-1 text-xs font-medium leading-5">{item.label}</span>
                          <span
                            className={cn(
                              'font-mono text-[10px]',
                              selected ? 'text-teal' : 'text-slate',
                            )}
                          >
                            {item.unit}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <div className="grid gap-6 md:grid-cols-2">
                  <fieldset>
                    <legend className="field-label">Numerical comparison</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {COMPARATORS.map((item) => (
                        <label
                          key={item.value}
                          className={cn(
                            'flex min-h-14 cursor-pointer items-center gap-2 rounded-[4px] border px-3 transition-colors focus-within:ring-2 focus-within:ring-teal',
                            comparator === item.value
                              ? 'border-teal bg-teal/[0.055] text-teal'
                              : 'border-cloud hover:border-current/30',
                          )}
                        >
                          <input
                            type="radio"
                            name="comparator"
                            checked={comparator === item.value}
                            onChange={() => setComparator(item.value)}
                            className="sr-only"
                          />
                          <span className="font-mono text-lg">{item.symbol}</span>
                          <span className="text-[10px] font-medium leading-4">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div>
                    <label htmlFor="threshold" className="field-label">
                      Numeric threshold
                    </label>
                    <div className="relative">
                      <input
                        id="threshold"
                        type="number"
                        inputMode="decimal"
                        min={metricDefinition.min}
                        max={metricDefinition.max}
                        step={metricDefinition.step}
                        value={threshold}
                        onChange={(event) => {
                          setThreshold(event.target.value);
                          setErrors((current) => ({ ...current, threshold: '' }));
                        }}
                        className="field-input pr-16 font-mono text-lg"
                        aria-describedby="threshold-help"
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-teal">
                        {metricDefinition.unit}
                      </span>
                    </div>
                    <p id="threshold-help" className="mt-2 text-[10px] leading-5 text-slate">
                      Allowed range: {metricDefinition.min} to {metricDefinition.max}{' '}
                      {metricDefinition.unit}. Decimal values are supported.
                    </p>
                    {errors.threshold && (
                      <p className="mt-2 text-xs text-[#9B4939]" role="alert">
                        {errors.threshold}
                      </p>
                    )}
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-[5px] border border-current/10 bg-mist p-5">
                  <span className="absolute right-0 top-0 h-1 w-16 bg-lime" />
                  <div className="section-kicker">In plain language</div>
                  <p className="mt-3 font-heading text-base font-medium leading-7">
                    {draftForSentence
                      ? formatConditionSentence(draftForSentence)
                      : 'Complete the condition to read it as a weather challenge.'}
                  </p>
                  <div className="mt-3 text-[10px] text-slate">
                    {location.name} · {location.timezone} · {formatDate(targetDate)}
                  </div>
                </div>
              </div>
              <div className="flex justify-between border-t border-cloud bg-mist/40 px-5 py-4 sm:px-7">
                <Button variant="ghost" onClick={() => moveTo(1)}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button onClick={() => validateCondition() && moveTo(3)}>
                  Make your prediction
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {stage === 3 && location && (
            <div key="stage-3" className="animate-fade-up">
              <div className="border-b border-cloud px-5 py-5 sm:px-7">
                <div className="section-kicker">Stage 03 · Make the call</div>
                <h2 className="mt-1 font-heading text-xl font-semibold tracking-[-0.03em]">
                  Will the condition be met?
                </h2>
                <p className="mt-2 text-xs leading-5 text-slate">
                  Your prediction is part of the public pact. There are no stakes or financial
                  payouts.
                </p>
              </div>
              <div className="space-y-7 p-5 sm:p-7">
                <fieldset>
                  <legend className="field-label">Creator’s prediction</legend>
                  <div className="grid grid-cols-2 gap-3">
                    {(['YES', 'NO'] as Prediction[]).map((option) => {
                      const selected = prediction === option;
                      return (
                        <label
                          key={option}
                          className={cn(
                            'relative cursor-pointer rounded-[5px] border p-5 transition-all focus-within:ring-2 focus-within:ring-teal',
                            selected
                              ? 'border-teal bg-teal/[0.055]'
                              : 'border-cloud hover:border-current/30',
                          )}
                        >
                          <input
                            type="radio"
                            name="prediction"
                            value={option}
                            checked={selected}
                            onChange={() => {
                              setPrediction(option);
                              setErrors((current) => ({ ...current, prediction: '' }));
                            }}
                            className="sr-only"
                          />
                          <div className="flex items-center justify-between">
                            <span
                              className={cn(
                                'font-heading text-3xl font-semibold tracking-[-0.05em]',
                                selected ? 'text-teal' : 'text-current',
                              )}
                            >
                              {option}
                            </span>
                            <span
                              className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-full',
                                selected ? 'bg-lime text-current' : 'bg-mist text-slate',
                              )}
                            >
                              {option === 'YES' ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <X className="h-4 w-4" />
                              )}
                            </span>
                          </div>
                          <p className="mt-2 text-[10px] leading-4 text-slate">
                            {option === 'YES'
                              ? 'The condition will meet the threshold.'
                              : 'The condition will not meet the threshold.'}
                          </p>
                        </label>
                      );
                    })}
                  </div>
                  {errors.prediction && (
                    <p className="mt-2 text-xs text-[#9B4939]" role="alert">
                      {errors.prediction}
                    </p>
                  )}
                </fieldset>

                <div className="overflow-hidden rounded-[5px] border border-cloud">
                  <div className="flex items-center justify-between border-b border-cloud bg-mist/60 px-4 py-3">
                    <span className="section-kicker">Final draft</span>
                    <span className="technical-label">Not submitted</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-5 p-5">
                    <div>
                      <dt className="technical-label">Place</dt>
                      <dd className="mt-1 text-xs font-medium">
                        {location.name}
                        {location.country ? `, ${location.country}` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="technical-label">Local date</dt>
                      <dd className="mt-1 text-xs font-medium">{formatDate(targetDate)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="technical-label">Condition</dt>
                      <dd className="mt-1 font-mono text-xs leading-5 text-teal">
                        {getMetric(metric).label} {getComparator(comparator).symbol} {threshold}{' '}
                        {metricDefinition.unit}
                      </dd>
                    </div>
                    <div>
                      <dt className="technical-label">Prediction</dt>
                      <dd className="mt-1 font-heading text-sm font-semibold">
                        {prediction ?? 'Not chosen'}
                      </dd>
                    </div>
                    <div>
                      <dt className="technical-label">Coordinates</dt>
                      <dd className="mt-1 font-mono text-[10px]">
                        {formatCoordinates(location.latitude, location.longitude)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="space-y-3 rounded-[5px] border border-cloud bg-mist/50 p-4">
                  <div className="flex items-start gap-3">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                    <p className="text-xs leading-5 text-slate">
                      The result depends on the selected public historical weather dataset. It may
                      be model-derived or reanalysis-based, not a direct station measurement.
                    </p>
                  </div>
                  <div className="flex items-start gap-3 border-t border-cloud pt-3">
                    <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                    <p className="text-xs leading-5 text-slate">
                      Creating the pact requires a GenLayer write transaction and applicable network
                      fees. You will review the request in your wallet before anything is submitted.
                    </p>
                  </div>
                  <SourceNote />
                </div>
                <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => {
                      setConfirmed(event.target.checked);
                      setErrors((current) => ({ ...current, confirmed: '' }));
                    }}
                    className="mt-1 h-4 w-4 accent-teal"
                  />
                  <span>
                    I understand that the outcome depends on the selected historical dataset and
                    that submission requires a wallet transaction.
                  </span>
                </label>
                {errors.confirmed && (
                  <p className="-mt-4 text-xs text-[#9B4939]" role="alert">
                    {errors.confirmed}
                  </p>
                )}
              </div>
              <div className="flex justify-between border-t border-cloud bg-mist/40 px-5 py-4 sm:px-7">
                <Button variant="ghost" onClick={() => moveTo(2)}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button onClick={openReview}>
                  <ShieldCheck className="h-4 w-4" />
                  Review transaction
                </Button>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-5 xl:sticky xl:top-24">
          <section className="relative overflow-hidden rounded-md border border-current bg-current p-5 text-white shadow-crisp">
            <ContourArt inverse className="absolute -right-20 -top-16 h-56 w-80 opacity-60" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-lime">
                  Local pact draft
                </span>
                <span className="font-mono text-[9px] text-white/40">0{stage} / 03</span>
              </div>
              <div className="mt-8">
                <div className="flex items-center gap-2 text-xs text-white/55">
                  <MapPin className="h-3.5 w-3.5 text-lime" />
                  {location
                    ? `${location.name}${location.country ? `, ${location.country}` : ''}`
                    : 'Place not selected'}
                </div>
                <p className="mt-3 min-h-14 font-heading text-base font-medium leading-6">
                  {draftForSentence
                    ? formatConditionSentence(draftForSentence)
                    : 'A clear weather condition will take shape here.'}
                </p>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                <div>
                  <div className="font-mono text-[8px] uppercase tracking-wider text-white/35">
                    Target date
                  </div>
                  <div className="mt-1 font-mono text-[10px]">{targetDate || '—'}</div>
                </div>
                <div>
                  <div className="font-mono text-[8px] uppercase tracking-wider text-white/35">
                    Prediction
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-lime">{prediction ?? '—'}</div>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2 text-[9px] text-white/40">
                <span className="h-1.5 w-1.5 rounded-full bg-lime" />
                Not submitted · no transaction yet
              </div>
            </div>
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <span className="technical-label">Transaction setup</span>
            </div>
            <ConnectionRequirements />
          </section>
        </aside>
      </div>

      <Dialog.Root
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!dialogLocked) setConfirmOpen(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-current/65 data-[state=open]:animate-fade-up" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(560px,calc(100vw-28px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-current/15 bg-white p-5 shadow-lift focus:outline-none sm:p-7"
            onEscapeKeyDown={(event) => {
              if (dialogLocked) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (dialogLocked) event.preventDefault();
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">Final confirmation</div>
                <Dialog.Title className="mt-1 font-heading text-2xl font-semibold tracking-[-0.04em]">
                  Put this pact on record?
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-xs leading-5 text-slate">
                  Review the condition and transaction setup. Your wallet makes the final decision.
                </Dialog.Description>
              </div>
              {!dialogLocked && (
                <Dialog.Close asChild>
                  <button
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate hover:bg-mist hover:text-current"
                    aria-label="Close review"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              )}
            </div>
            {location && (
              <div className="my-5 rounded-[5px] border border-cloud bg-mist/60 p-4">
                <div className="text-xs font-semibold">
                  {location.name} · {formatDate(targetDate)}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate">
                  {draftForSentence ? formatConditionSentence(draftForSentence) : ''}
                </p>
                <div className="mt-3 font-mono text-[10px] text-teal">
                  CREATOR PREDICTS {prediction ?? '—'}
                </div>
              </div>
            )}
            <ConnectionRequirements />
            {!writeReady && (
              <div className="mt-4 rounded border border-cloud bg-mist p-3 text-xs leading-5 text-slate">
                <strong className="text-current">Contract not connected.</strong> This preview can
                review the full draft, but the genuine write action stays disabled until a GenLayer
                adapter, public contract configuration, wallet, and correct network are available.
              </div>
            )}
            <div className="mt-4">
              <TransactionNotice state={transaction} />
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-cloud pt-5 sm:flex-row sm:justify-end">
              <Dialog.Close asChild disabled={dialogLocked}>
                <Button
                  variant="ghost"
                  disabled={dialogLocked}
                  onClick={transaction.lifecycle === 'FINALIZED' ? startNewDraft : undefined}
                >
                  {transaction.lifecycle === 'FINALIZED' ? 'Start new draft' : 'Back to draft'}
                </Button>
              </Dialog.Close>
              {transaction.lifecycle === 'FINALIZED' ? (
                createdPactId ? (
                  <Link to={`/pacts/${createdPactId}`} className={buttonStyles('primary')}>
                    View finalized pact
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <Dialog.Close asChild>
                    <Button>Done</Button>
                  </Dialog.Close>
                )
              ) : (
                <Button onClick={() => void createPact()} disabled={!writeReady} loading={pending}>
                  {transaction.lifecycle === 'FINALIZING' && transaction.error
                    ? 'Resume same transaction'
                    : transaction.lifecycle === 'REJECTED' || transaction.lifecycle === 'FAILED'
                      ? 'Try transaction again'
                      : 'Create on GenLayer'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
