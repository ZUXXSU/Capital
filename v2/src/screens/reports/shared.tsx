// Shared building blocks for every Reports / Account Books screen: a
// print-friendly page shell with date-range controls + Esc-to-back, a
// searchable ledger picker (F1 alphabetical / F4 member list, legacy-style),
// and small formatting helpers. Keep visuals token-only (see primitives.tsx).
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db } from '../../db/db';
import { useSession } from '../../store/session';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { Button, Card, EmptyState, Field, Input, PageHeader, Badge } from '../../ui/primitives';
import { formatPaise } from '../../lib/money';
import type { Ledger, VoucherType } from '../../types/model';
import { VOUCHER_TYPES } from '../../types/model';

export const VOUCHER_LABEL: Record<VoucherType, string> = Object.fromEntries(
  VOUCHER_TYPES.map((v) => [v.type, v.label]),
) as Record<VoucherType, string>;
VOUCHER_LABEL.contra = 'Contra';

/** Active company id, or null — every screen must guard for this. */
export function useCompanyId(): string | null {
  return useSession((s) => s.activeCompany?.id) ?? null;
}

/** Print-only stylesheet: hide the app shell chrome, keep just the report. */
function PrintStyle() {
  return (
    <style>{`
      @media print {
        header, nav, footer, .no-print { display: none !important; }
        main { padding: 0 !important; overflow: visible !important; }
        body, #root { height: auto !important; }
        .print-area { border: none !important; box-shadow: none !important; }
      }
    `}</style>
  );
}

/**
 * Common page frame for a single report/book: title, Back (Esc) + Print
 * buttons, optional date-range controls, and the content area. Registers
 * Esc in the given scope to return to the parent index.
 */
export function ReportShell({
  title,
  subtitle,
  scope,
  backTo,
  range,
  extraActions,
  children,
}: {
  title: string;
  subtitle?: string;
  scope: string;
  backTo: string;
  range?: {
    from: string; to: string;
    onFrom: (v: string) => void; onTo: (v: string) => void;
    singleDate?: boolean; // when true, only "as on" (to) matters
  };
  extraActions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  useScope(scope);
  useHotkey('esc', 'Back', () => navigate(backTo), { scope });

  return (
    <div>
      <PrintStyle />
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2 no-print">
            {extraActions}
            <Button variant="default" onClick={() => window.print()}>Print</Button>
            <Button variant="ghost" onClick={() => navigate(backTo)} hotkey="esc">Back</Button>
          </div>
        }
      />
      {range && (
        <Card className="p-4 mb-4 no-print">
          <div className="flex items-end gap-3">
            {!range.singleDate && (
              <Field label="From">
                <Input type="date" value={range.from} onChange={(e) => range.onFrom(e.target.value)} />
              </Field>
            )}
            <Field label={range.singleDate ? 'As on' : 'To'}>
              <Input type="date" value={range.to} onChange={(e) => range.onTo(e.target.value)} />
            </Field>
          </div>
        </Card>
      )}
      <div className="print-area">{children}</div>
    </div>
  );
}

/** Guard rail shown when no company is selected / DB is empty. */
export function NoCompany() {
  const navigate = useNavigate();
  return (
    <EmptyState
      title="No company selected"
      hint="Create or select a company under Masters before running reports."
      action={<Button variant="primary" onClick={() => navigate('/masters')}>Go to Masters</Button>}
    />
  );
}

export function EmptyReport({ hint }: { hint?: string }) {
  return (
    <EmptyState
      title="Nothing to show yet"
      hint={hint ?? 'No vouchers have been posted for this period. Enter vouchers first.'}
    />
  );
}

/**
 * Run an async query (engine/balances.ts functions) and re-run whenever deps
 * change. Guards against races so a slow stale fetch never clobbers a newer
 * one. Returns undefined while loading.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  const gen = useRef(0);
  useEffect(() => {
    const my = ++gen.current;
    setValue(undefined);
    fn().then((v) => { if (gen.current === my) setValue(v); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/** Right-aligned tabular money cell; blank when zero (classic ledger look). */
export function Money({ value, zeroBlank = true }: { value: number; zeroBlank?: boolean }) {
  if (value === 0 && zeroBlank) return <td className="tabular text-right px-3 py-1.5 text-muted">—</td>;
  return <td className="tabular text-right px-3 py-1.5">{formatPaise(value)}</td>;
}

/** Searchable ledger picker — F1 alphabetical / F4 members, Enter/click to pick, Esc to cancel. */
export function LedgerPicker({
  companyId,
  onPick,
  onCancel,
  membersOnly: membersOnlyDefault = false,
  fixedFilter,
  title = 'Search ledger by name or code…',
}: {
  companyId: string;
  onPick: (ledger: Ledger) => void;
  onCancel: () => void;
  membersOnly?: boolean;
  /** When set, replaces the F1/F4 alphabetical/members toggle with a fixed predicate (e.g. bank ledgers only). */
  fixedFilter?: (l: Ledger) => boolean;
  title?: string;
}) {
  const [query, setQuery] = useState('');
  const [membersOnly, setMembersOnly] = useState(membersOnlyDefault);
  const [index, setIndex] = useState(0);
  useScope('ledger-picker');

  const ledgers = useQuery(
    () => db.ledgers.where('companyId').equals(companyId).toArray(),
    [companyId],
  );

  const filtered = useMemo(() => {
    const list = (ledgers ?? []).filter((l) => (fixedFilter ? fixedFilter(l) : membersOnly ? l.isMember : true));
    const q = query.trim().toLowerCase();
    const matched = q ? list.filter((l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)) : list;
    return matched.sort((a, b) => a.name.localeCompare(b.name));
  }, [ledgers, query, membersOnly]);

  useEffect(() => setIndex(0), [filtered.length]);

  useHotkey('f1', 'Alphabetical', () => setMembersOnly(false), { scope: 'ledger-picker', whenTyping: true });
  useHotkey('f4', 'Members', () => setMembersOnly(true), { scope: 'ledger-picker', whenTyping: true });
  useHotkey('esc', 'Cancel', onCancel, { scope: 'ledger-picker', whenTyping: true });
  useHotkey('enter', 'Pick', () => { if (filtered[index]) onPick(filtered[index]); }, { scope: 'ledger-picker', whenTyping: true });
  useHotkey('arrowdown', 'Next', () => setIndex((i) => Math.min(i + 1, filtered.length - 1)), { scope: 'ledger-picker', whenTyping: true });
  useHotkey('arrowup', 'Prev', () => setIndex((i) => Math.max(i - 1, 0)), { scope: 'ledger-picker', whenTyping: true });

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 no-print" onClick={onCancel}>
      <Card className="w-[480px] max-h-[70vh] flex flex-col p-0" >
        <div className="p-3 border-b border-border" onClick={(e) => e.stopPropagation()}>
          <Input autoFocus placeholder={title} value={query} onChange={(e) => setQuery(e.target.value)} />
          {!fixedFilter && (
            <div className="flex items-center gap-2 mt-2">
              <Button size="sm" variant={membersOnly ? 'default' : 'primary'} hotkey="F1" onClick={() => setMembersOnly(false)}>Alphabetical</Button>
              <Button size="sm" variant={membersOnly ? 'primary' : 'default'} hotkey="F4" onClick={() => setMembersOnly(true)}>Members</Button>
            </div>
          )}
        </div>
        <div className="overflow-y-auto flex-1" onClick={(e) => e.stopPropagation()}>
          {filtered.length === 0 && <div className="p-6 text-sm text-muted text-center">No ledgers match.</div>}
          {filtered.map((l, i) => (
            <button
              key={l.id}
              onClick={() => onPick(l)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2 ${i === index ? 'bg-brand/10' : ''}`}
            >
              <span>{l.name}</span>
              <span className="flex items-center gap-2">
                {l.isBank && <Badge>Bank</Badge>}
                <span className="text-xs text-muted font-mono">{l.code}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="p-2 border-t border-border text-xs text-muted flex justify-between">
          <span>↑↓ navigate · Enter pick · Esc cancel</span>
        </div>
      </Card>
    </div>
  );
}
