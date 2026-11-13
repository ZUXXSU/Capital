// ─────────────────────────────────────────────────────────────────────────────
// Keyboard navigation layer.
//
// Design goal: a legacy PACE operator must be able to drive v2 with the SAME
// keystrokes as the DOS app — number hotkeys for menus, F-keys for pickers,
// Esc to go back, Enter to confirm — WHILE every action is also reachable by
// mouse. Keyboard and mouse are peers, never either/or.
//
// Legacy keystroke map (from SUMMARY.md Part II / Operator's Manual):
//   Main menu:    1 Masters · 2 Vouchers · 3 Bills · 4 Books · 5 Reports
//                 6 Open/Clos · 7 Accessories · 8 Setup · 9 Installation · 0 Quit
//   Voucher pick: 1 Petty · 2 BankRcpt · 3 BankPay · 4 CashRcpt · 5 CashPay
//                 6 Journal · 7 Memo
//   Ledger pick:  F1 alphabetical · F2 accountwise · F4 member list
//   Universal:    Esc = back/cancel · Enter = confirm/next field
// ─────────────────────────────────────────────────────────────────────────────

export type Scope = string; // e.g. 'global', 'main-menu', 'voucher-entry'

export interface Hotkey {
  /** key string as produced by normalizeKey(): 'f1', 'enter', 'esc', '1', 'ctrl+s' */
  combo: string;
  label: string;
  scope: Scope;
  run: () => void;
  /** when true, fires even while a text input is focused (e.g. Esc, F-keys) */
  whenTyping?: boolean;
}

export function normalizeKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey && e.key.length > 1) parts.push('shift');
  let k = e.key.toLowerCase();
  if (k === 'escape') k = 'esc';
  if (k === ' ') k = 'space';
  parts.push(k);
  return parts.join('+');
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return TYPING_TAGS.has(el.tagName) || el.isContentEditable;
}

/** Keys that must still work while a field is focused. */
export function alwaysActive(combo: string): boolean {
  return combo === 'esc' || /^f\d{1,2}$/.test(combo) || combo.startsWith('ctrl+');
}

// A tiny global registry keyed by scope. The active scope stack is managed by
// the HotkeyProvider; the deepest scope wins, falling back to 'global'.
type Registry = Map<Scope, Map<string, Hotkey>>;
export function createRegistry(): Registry {
  return new Map();
}
