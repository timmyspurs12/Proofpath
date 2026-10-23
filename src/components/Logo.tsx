import { Link } from 'react-router-dom';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand" aria-label="ProofPath home">
      <svg className="brand-mark" viewBox="0 0 44 44" role="img" aria-hidden="true">
        <rect x="1" y="1" width="42" height="42" rx="11" fill="currentColor" />
        <path d="M12 10.5h15.5v23H12z" fill="var(--brand-paper)" />
        <path d="M16.5 17h6M16.5 22h6M16.5 27h3.5" className="brand-lines" />
        <path d="m23.5 26 3.5 3.5 7-9" className="brand-check" />
      </svg>
      {!compact && (
        <span className="brand-type">
          <strong>ProofPath</strong>
          <span>Evidence to action</span>
        </span>
      )}
    </Link>
  );
}
