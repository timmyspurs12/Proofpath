import { cn } from '../../lib/utils';

export function WeatherPactMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn('h-10 w-10', className)}
      role="img"
      aria-label="WeatherPact contour mark"
    >
      <rect width="48" height="48" rx="12" fill="#1B736F" />
      <g
        fill="none"
        stroke="#D8EE6A"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 18.5C14.5 10.8 29.4 9.5 39 18c-7.3-2.7-14.8-1.8-20.2 2.3-4 3-7.1 2.5-9.8-1.8Z" />
        <path d="M9.5 26.2c7.2-6.4 18.6-6.5 29.2-1-8.2-1-14.2 1.1-19.2 5.2-4 3.2-7.8 1.1-10-4.2Z" />
        <path d="M18.2 34.3c5-4.1 11.4-5.4 18-4.1" />
      </g>
    </svg>
  );
}

export function Logo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <WeatherPactMark className="h-10 w-10 shrink-0" />
      {!compact && (
        <div>
          <div
            className={cn(
              'font-heading text-[19px] font-semibold tracking-[-0.04em]',
              dark ? 'text-white' : 'text-current',
            )}
          >
            Weather<span className={dark ? 'text-lime' : 'text-teal'}>Pact</span>
          </div>
          <div
            className={cn(
              'mt-0.5 text-[9px] font-medium uppercase tracking-[0.19em]',
              dark ? 'text-white/45' : 'text-slate',
            )}
          >
            Evidence, on record
          </div>
        </div>
      )}
    </div>
  );
}
