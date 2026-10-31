'use client';

import Link from 'next/link';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

// ------------------------------------------------------------------ labels
const LABELS: Record<string, string> = {
  AI_ML: 'AI & ML',
  IOT: 'IoT',
  DEVOPS: 'DevOps',
  SOFT_SKILL: 'Soft skills',
  REGISTRATION_CLOSED: 'Registration closed',
  STATUS_CHANGE: 'Status change',
};

/** RECRUITING -> "Recruiting", AI_ML -> "AI & ML" (database enums shown in sentence case). */
export function label(value: string | null | undefined): string {
  if (!value) return '';
  return LABELS[value] ?? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

// ------------------------------------------------------------------ layout
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-slate-200 pb-6">
      <div className="min-w-0 max-w-3xl">
        <h1 className="display text-4xl text-ink sm:text-5xl">{title}</h1>
        {subtitle && <div className="mt-2.5 text-[15px] text-slate-600">{subtitle}</div>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="display-soft text-xl text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Inline facts separated by space instead of "A · B · C". */
export function Meta({ items, className = '' }: { items: ReactNode[]; className?: string }) {
  return (
    <span className={`flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-600 ${className}`}>
      {items.filter((x) => x !== null && x !== undefined && x !== false && x !== '').map((x, i) => (
        <span key={i}>{x}</span>
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ actions
const buttonStyles = {
  primary: 'bg-pine-600 text-white hover:bg-pine-700',
  secondary: 'border border-slate-300 bg-white text-ink hover:border-ink',
  danger: 'bg-brick-600 text-white hover:bg-brick-700',
  success: 'bg-pine-800 text-white hover:bg-ink',
};
type Variant = keyof typeof buttonStyles;
const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={`${buttonBase} ${buttonStyles[variant]} ${className}`} />;
}

export function LinkButton({ href, children, variant = 'primary' }: { href: string; children: ReactNode; variant?: Variant }) {
  return (
    <Link href={href} className={`${buttonBase} ${buttonStyles[variant]}`}>
      {children}
    </Link>
  );
}

// ------------------------------------------------------------------ feedback
export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-brick-600 bg-brick-50 text-brick-700',
    success: 'border-pine-600 bg-pine-50 text-pine-800',
    info: 'border-marigold-500 bg-marigold-50 text-ink',
  };
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`anim-pop rounded-md border-l-4 px-4 py-3 text-sm ${styles[kind]}`}>
      {children}
    </div>
  );
}

const badgeStyles: Record<string, { box: string; dot?: string }> = {
  RECRUITING: { box: 'bg-pine-50 text-pine-700', dot: 'bg-pine-600' },
  FULL: { box: 'bg-marigold-100 text-marigold-700', dot: 'bg-marigold-500' },
  LOCKED: { box: 'bg-ink text-paper' },
  DISBANDED: { box: 'bg-slate-100 text-slate-500 line-through decoration-slate-400' },
  PENDING: { box: 'bg-marigold-100 text-marigold-700', dot: 'bg-marigold-500' },
  ACCEPTED: { box: 'bg-pine-50 text-pine-700', dot: 'bg-pine-600' },
  REJECTED: { box: 'bg-brick-50 text-brick-700', dot: 'bg-brick-600' },
  WITHDRAWN: { box: 'bg-slate-100 text-slate-500' },
  SUBMITTED: { box: 'border border-slate-300 bg-white text-slate-700', dot: 'bg-marigold-500' },
  APPROVED: { box: 'bg-pine-600 text-white' },
  DRAFT: { box: 'bg-slate-100 text-slate-500' },
  OPEN: { box: 'bg-pine-50 text-pine-700', dot: 'bg-pine-600' },
  REGISTRATION_CLOSED: { box: 'bg-marigold-100 text-marigold-700' },
  COMPLETED: { box: 'bg-slate-100 text-slate-500' },
  STUDENT: { box: 'bg-slate-100 text-slate-700' },
  FACULTY: { box: 'bg-pine-50 text-pine-700' },
  ADMIN: { box: 'bg-ink text-paper' },
  LEADER: { box: 'bg-ink text-paper' },
  MEMBER: { box: 'bg-slate-100 text-slate-700' },
};

export function Badge({ children }: { children: string }) {
  const s = badgeStyles[children] ?? { box: 'bg-slate-100 text-slate-700' };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.box}`}>
      {s.dot && <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />}
      {label(children)}
    </span>
  );
}

export function Chips({ items, highlight = [] }: { items: string[]; highlight?: string[] }) {
  if (!items || items.length === 0) return <span className="text-xs text-slate-400">None listed</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((s) => (
        <span
          key={s}
          className={`rounded px-1.5 py-0.5 text-xs ${
            highlight.includes(s) ? 'bg-marigold-200 font-semibold text-ink' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {s}
        </span>
      ))}
    </span>
  );
}

export function Stat({ label: text, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3.5">
      <p className="text-sm font-medium text-slate-600">{text}</p>
      <p className="display tabular mt-1 text-4xl text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Similarity / match score: marigold bar that fills once when it appears. */
export function ScoreBar({ value, label: title }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-2" title={title}>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
        <div className="anim-grow h-full rounded-full bg-marigold-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular w-9 text-xs font-semibold text-slate-700">{pct.toFixed(0)}%</span>
    </div>
  );
}

/**
 * Team capacity as seats: filled = members, dashed = open.
 * Seats that fill while the page is open pop in, so an accepted request is visible at a glance.
 */
export function Slots({ filled, total, size = 14, showText = true }: { filled: number; total: number; size?: number; showText?: boolean }) {
  const previous = useRef(filled);
  const grewFrom = filled > previous.current ? previous.current : filled;
  useEffect(() => {
    previous.current = filled;
  }, [filled]);

  const open = Math.max(0, total - filled);
  return (
    <span className="inline-flex items-center gap-2" aria-label={`${filled} of ${total} members, ${open} open`}>
      <span className="inline-flex items-center gap-1" style={{ ['--seat' as string]: `${size}px` }}>
        {Array.from({ length: total }, (_, i) => {
          const isFilled = i < filled;
          const isNew = isFilled && i >= grewFrom;
          return (
            <span
              key={`${i}-${isFilled}`}
              className={`seat ${isFilled ? 'seat-filled' : 'seat-open'} ${isNew ? 'seat-new' : ''}`}
              style={isNew ? { animationDelay: `${(i - grewFrom) * 90}ms` } : undefined}
            />
          );
        })}
      </span>
      {showText && (
        <span className="tabular text-xs text-slate-600">
          {filled}/{total}
          {open > 0 ? `, ${open} open` : ''}
        </span>
      )}
    </span>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-16" style={{ opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">{children}</p>;
}

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const d = new Date(value);
  return withTime
    ? d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

/** Renders text where ts_headline wrapped matches in [[ ]] — no HTML injection possible. */
export function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('[[') && p.endsWith(']]') ? (
          <mark key={i} className="rounded-sm bg-marigold-200 px-0.5 text-ink">
            {p.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
