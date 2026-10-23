import { Link } from 'react-router-dom';

/**
 * ProofPath brand symbol.
 *
 * One continuous monoline draws the letter P; the upper arc extends into a rising
 * path that ends in an integral forward arrowhead — verified information becoming
 * directional action. The geometry is identical to public/brand/proofpath-symbol*.svg
 * and scripts/brand/generate-brand-assets.py. Color is inherited via currentColor.
 */
const SYMBOL_PATHS = [
  'M9.2 25.4 V10.8',
  'M9.2 8.6 H14.4 Q21.4 8.6 21.4 14 Q21.4 19.2 15.2 19.2 H9.2',
  'M18.2 9.3 L24.8 5.4',
];

const SYMBOL_ARROW = 'M26.8 4.3 L22.1 4.9 L24.9 8.6 Z';

export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={3.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {SYMBOL_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path fill="currentColor" d={SYMBOL_ARROW} />
    </svg>
  );
}

type LogoProps = {
  /** Symbol only, used in compact spaces (footer, collapsed navigation). */
  compact?: boolean;
  /** Light is the default ivory-surface lockup; dark inverts type for ink surfaces. */
  tone?: 'light' | 'dark';
};

export function Logo({ compact = false, tone = 'light' }: LogoProps) {
  return (
    <Link
      to="/"
      className={`brand brand-${tone}${compact ? ' brand-compact' : ''}`}
      aria-label="ProofPath home"
    >
      <BrandMark />
      {!compact && (
        <span className="brand-type">
          <span className="brand-word">
            <span className="brand-word-proof">Proof</span>
            <span className="brand-word-path">Path</span>
          </span>
          <span className="brand-tagline">Evidence to action</span>
        </span>
      )}
    </Link>
  );
}
