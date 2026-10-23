import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buttonStyles } from '../components/ui/Button';
import { ContourArt } from '../components/ui/ContourArt';

export function NotFoundPage() {
  return (
    <div className="surface relative flex min-h-[520px] items-center justify-center overflow-hidden p-6 text-center">
      <ContourArt className="absolute inset-0 h-full w-full opacity-50" />
      <div className="relative max-w-md">
        <Compass className="mx-auto mb-5 h-8 w-8 text-teal" />
        <div className="section-kicker">404 · Outside the isobars</div>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em]">
          This field note doesn’t exist.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate">
          The route may have changed. Return to the public record and pick up the evidence trail
          there.
        </p>
        <Link to="/" className={buttonStyles('primary', 'mt-6')}>
          <ArrowLeft className="h-4 w-4" />
          Back to Overview
        </Link>
      </div>
    </div>
  );
}
