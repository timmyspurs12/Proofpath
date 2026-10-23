import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CircleHelp,
  Lightbulb,
  LoaderCircle,
  Trash2,
  TriangleAlert,
  X,
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
      <Icon size={18} aria-hidden="true" />
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

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onCancel();
      }}
    >
      <div className="dialog-panel">
        <div className="dialog-icon" aria-hidden="true">
          <Trash2 size={20} />
        </div>
        <div className="dialog-copy">
          <span className="step-kicker">PLEASE CONFIRM</span>
          <h2 id={titleId}>{title}</h2>
          <div id={descriptionId}>{children}</div>
        </div>
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={onCancel} autoFocus>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function Toast({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="toast" role="status">
      <Check size={17} aria-hidden="true" />
      <span>{children}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss notification">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
