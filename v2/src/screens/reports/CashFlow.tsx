import { useState } from 'react';
import { cashFlowStatement } from '../../engine/balances';
import { formatPaise } from '../../lib/money';
import { Card } from '../../ui/primitives';
import { EmptyReport, Money, ReportShell, VOUCHER_LABEL, useCompanyId, useQuery } from './shared';

/** Reports → 5. Cash Flow Stat. — net movement of Cash & Bank over a period. */
export function CashFlowScreen() {
  const companyId = useCompanyId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const data = useQuery(
    () => (companyId ? cashFlowStatement(companyId, from || undefined, to || undefined) : Promise.resolve(undefined)),
    [companyId, from, to],
  );

  return (
    <ReportShell
      title="Cash Flow Statement"
      subtitle="Net movement of Cash & Bank ledgers over the period. Internal cash↔bank transfers net to zero."
      scope="cash-flow"
      backTo="/reports"
      range={{ from, to, onFrom: setFrom, onTo: setTo }}
    >
      {!data ? null : (
        <div className="grid grid-cols-[1fr_280px] gap-4">
          <Card className="overflow-hidden">
            {data.entries.length === 0 ? <EmptyReport /> : (
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-xs text-fg-soft">
                  <tr>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Voucher</th>
                    <th className="text-left px-3 py-2">Particulars</th>
                    <th className="text-right px-3 py-2">Receipt</th>
                    <th className="text-right px-3 py-2">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-1.5">{e.voucher.date}</td>
                      <td className="px-3 py-1.5 text-fg-soft">{VOUCHER_LABEL[e.voucher.type]} #{e.voucher.number}</td>
                      <td className="px-3 py-1.5">{e.particulars}</td>
                      <Money value={e.movement > 0 ? e.movement : 0} />
                      <Money value={e.movement < 0 ? -e.movement : 0} />
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card className="p-4 space-y-2 text-sm">
            <Row label="Opening Cash & Bank" value={data.opening} />
            <Row label="Total Receipts" value={data.totalReceipts} tone="positive" />
            <Row label="Total Payments" value={-data.totalPayments} tone="negative" />
            <div className="border-t border-border my-2" />
            <Row label="Closing Cash & Bank" value={data.closing} bold />
          </Card>
        </div>
      )}
    </ReportShell>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: number; bold?: boolean; tone?: 'positive' | 'negative' }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''}`}>
      <span className="text-fg-soft">{label}</span>
      <span className={`tabular ${tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : ''}`}>
        {formatPaise(value, { sign: true })}
      </span>
    </div>
  );
}
