// Vouchers module — legacy "Voucher Entry" submenu (SUMMARY.md §3.8 / Operator's
// Manual): 1 Petty cash · 2 Bank Receipt · 3 Bank Payment · 4 Cash Receipt ·
// 5 Cash Payment · 6 Journal · 7 Memo. Index lists the seven types with their
// number hotkeys as keycaps (also clickable) plus a recent-vouchers list; each
// type opens a fast entry screen built on the shared posting engine.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { useSession } from '../../store/session';
import type { Ledger, Voucher, VoucherType } from '../../types/model';
import { VOUCHER_TYPES } from '../../types/model';
import { Badge, Button, Card, EmptyState, PageHeader } from '../../ui/primitives';
import { formatPaise } from '../../lib/money';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { SimpleVoucherEntry } from './SimpleVoucherEntry';
import { JournalVoucherEntry } from './JournalVoucherEntry';

const TYPE_LABEL: Record<VoucherType, string> = {
  petty_cash: 'Petty Cash',
  bank_receipt: 'Bank Receipt',
  bank_payment: 'Bank Payment',
  cash_receipt: 'Cash Receipt',
  cash_payment: 'Cash Payment',
  journal: 'Journal Voucher',
  memo: 'Memo Voucher',
  contra: 'Contra',
};

/** Shared data + reload plumbing for the whole module, read once and passed down. */
function useVouchersData() {
  const activeCompany = useSession((s) => s.activeCompany);
  const [companyId, setCompanyId] = useState<string | undefined>(activeCompany?.id);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (activeCompany) {
      setCompanyId(activeCompany.id);
      return;
    }
    db.companies.toArray().then((cs) => setCompanyId(cs[0]?.id));
  }, [activeCompany]);

  const reload = useCallback(() => {
    if (!companyId) {
      setLedgers([]);
      setVouchers([]);
      setLoaded(true);
      return;
    }
    Promise.all([
      db.ledgers.where({ companyId }).toArray(),
      db.vouchers.where({ companyId }).toArray(),
    ]).then(([ls, vs]) => {
      setLedgers(ls.sort((a, b) => a.name.localeCompare(b.name)));
      setVouchers(vs.sort((a, b) => b.createdAt - a.createdAt));
      setLoaded(true);
    });
  }, [companyId]);

  useEffect(() => reload(), [reload]);

  return { companyId, ledgers, vouchers, reload, loaded };
}

function voucherTotal(v: Voucher): number {
  return v.lines.filter((l) => l.drCr === 'D').reduce((sum, l) => sum + l.amount, 0);
}

function RecentVouchers({ vouchers, ledgers }: { vouchers: Voucher[]; ledgers: Ledger[] }) {
  const byId = useMemo(() => new Map(ledgers.map((l) => [l.id, l.name])), [ledgers]);
  const recent = vouchers.slice(0, 12);

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-fg-soft mb-3">Recent Vouchers</h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted">No vouchers posted yet — pick a type above to get started.</p>
      ) : (
        <div className="divide-y divide-border">
          {recent.map((v) => (
            <div key={v.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{TYPE_LABEL[v.type]} #{v.number}</span>
                  {v.isMemo && <Badge tone="warning">Memo</Badge>}
                </div>
                <div className="text-xs text-muted truncate">
                  {v.date} · {v.lines.map((l) => byId.get(l.ledgerId) ?? '?').join(' / ')}
                  {v.narration ? ` · ${v.narration}` : ''}
                </div>
              </div>
              <div className="tabular font-medium shrink-0">{formatPaise(voucherTotal(v), { symbol: true })}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function VoucherIndex() {
  const navigate = useNavigate();
  const { ledgers, vouchers, loaded } = useVouchersData();
  useScope('vouchers-menu');

  for (const vt of VOUCHER_TYPES) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkey(vt.hotkey, vt.label, () => navigate(`/vouchers/${vt.type}`), { scope: 'vouchers-menu' });
  }

  if (!loaded) return null;

  return (
    <div className="max-w-5xl">
      <PageHeader title="Vouchers" subtitle="Enter a voucher — press its number or click a card." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {VOUCHER_TYPES.map((vt) => (
          <button
            key={vt.type}
            onClick={() => navigate(`/vouchers/${vt.type}`)}
            className="text-left p-4 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-brand/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{vt.label}</span>
              <span className="keycap">{vt.hotkey}</span>
            </div>
          </button>
        ))}
      </div>

      {ledgers.length === 0 ? (
        <EmptyState
          title="No ledgers yet"
          hint="Create your chart of accounts in Masters before posting vouchers — Cash and Bank ledgers are needed for receipts and payments."
          action={<Button variant="primary" onClick={() => navigate('/masters')}>Go to Masters</Button>}
        />
      ) : (
        <RecentVouchers vouchers={vouchers} ledgers={ledgers} />
      )}
    </div>
  );
}

function VoucherEntryScreen() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const { companyId, ledgers, reload, loaded } = useVouchersData();

  const valid = VOUCHER_TYPES.find((vt) => vt.type === type);
  if (!valid) return <Navigate to="/vouchers" replace />;
  if (!loaded) return null;

  if (!companyId) {
    return (
      <EmptyState
        title="No company set up"
        hint="Create a company first so vouchers have somewhere to post."
      />
    );
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={valid.label}
        subtitle="Date → ledgers → amount → narration → Save. Esc clears, Ctrl+S saves."
        actions={<Button variant="ghost" onClick={() => navigate('/vouchers')}>Back to Vouchers</Button>}
      />
      {valid.type === 'journal' || valid.type === 'memo' ? (
        <JournalVoucherEntry
          isMemo={valid.type === 'memo'}
          companyId={companyId}
          ledgers={ledgers}
          onSaved={reload}
        />
      ) : (
        <SimpleVoucherEntry
          type={valid.type as 'petty_cash' | 'bank_receipt' | 'bank_payment' | 'cash_receipt' | 'cash_payment'}
          companyId={companyId}
          ledgers={ledgers}
          onSaved={reload}
        />
      )}
    </div>
  );
}

export function VouchersModule() {
  return (
    <Routes>
      <Route path="/" element={<VoucherIndex />} />
      <Route path="/:type" element={<VoucherEntryScreen />} />
      <Route path="*" element={<Navigate to="/vouchers" replace />} />
    </Routes>
  );
}
