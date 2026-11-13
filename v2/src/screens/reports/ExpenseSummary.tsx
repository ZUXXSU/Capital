import { Fragment, useState } from 'react';
import { incomeExpenditure } from '../../engine/balances';
import { formatPaise } from '../../lib/money';
import { Card } from '../../ui/primitives';
import { EmptyReport, ReportShell, useCompanyId, useQuery } from './shared';

/** Reports → 7. Expense Summary — expenditure ledgers grouped, with % of total. */
export function ExpenseSummaryScreen() {
  const companyId = useCompanyId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const data = useQuery(
    () => (companyId ? incomeExpenditure(companyId, from || undefined, to || undefined) : Promise.resolve(undefined)),
    [companyId, from, to],
  );

  return (
    <ReportShell
      title="Expense Summary"
      subtitle="All expenditure for the period, grouped, with each head's share of the total."
      scope="expense-summary"
      backTo="/reports"
      range={{ from, to, onFrom: setFrom, onTo: setTo }}
    >
      {!data ? null : data.expenditure.length === 0 ? (
        <EmptyReport />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-fg-soft">
              <tr>
                <th className="text-left px-3 py-2">Group</th>
                <th className="text-left px-3 py-2">Ledger</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-right px-3 py-2">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {data.expenditure.map((g) => (
                <Fragment key={g.groupId}>
                  {g.lines.map((l, i) => (
                    <tr key={l.ledgerId} className="border-t border-border">
                      {i === 0 && <td className="px-3 py-1.5 font-medium align-top" rowSpan={g.lines.length}>{g.groupName}</td>}
                      <td className="px-3 py-1.5">{l.ledgerName}</td>
                      <td className="tabular text-right px-3 py-1.5">{formatPaise(l.amount)}</td>
                      <td className="tabular text-right px-3 py-1.5 text-fg-soft">
                        {data.totalExpenditure ? ((l.amount / data.totalExpenditure) * 100).toFixed(1) : '0.0'}%
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold bg-surface-2">
                <td className="px-3 py-2" colSpan={2}>Total Expenditure</td>
                <td className="tabular text-right px-3 py-2">{formatPaise(data.totalExpenditure)}</td>
                <td className="tabular text-right px-3 py-2">100.0%</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </ReportShell>
  );
}
