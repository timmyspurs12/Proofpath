import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'lime' | 'dark';

export function buttonStyles(variant: ButtonVariant = 'primary', className?: string) {
  return cn(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45',
    variant === 'primary' && 'bg-teal text-white hover:bg-current',
    variant === 'secondary' && 'bg-cloud/60 text-current hover:bg-cloud',
    variant === 'outline' &&
      'border border-current/20 bg-transparent text-current hover:border-teal hover:bg-white',
    variant === 'ghost' && 'text-slate hover:bg-current/5 hover:text-current',
    variant === 'lime' && 'bg-lime text-current hover:bg-white',
    variant === 'dark' && 'bg-current text-white hover:bg-teal',
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonStyles(variant, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
