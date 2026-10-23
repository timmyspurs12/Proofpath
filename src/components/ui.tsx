import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CircleHelp,
  Lightbulb,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import type { EvidenceStatus } from '../shared/schemas';
import { classNames, evidenceLabels } from '../lib/utils';

export function Button({
  variant = 'primary',
  size = 'medium',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
}) {
  return (
    <button
      className={classNames('button', `button-${variant}`, `button-${size}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
}) {
  const Icon =
    tone === 'error'
      ? AlertCircle
      : tone === 'warning'
        ? TriangleAlert
        : tone === 'success'
          ? CheckCircle2
          : CircleHelp;
  return (
    <div
      className={classNames('alert', `alert-${tone}`)}
      role={tone === 'error' ? 'alert' : 'status'}
      {...props}
    >
      <Icon size={19} aria-hidden="true" />
      <div>
        {title && <strong className="alert-title">{title}</strong>}
        <div className="alert-content">{children}</div>
      </div>
    </div>
  );
}

const statusIcons = {
  supported: CheckCircle2,
  inferred: Lightbulb,
  conflicting: TriangleAlert,
  unverifiable: CircleHelp,
};

export function EvidenceBadge({
  status,
  short = false,
}: {
  status: EvidenceStatus;
  short?: boolean;
}) {
  const Icon = statusIcons[status];
  return (
    <span className={classNames('evidence-badge', `evidence-${status}`)}>
      <Icon size={13} aria-hidden="true" />
      {short ? evidenceLabels[status].split(' —')[0] : evidenceLabels[status]}
    </span>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames('skeleton', className)} aria-hidden="true" {...props} />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h2>{title}</h2>
      <div className="empty-copy">{children}</div>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Toast({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="toast" role="status">
      <Check size={17} aria-hidden="true" />
      <span>{children}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss notification">
        ×
      </button>
    </div>
  );
}
