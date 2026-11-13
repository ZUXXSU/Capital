import { useState } from 'react';
import { financialStatus } from '../../engine/balances';
import { formatPaise } from '../../lib/money';
import { Card } from '../../ui/primitives';
import { ReportShell, useCompanyId, useQuery } from './shared';

/** Reports → 9. Financial Status — one-page management / MC-meeting snapshot. */
export function FinancialStatusScreen() {
  const companyId = useCompanyId();
  const [asOn, setAsOn] = useState('');

  const data = useQuery(
    () => (companyId ? financialStatus(companyId, asOn || undefined) : Promise.resolve(undefined)),
    [companyId, asOn],
  );

  const cards = data && [
    { label: 'Cash & Bank', value: data.cashAndBank, tone: 'positive' as const },
    { label: 'Receivables (Member Dues)', value: data.receivables, tone: 'default' as const },
    { label: 'Payables', value: data.payables, tone: 'negative' as const },
    { label: 'Total Assets', value: data.totalAssets, tone: 'default' as const },
    { label: 'Total Liabilities', value: data.totalLiabilities, tone: 'default' as const },
    { label: 'Income to date', value: data.income, tone: 'positive' as const },
    { label: 'Expenditure to date', value: data.expenditure, tone: 'negative' as const },
    { label: data.surplus >= 0 ? 'Surplus' : 'Deficit', value: Math.abs(data.surplus), tone: data.surplus >= 0 ? 'positive' as const : 'negative' as const },
  ];

  return (
    <ReportShell
      title="Financial Status"
      subtitle="Management snapshot — headline figures as on the selected date."
      scope="financial-status"
      backTo="/reports"
      range={{ from: '', to: asOn, onFrom: () => {}, onTo: setAsOn, singleDate: true }}
    >
      {cards && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Card key={c.label} className="p-4">
              <div className="text-xs text-muted">{c.label}</div>
              <div className={`text-xl font-semibold tabular mt-1 ${c.tone === 'positive' ? 'text-positive' : c.tone === 'negative' ? 'text-negative' : ''}`}>
                {formatPaise(c.value, { symbol: true })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </ReportShell>
  );
}
