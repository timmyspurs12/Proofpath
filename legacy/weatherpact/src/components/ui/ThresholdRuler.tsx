import type { Pact } from '../../types/weatherpact';
import { getComparator, getMetric } from '../../lib/weather';

export function ThresholdRuler({
  pact,
  inverse = false,
}: {
  pact: Pick<Pact, 'metric' | 'comparator' | 'threshold'>;
  inverse?: boolean;
}) {
  const metric = getMetric(pact.metric);
  const comparator = getComparator(pact.comparator);
  const min = pact.threshold < 0 ? pact.threshold - 10 : 0;
  const max = pact.threshold > 0 ? Math.max(pact.threshold * 1.6, 1) : pact.threshold + 10;
  const marker = Math.min(94, Math.max(6, ((pact.threshold - min) / (max - min)) * 100));
  const displayNumber = (value: number) => Number(value.toFixed(1));

  return (
    <div className="w-full">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div
            className={
              inverse
                ? 'text-[10px] uppercase tracking-[0.16em] text-white/45'
                : 'text-[10px] uppercase tracking-[0.16em] text-slate'
            }
          >
            Threshold instrument
          </div>
          <div
            className={
              inverse ? 'mt-1 font-mono text-xl text-white' : 'mt-1 font-mono text-xl text-current'
            }
          >
            {comparator.symbol} {pact.threshold}{' '}
            <span className={inverse ? 'text-sm text-lime' : 'text-sm text-teal'}>
              {metric.unit}
            </span>
          </div>
        </div>
        <div
          className={
            inverse ? 'font-mono text-[10px] text-white/45' : 'font-mono text-[10px] text-slate'
          }
        >
          {metric.shortLabel}
        </div>
      </div>
      <div
        className="relative h-14"
        aria-label={`${metric.label}, ${comparator.label} ${pact.threshold} ${metric.unit}`}
        role="img"
      >
        <div
          className={
            inverse
              ? 'absolute inset-x-0 bottom-3 flex h-10 items-end justify-between border-b border-white/20'
              : 'absolute inset-x-0 bottom-3 flex h-10 items-end justify-between border-b border-current/20'
          }
        >
          {Array.from({ length: 41 }, (_, index) => (
            <span
              key={index}
              className={
                index % 5 === 0
                  ? 'h-4 w-px bg-current opacity-30'
                  : 'h-2 w-px bg-current opacity-20'
              }
              style={inverse ? { backgroundColor: '#fff' } : undefined}
            />
          ))}
        </div>
        <div
          className="absolute bottom-0 top-0 transition-all duration-500"
          style={{ left: `${marker}%` }}
        >
          <div className="absolute bottom-2 h-11 w-px bg-lime" />
          <div className="absolute -left-[5px] bottom-1 h-2.5 w-2.5 rotate-45 bg-lime" />
          <div
            className={
              inverse
                ? 'absolute -left-3 top-0 h-1.5 w-1.5 rounded-full bg-lime'
                : 'absolute -left-3 top-0 h-1.5 w-1.5 rounded-full bg-teal'
            }
          />
        </div>
      </div>
      <div
        className={
          inverse
            ? 'mt-1 flex justify-between font-mono text-[9px] text-white/40'
            : 'mt-1 flex justify-between font-mono text-[9px] text-slate'
        }
      >
        <span>
          {displayNumber(min)} {metric.unit}
        </span>
        <span>TARGET</span>
        <span>
          {displayNumber(max)} {metric.unit}
        </span>
      </div>
    </div>
  );
}
