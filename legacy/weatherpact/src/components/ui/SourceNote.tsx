import * as Popover from '@radix-ui/react-popover';
import { BookOpen, Info } from 'lucide-react';
import { SOURCE_DISCLOSURE } from '../../config';
import { cn } from '../../lib/utils';

export function SourceNote({
  inverse = false,
  className,
}: {
  inverse?: boolean;
  className?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className={cn(
            'group inline-flex items-center gap-2 rounded-sm text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2',
            inverse ? 'text-white/60 hover:text-white' : 'text-slate hover:text-current',
            className,
          )}
        >
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="border-b border-dotted border-current/30 group-hover:border-teal">
            About weather evidence
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={10}
          collisionPadding={16}
          className="z-[80] w-[min(360px,calc(100vw-32px))] animate-fade-up rounded-md border border-current/15 bg-salt p-5 text-current shadow-lift focus:outline-none"
        >
          <div className="mb-3 flex items-center gap-2 font-heading text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-teal" aria-hidden="true" />
            Read the weather record carefully
          </div>
          <p className="text-sm leading-6 text-slate">{SOURCE_DISCLOSURE}</p>
          <p className="mt-3 border-t border-cloud pt-3 text-xs leading-5 text-slate">
            A GenLayer resolution is an on-chain evaluation of the selected dataset. It does not
            mean WeatherPact independently verified conditions across multiple providers.
          </p>
          <Popover.Arrow className="fill-salt" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
