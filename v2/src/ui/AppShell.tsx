import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useHotkey } from '../keyboard/HotkeyProvider';
import { useSession } from '../store/session';

// Navigation mirrors the legacy PACE main menu. Each item keeps its original
// number hotkey (1-9) so muscle memory transfers, and is clickable by mouse.
export const NAV = [
  { to: '/masters', label: 'Masters', hotkey: '1', hint: 'Ledgers, Groups, Members' },
  { to: '/vouchers', label: 'Vouchers', hotkey: '2', hint: 'Receipts, Payments, Journal' },
  { to: '/bills', label: 'Bills', hotkey: '3', hint: 'Society maintenance billing' },
  { to: '/books', label: 'Account Books', hotkey: '4', hint: 'Cash, Bank, Journal books' },
  { to: '/reports', label: 'Reports', hotkey: '5', hint: 'Trial Balance, B/S, I&E' },
  { to: '/balances', label: 'Open/Close', hotkey: '6', hint: 'Opening & closing balances' },
  { to: '/tools', label: 'Accessories', hotkey: '7', hint: 'BRS, backup, utilities' },
  { to: '/setup', label: 'Setup', hotkey: '8', hint: 'Bill design, settings' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { activeCompany, theme, toggleTheme } = useSession();

  // Global PACE-preserved hotkeys: digit keys jump to each menu.
  for (const item of NAV) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkey(item.hotkey, item.label, () => navigate(item.to), { scope: 'global' });
  }

  return (
    <div className="h-full grid grid-rows-[auto_1fr_auto] bg-bg">
      {/* Top bar */}
      <header className="h-14 px-4 flex items-center justify-between border-b border-border bg-surface">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-brand text-brand-fg grid place-items-center font-bold text-sm">C</div>
          <div className="leading-tight">
            <div className="font-semibold text-sm">CAPITAL</div>
            <div className="text-[11px] text-muted -mt-0.5">v2.0.0</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeCompany ? (
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{activeCompany.name}</div>
              <div className="text-[11px] text-muted">{activeCompany.periodStart} → {activeCompany.periodEnd}</div>
            </div>
          ) : (
            <span className="text-sm text-muted">No company selected</span>
          )}
          <button
            onClick={toggleTheme}
            className="h-8 px-3 rounded-lg border border-border text-sm hover:bg-surface-2"
            title="Toggle theme"
          >
            {theme === 'light' ? '◐' : '◑'}
          </button>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="grid grid-cols-[232px_1fr] overflow-hidden">
        <nav className="border-r border-border bg-surface p-2 overflow-y-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center justify-between gap-2 px-3 h-11 rounded-lg mb-0.5 group transition-colors',
                  isActive ? 'bg-brand/10 text-brand' : 'text-fg-soft hover:bg-surface-2 hover:text-fg',
                )
              }
            >
              <span className="flex flex-col">
                <span className="text-sm font-medium">{item.label}</span>
                <span className="text-[11px] text-muted">{item.hint}</span>
              </span>
              <span className="keycap">{item.hotkey}</span>
            </NavLink>
          ))}
        </nav>
        <main className="overflow-y-auto p-6 animate-fade-in">{children}</main>
      </div>

      {/* Status bar — echoes the legacy bottom status line */}
      <footer className="h-7 px-4 flex items-center justify-between border-t border-border bg-surface-2 text-[11px] text-muted font-mono">
        <span>CAPITAL PLUS — FINANCIAL ACCOUNTING</span>
        <span>{new Date().toLocaleDateString()} · press 1-8 to navigate · Esc to go back</span>
      </footer>
    </div>
  );
}
