import { useState } from 'react';
import { balanceSheet, type GroupBlock } from '../../engine/balances';
import { formatPaise } from '../../lib/money';
import { Badge, Card } from '../../ui/primitives';
import { EmptyReport, ReportShell, useCompanyId, useQuery } from './shared';

function Side({ title, blocks, surplusLine }: { title: string; blocks: GroupBlock[]; surplusLine?: { label: string; amount: number } }) {
  const total = blocks.reduce((s, b) => s + b.total, 0) + (surplusLine?.amount ?? 0);
  return (
    <Card className="overflow-hidden">
      <div className="px-3 py-2 bg-surface-2 text-sm font-semibold">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {blocks.map((b) => (
            <tr key={b.groupId} className="border-t border-border">
              <td className="px-3 py-1.5">
                {b.groupName}
                {b.isSchedule && <span className="text-xs text-muted ml-1">(Schedule)</span>}
              </td>
              <td className="tabular text-right px-3 py-1.5">{formatPaise(b.total)}</td>
            </tr>
          ))}
          {surplusLine && (
            <tr className="border-t border-border italic">
              <td className="px-3 py-1.5">{surplusLine.label}</td>
              <td className="tabular text-right px-3 py-1.5">{formatPaise(surplusLine.amount)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-semibold bg-surface-2">
            <td className="px-3 py-2">Total</td>
            <td className="tabular text-right px-3 py-2">{formatPaise(total)}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

/** Reports → 4. Balance Sheet — Liabilities | Assets, grouped with schedules. */
export function BalanceSheetScreen() {
  const companyId = useCompanyId();
  const [asOn, setAsOn] = useState('');

  const data = useQuery(
    () => (companyId ? balanceSheet(companyId, asOn || undefined) : Promise.resolve(undefined)),
    [companyId, asOn],
  );

  const empty = data && data.liabilities.length === 0 && data.assets.length === 0 && data.periodSurplus === 0;

  return (
    <ReportShell
      title="Balance Sheet"
      subtitle="Liabilities & Assets as on the selected date, with the period's surplus/deficit folded in."
      scope="balance-sheet"
      backTo="/reports"
      range={{ from: '', to: asOn, onFrom: () => {}, onTo: setAsOn, singleDate: true }}
      extraActions={data && !empty && (
        <Badge tone={data.balanced ? 'positive' : 'negative'}>{data.balanced ? 'Balanced' : 'Not balanced'}</Badge>
      )}
    >
      {!data ? null : empty ? (
        <EmptyReport />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Side
            title="Liabilities"
            blocks={data.liabilities}
            surplusLine={{
              label: data.periodSurplus >= 0 ? 'Surplus (Income & Expenditure A/c)' : 'Deficit (Income & Expenditure A/c)',
              amount: data.periodSurplus,
            }}
          />
          <Side title="Assets" blocks={data.assets} />
        </div>
      )}
    </ReportShell>
  );
}
