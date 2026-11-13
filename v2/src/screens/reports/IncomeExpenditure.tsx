import { useState } from 'react';
import { incomeExpenditure, type GroupBlock } from '../../engine/balances';
import { formatPaise } from '../../lib/money';
import { Badge, Card } from '../../ui/primitives';
import { EmptyReport, ReportShell, useCompanyId, useQuery } from './shared';

function Block({ block }: { block: GroupBlock }) {
  return (
    <div className="mb-1">
      <div className="flex justify-between px-3 py-1 text-fg-soft text-xs font-medium">
        <span>{block.groupName}</span>
      </div>
      {block.lines.map((l) => (
        <div key={l.ledgerId} className="flex justify-between px-3 py-1 text-sm">
          <span>{l.ledgerName}</span>
          <span className="tabular">{formatPaise(l.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between px-3 py-1 text-sm font-medium border-t border-border">
        <span>Total {block.groupName}</span>
        <span className="tabular">{formatPaise(block.total)}</span>
      </div>
    </div>
  );
}

/** Reports → 3. Income & Expenditure A/c — vertical format with surplus/deficit. */
export function IncomeExpenditureScreen() {
  const companyId = useCompanyId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const data = useQuery(
    () => (companyId ? incomeExpenditure(companyId, from || undefined, to || undefined) : Promise.resolve(undefined)),
    [companyId, from, to],
  );

  const empty = data && data.income.length === 0 && data.expenditure.length === 0;

  return (
    <ReportShell
      title="Income & Expenditure A/c"
      subtitle="Vertical format — Income less Expenditure for the period."
      scope="income-expenditure"
      backTo="/reports"
      range={{ from, to, onFrom: setFrom, onTo: setTo }}
      extraActions={data && !empty && (
        <Badge tone={data.surplus >= 0 ? 'positive' : 'negative'}>
          {data.surplus >= 0 ? 'Surplus' : 'Deficit'} {formatPaise(Math.abs(data.surplus))}
        </Badge>
      )}
    >
      {!data ? null : empty ? (
        <EmptyReport />
      ) : (
        <Card className="max-w-xl mx-auto p-4">
          <div className="text-sm font-semibold mb-2">Income</div>
          {data.income.map((b) => <Block key={b.groupId} block={b} />)}
          <div className="flex justify-between px-3 py-2 font-semibold border-t-2 border-border">
            <span>Total Income</span><span className="tabular">{formatPaise(data.totalIncome)}</span>
          </div>

          <div className="text-sm font-semibold mt-6 mb-2">Expenditure</div>
          {data.expenditure.map((b) => <Block key={b.groupId} block={b} />)}
          <div className="flex justify-between px-3 py-2 font-semibold border-t-2 border-border">
            <span>Total Expenditure</span><span className="tabular">{formatPaise(data.totalExpenditure)}</span>
          </div>

          <div className="flex justify-between px-3 py-3 mt-4 font-bold bg-surface-2 rounded-lg">
            <span>{data.surplus >= 0 ? 'Surplus (carried to Balance Sheet)' : 'Deficit (carried to Balance Sheet)'}</span>
            <span className="tabular">{formatPaise(Math.abs(data.surplus))}</span>
          </div>
        </Card>
      )}
    </ReportShell>
  );
}
