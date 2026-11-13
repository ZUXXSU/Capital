// Design-system primitives. Keep these the single source of visual truth so
// every module (built by different authors/agents) looks like one product.
import clsx from 'clsx';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'default',
  size = 'md',
  className,
  hotkey,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  hotkey?: string;
}) {
  return (
    <button
      className={clsx(
        'inline-flex items-center gap-2 rounded-lg font-medium transition-colors select-none',
        'focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-9 px-4 text-sm',
        variant === 'primary' && 'bg-brand text-brand-fg hover:brightness-110 shadow-card',
        variant === 'default' && 'bg-surface border border-border text-fg hover:bg-surface-2',
        variant === 'ghost' && 'text-fg-soft hover:bg-surface-2 hover:text-fg',
        variant === 'danger' && 'bg-negative text-white hover:brightness-110',
        className,
      )}
      {...rest}
    >
      {children}
      {hotkey && <span className="keycap">{hotkey}</span>}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-xl border border-border bg-surface shadow-card', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-fg-soft mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full h-9 px-3 rounded-lg bg-surface border border-border text-sm text-fg',
        'placeholder:text-muted focus:border-brand focus:outline-none transition-colors',
        className,
      )}
      {...rest}
    />
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'positive' | 'negative' | 'warning' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 h-5 rounded-full text-xs font-medium',
        tone === 'default' && 'bg-surface-2 text-fg-soft',
        tone === 'positive' && 'bg-positive/10 text-positive',
        tone === 'negative' && 'bg-negative/10 text-negative',
        tone === 'warning' && 'bg-warning/10 text-warning',
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-border mb-4" />
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
