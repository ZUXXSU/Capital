// Shared bits for the Masters module screens — kept here so Groups/Ledgers/
// Members stay visually and behaviourally consistent (one <select> look,
// one legacy-numbering guide, one category map).
import clsx from 'clsx';
import type { KeyboardEvent, SelectHTMLAttributes } from 'react';
import type { GroupNature, MemberCategory } from '../../types/model';

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        'w-full h-9 px-3 rounded-lg bg-surface border border-border text-sm text-fg',
        'focus:border-brand focus:outline-none transition-colors',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

/** Legacy GROUP.LAN numbering guide (SUMMARY.md §5.2) — guidance only, not enforced. */
export const NATURE_RANGES: Record<GroupNature, { range: string; hint: string }> = {
  liability: { range: '11–19', hint: '11–19 · x9 (19) reserved for Income & Expenditure A/c' },
  asset: { range: '21–29', hint: '21–29 · x9 (29) reserved' },
  income: { range: '31–39', hint: '31–39 · x9 (39) reserved for Excess of Expenditure over Income' },
  expenditure: { range: '41–49', hint: '41–49 · x9 (49) reserved for Excess of Income over Expenditure' },
};

export const NATURE_OPTIONS: { value: GroupNature; label: string }[] = [
  { value: 'liability', label: 'Liability' },
  { value: 'asset', label: 'Asset' },
  { value: 'income', label: 'Income' },
  { value: 'expenditure', label: 'Expenditure' },
];

/** Next free group code within a nature's legacy range, skipping the x9 reserved slot. */
export function suggestGroupCode(nature: GroupNature, existing: { code: string }[]): string {
  const base = { liability: 11, asset: 21, income: 31, expenditure: 41 }[nature];
  const used = new Set(existing.map((g) => g.code));
  for (let i = 0; i < 7; i++) {
    const candidate = String(base + i);
    if (!used.has(candidate)) return candidate;
  }
  return String(base);
}

/** Next free 4-digit sequence for a ledger code under a group, e.g. '26' -> '260003'. */
export function suggestLedgerCode(groupCode: string, existingInGroup: { code: string }[]): string {
  let max = 0;
  for (const l of existingInGroup) {
    const seq = Number(l.code.slice(groupCode.length));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return groupCode + String(max + 1).padStart(4, '0');
}

/** Legacy Cat column codes (SUMMARY.md §5.1), restricted to the set the model supports. */
export const CATEGORY_OPTIONS: { value: MemberCategory; code: string; label: string }[] = [
  { value: 'flat', code: 'F', label: 'Flat' },
  { value: 'shop', code: 'S', label: 'Shop' },
  { value: 'garage', code: 'G', label: 'Garage' },
  { value: 'gala', code: 'L', label: 'Gala' },
  { value: 'office', code: 'O', label: 'Office' },
  { value: 'parking', code: 'P', label: 'Parking' },
  { value: 'unit', code: 'U', label: 'Unit' },
];

/**
 * Enter-to-advance for keyboard-fast forms: finds every input/select/textarea
 * inside `container` (in DOM order) and focuses the one after the field that
 * fired the event; on the last field it calls `onDone` (submit) instead.
 * Works with the plain Input/Select primitives without needing forwardRef.
 */
export function handleEnterAdvance(e: KeyboardEvent, container: HTMLElement | null, onDone: () => void) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (!container) return onDone();
  const focusables = Array.from(container.querySelectorAll<HTMLElement>('input, select, textarea'));
  const idx = focusables.indexOf(e.currentTarget as HTMLElement);
  const next = focusables[idx + 1];
  if (next) next.focus();
  else onDone();
}
