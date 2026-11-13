import { useState } from 'react';
import { ledgerStatement } from '../../engine/balances';
import { balanceLabel } from '../../lib/money';
import { Badge, Card } from '../../ui/primitives';
import { useHotkey } from '../../keyboard/HotkeyProvider';
import { EmptyReport, LedgerPicker, Money, ReportShell, useCompanyId, useQuery, VOUCHER_LABEL } from './shared';
import type { Ledger } from '../../types/model';

/** Reports → 1. Ledger — pick an account (F1/F4 or click), see its statement with running balance. */
export function LedgerReportScreen() {
  const companyId = useCompanyId();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [showPicker, setShowPicker] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useHotkey('f1', 'Pick ledger', () => setShowPicker(true), { scope: 'ledger-report', whenTyping: true });

  const rows = useQuery(
    () => (companyId && ledger ? ledgerStatement(companyId, ledger.id, from || undefined, to || undefined) : Promise.resolve(undefined)),
    [companyId, ledger?.id, from, to],
  );

  if (companyId && showPicker) {
    return (
      <LedgerPicker
        companyId={companyId}
        onPick={(l) => { setLedger(l); setShowPicker(false); }}
        onCancel={() => setShowPicker(false)}
      />
    );
  }

  return (
    <ReportShell
      title={ledger ? `Ledger — ${ledger.name}` : 'Ledger'}
      subtitle={ledger ? `Code ${ledger.code} · statement with running balance` : 'Press F1 to choose a ledger account.'}
      scope="ledger-report"
      backTo="/reports"
      range={ledger ? { from, to, onFrom: setFrom, onTo: setTo } : undefined}
      extraActions={
        <button
          className="h-9 px-3 rounded-lg border border-border text-sm hover:bg-surface-2 keycap-parent"
          onClick={() => setShowPicker(true)}
        >
          Change ledger <span className="keycap ml-1">F1</span>
        </button>
      }
    >
      {!ledger ? (
        <EmptyReport hint="No ledger selected — press F1 or click &quot;Change ledger&quot;." />
      ) : !rows ? null : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-fg-soft">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Voucher</th>
                <th className="text-left px-3 py-2">Particulars</th>
                <th className="text-right px-3 py-2">Debit</th>
                <th className="text-right px-3 py-2">Credit</th>
                <th className="text-right px-3 py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const bal = balanceLabel(r.balance);
                return (
                  <tr key={i} className={`border-t border-border ${r.particulars === 'Opening Balance' ? 'bg-surface-2/60 font-medium' : ''}`}>
                    <td className="px-3 py-1.5">{r.date || '—'}</td>
                    <td className="px-3 py-1.5 text-fg-soft">{r.voucherNo ? `${VOUCHER_LABEL[r.voucherType]} #${r.voucherNo}` : ''}</td>
                    <td className="px-3 py-1.5">{r.particulars}</td>
                    <Money value={r.debit} />
                    <Money value={r.credit} />
                    <td className="tabular text-right px-3 py-1.5">
                      {bal.text}{bal.drcr && <span className="text-muted"> {bal.drcr}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length <= 1 && (
            <div className="p-4"><Badge>No postings in this range</Badge></div>
          )}
        </Card>
      )}
    </ReportShell>
  );
}
