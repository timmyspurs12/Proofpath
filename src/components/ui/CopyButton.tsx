import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied && !failed) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [copied, failed]);

  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs text-slate transition-colors hover:bg-current/5 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
        className,
      )}
      onClick={async () => {
        try {
          await copyText(value);
          setCopied(true);
        } catch {
          setFailed(true);
        }
      }}
      aria-label={`${label}: ${value}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-teal" /> : <Copy className="h-3.5 w-3.5" />}
      <span aria-live="polite">{copied ? 'Copied' : failed ? 'Copy failed' : label}</span>
    </button>
  );
}
