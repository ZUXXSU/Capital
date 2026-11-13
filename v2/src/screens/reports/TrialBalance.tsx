import { useState } from 'react';
import { trialBalance } from '../../engine/balances';
import { formatPaise } from '../../lib/money';
import { Badge, Card } from '../../ui/primitives';
import { EmptyReport, Money, ReportShell, useCompanyId, useQuery } from './shared';

/** Reports → 2. Trial Balance — every ledger's Dr/Cr closing balance, must net to zero. */
export function TrialBalanceScreen() {
  const companyId = useCompanyId();
  const [asOn, setAsOn] = useState('');

  const rows = useQuery(
    () => (companyId ? trialBalance(companyId, asOn || undefined) : Promise.resolve([])),
    [companyId, asOn],
  );

  const totalDebit = rows?.reduce((s, r) => s + r.debit, 0) ?? 0;
  const totalCredit = rows?.reduce((s, r) => s + r.credit, 0) ?? 0;
  const balanced = totalDebit === totalCredit;

  return (
    <ReportShell
      title="Trial Balance"
      subtitle="Every ledger's closing balance, split into Debit / Credit."
      scope="trial-balance"
      backTo="/reports"
      range={{ from: '', to: asOn, onFrom: () => {}, onTo: setAsOn, singleDate: true }}
      extraActions={rows && rows.length > 0 && (
        <Badge tone={balanced ? 'positive' : 'negative'}>{balanced ? 'Balanced' : 'Not balanced'}</Badge>
      )}
    >
      {!rows ? null : rows.length === 0 ? (
        <EmptyReport />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-fg-soft">
              <tr>
                <th className="text-left px-3 py-2">Ledger</th>
                <th className="text-left px-3 py-2">Group</th>
                <th className="text-right px-3 py-2">Debit</th>
                <th className="text-right px-3 py-2">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ledgerId} className="border-t border-border">
                  <td className="px-3 py-1.5">{r.ledgerName}</td>
                  <td className="px-3 py-1.5 text-fg-soft">{r.groupName}</td>
                  <Money value={r.debit} />
                  <Money value={r.credit} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold bg-surface-2">
                <td className="px-3 py-2" colSpan={2}>Total</td>
                <td className="tabular text-right px-3 py-2">{formatPaise(totalDebit)}</td>
                <td className="tabular text-right px-3 py-2">{formatPaise(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </ReportShell>
  );
}
