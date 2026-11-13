// Searchable ledger picker shared by every voucher entry screen.
//
// Legacy parity (SUMMARY.md §3.8 / CONTRACT.md):
//   F1 -> alphabetical ledger list   F2 -> account-wise (code order) list
//   F4 -> member list                typing filters by name/code, Enter picks
//   Esc closes the open list (and otherwise bubbles to cancel the form)
// Mouse parity: click to open, click a row to pick, click elsewhere to close.
import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import type { Ledger } from '../../types/model';
import { useHotkeyCtx } from '../../keyboard/HotkeyProvider';
import type { Scope } from '../../keyboard/hotkeys';

type SortMode = 'alpha' | 'code' | 'members';

export function LedgerPicker({
  ledgers,
  value,
  onChange,
  label,
  placeholder = 'Type a name…',
  preferred,
  inputRef,
  onEnterNext,
}: {
  ledgers: Ledger[];
  value: string;
  onChange: (ledgerId: string) => void;
  label: string;
  placeholder?: string;
  /** Predicate used to pick the default shortlist shown before the operator types anything. */
  preferred?: (l: Ledger) => boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Called when Enter is pressed and no dropdown row is being picked — advance to the next field. */
  onEnterNext?: () => void;
}) {
  const instanceId = useId();
  const { pushScope, register } = useHotkeyCtx();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('alpha');
  const [highlight, setHighlight] = useState(0);
  const localRef = useRef<HTMLInputElement | null>(null);

  const selected = ledgers.find((l) => l.id === value);

  // F1/F2/F4 only act while this specific picker is focused — scoped per
  // instance so multiple pickers on one screen (e.g. Journal lines) don't
  // steal each other's keystrokes.
  const focusScope: Scope = `ledger-focus-${instanceId}`;
  const openScope: Scope = `ledger-open-${instanceId}`;

  useEffect(() => {
    if (!focused) return;
    return pushScope(focusScope);
  }, [focused, pushScope, focusScope]);

  useEffect(() => {
    if (!open) return;
    return pushScope(openScope);
  }, [open, pushScope, openScope]);

  useEffect(() => {
    const unregisters = [
      register({ combo: 'f1', label: 'Alphabetical list', scope: focusScope, run: () => { setSortMode('alpha'); setOpen(true); }, whenTyping: true }),
      register({ combo: 'f2', label: 'Account-wise list', scope: focusScope, run: () => { setSortMode('code'); setOpen(true); }, whenTyping: true }),
      register({ combo: 'f4', label: 'Member list', scope: focusScope, run: () => { setSortMode('members'); setOpen(true); }, whenTyping: true }),
      register({ combo: 'esc', label: 'Close picker', scope: openScope, run: () => setOpen(false), whenTyping: true }),
      register({ combo: 'arrowdown', label: 'Next ledger', scope: openScope, run: () => setHighlight((h) => h + 1), whenTyping: true }),
      register({ combo: 'arrowup', label: 'Previous ledger', scope: openScope, run: () => setHighlight((h) => Math.max(0, h - 1)), whenTyping: true }),
    ];
    return () => unregisters.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusScope, openScope, register]);

  const base = sortMode === 'members' ? ledgers.filter((l) => l.isMember) : ledgers;
  const filtered = base
    .filter((l) => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortMode === 'code') return a.code.localeCompare(b.code);
      return a.name.localeCompare(b.name);
    });

  const shortlist = !query.trim() && preferred ? [...filtered].sort((a, b) => Number(!!b && preferred(b)) - Number(!!a && preferred(a))) : filtered;
  const rows = shortlist.slice(0, 50);
  const activeIndex = Math.min(highlight, Math.max(0, rows.length - 1));

  function pick(l: Ledger) {
    onChange(l.id);
    setQuery('');
    setOpen(false);
    setHighlight(0);
  }

  return (
    <div className="relative">
      <span className="block text-xs font-medium text-fg-soft mb-1">{label}</span>
      <input
        ref={(el) => {
          localRef.current = el;
          if (typeof inputRef === 'function') inputRef(el);
          else if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
        }}
        className={clsx(
          'w-full h-9 px-3 rounded-lg bg-surface border border-border text-sm text-fg',
          'placeholder:text-muted focus:border-brand focus:outline-none transition-colors',
        )}
        value={focused ? query : selected?.name ?? ''}
        placeholder={selected ? selected.name : placeholder}
        onFocus={() => { setFocused(true); setOpen(true); setQuery(''); }}
        onBlur={() => window.setTimeout(() => { setFocused(false); setOpen(false); }, 120)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (open && rows[activeIndex]) pick(rows[activeIndex]);
            else onEnterNext?.();
          }
        }}
      />
      {selected && (
        <span className="absolute right-2 top-[26px] text-[11px] text-muted tabular">{selected.code}</span>
      )}
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between px-2 py-1 border-b border-border text-[10px] text-muted">
            <span>{sortMode === 'members' ? 'Members' : sortMode === 'code' ? 'By code' : 'A–Z'}</span>
            <span className="flex gap-1">
              <span className="keycap">F1</span>
              <span className="keycap">F2</span>
              <span className="keycap">F4</span>
            </span>
          </div>
          {rows.length === 0 && <div className="px-3 py-2 text-sm text-muted">No ledgers match.</div>}
          {rows.map((l, i) => (
            <div
              key={l.id}
              onMouseDown={(e) => { e.preventDefault(); pick(l); }}
              className={clsx(
                'px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between gap-2',
                i === activeIndex ? 'bg-brand/10 text-brand' : 'hover:bg-surface-2',
              )}
            >
              <span className="truncate">{l.name}</span>
              <span className="text-[11px] text-muted tabular shrink-0">{l.code}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
