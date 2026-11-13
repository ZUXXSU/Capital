// ─────────────────────────────────────────────────────────────────────────────
// Reports + Account Books module.
//
// Mirrors the legacy PACE "Financial Rep." (Reports) and "Account Books"
// submenus — number/letter hotkeys preserved exactly (see SUMMARY.md
// Operator's Manual) — while being fully mouse-clickable too. All figures are
// derived live from db.vouchers/db.ledgers/db.groups via src/engine/balances.ts;
// nothing here is stored. Read-only, so safe to explore freely.
// ─────────────────────────────────────────────────────────────────────────────
import { useNavigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { PageHeader } from '../../ui/primitives';
import { NoCompany, useCompanyId } from './shared';
import { TrialBalanceScreen } from './TrialBalance';
import { LedgerReportScreen } from './LedgerReport';
import { BalanceSheetScreen } from './BalanceSheet';
import { IncomeExpenditureScreen } from './IncomeExpenditure';
import { CashFlowScreen } from './CashFlow';
import { ExpenseSummaryScreen } from './ExpenseSummary';
import { FinancialStatusScreen } from './FinancialStatus';
import { ReceiptsPaymentsScreen } from './ReceiptsPayments';
import { PettyCashBookScreen, CashBookScreen, BankBookScreen, JournalBookScreen } from './BookView';
import { BillRegisterScreen } from './BillRegister';

interface MenuItem { hotkey: string; label: string; hint: string; to: string }

function MenuGrid({ title, subtitle, items, base, scope }: {
  title: string; subtitle: string; items: MenuItem[]; base: string; scope: string;
}) {
  const navigate = useNavigate();
  useScope(scope);
  for (const item of items) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkey(item.hotkey, item.label, () => navigate(`${base}/${item.to}`), { scope });
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((item) => (
          <button
            key={item.to}
            onClick={() => navigate(`${base}/${item.to}`)}
            className="text-left p-4 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-brand/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{item.label}</span>
              <span className="keycap">{item.hotkey.toUpperCase()}</span>
            </div>
            <div className="text-xs text-muted mt-1">{item.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Wrap a sub-screen so a missing active company shows the guard instead of crashing on empty data. */
function Guarded({ children }: { children: ReactNode }) {
  const companyId = useCompanyId();
  if (!companyId) return <NoCompany />;
  return <>{children}</>;
}

const REPORT_ITEMS: MenuItem[] = [
  { hotkey: '1', label: 'Ledger', hint: 'Statement for any account, running balance', to: 'ledger' },
  { hotkey: '2', label: 'Trial Balance', hint: 'Every ledger, Dr/Cr, must balance', to: 'trial-balance' },
  { hotkey: '3', label: 'Income & Exp A/c', hint: 'Vertical surplus/deficit statement', to: 'income-expenditure' },
  { hotkey: '4', label: 'Balance Sheet', hint: 'Liabilities | Assets with schedules', to: 'balance-sheet' },
  { hotkey: '5', label: 'Cash Flow Stat.', hint: 'Cash & Bank movement over a period', to: 'cash-flow' },
  { hotkey: '7', label: 'Expense Summary', hint: 'Expenditure grouped with % of total', to: 'expense-summary' },
  { hotkey: '9', label: 'Financial Status', hint: 'One-page management snapshot', to: 'financial-status' },
  { hotkey: 'a', label: 'Recpts & Paymts', hint: 'Cash-basis receipts & payments a/c', to: 'receipts-payments' },
];

const BOOK_ITEMS: MenuItem[] = [
  { hotkey: '1', label: 'Petty Cash Book', hint: 'All Petty Cash vouchers, datewise', to: 'petty-cash' },
  { hotkey: '2', label: 'Cash Book', hint: 'Every voucher touching Cash', to: 'cash-book' },
  { hotkey: '3', label: 'Bank Book', hint: 'Select a bank, then its vouchers', to: 'bank-book' },
  { hotkey: '4', label: 'Bill Register', hint: 'Every maintenance bill raised', to: 'bill-register' },
  { hotkey: '5', label: 'Journal Book', hint: 'All Journal Vouchers, datewise', to: 'journal-book' },
];

function ReportsIndex() {
  return (
    <MenuGrid
      title="Reports"
      subtitle="Trial Balance, Ledger, Balance Sheet, Income & Expenditure and more — press a hotkey or click a card."
      items={REPORT_ITEMS}
      base="/reports"
      scope="reports-index"
    />
  );
}

function BooksIndex() {
  return (
    <MenuGrid
      title="Account Books"
      subtitle="Cash, Bank, Petty Cash & Journal registers — press a hotkey or click a card."
      items={BOOK_ITEMS}
      base="/books"
      scope="books-index"
    />
  );
}

export function ReportsModule() {
  return (
    <Routes>
      <Route path="/" element={<ReportsIndex />} />
      <Route path="/ledger" element={<Guarded><LedgerReportScreen /></Guarded>} />
      <Route path="/trial-balance" element={<Guarded><TrialBalanceScreen /></Guarded>} />
      <Route path="/income-expenditure" element={<Guarded><IncomeExpenditureScreen /></Guarded>} />
      <Route path="/balance-sheet" element={<Guarded><BalanceSheetScreen /></Guarded>} />
      <Route path="/cash-flow" element={<Guarded><CashFlowScreen /></Guarded>} />
      <Route path="/expense-summary" element={<Guarded><ExpenseSummaryScreen /></Guarded>} />
      <Route path="/financial-status" element={<Guarded><FinancialStatusScreen /></Guarded>} />
      <Route path="/receipts-payments" element={<Guarded><ReceiptsPaymentsScreen /></Guarded>} />
    </Routes>
  );
}

export function BooksModule() {
  return (
    <Routes>
      <Route path="/" element={<BooksIndex />} />
      <Route path="/petty-cash" element={<Guarded><PettyCashBookScreen /></Guarded>} />
      <Route path="/cash-book" element={<Guarded><CashBookScreen /></Guarded>} />
      <Route path="/bank-book" element={<Guarded><BankBookScreen /></Guarded>} />
      <Route path="/bill-register" element={<Guarded><BillRegisterScreen /></Guarded>} />
      <Route path="/journal-book" element={<Guarded><JournalBookScreen /></Guarded>} />
    </Routes>
  );
}
