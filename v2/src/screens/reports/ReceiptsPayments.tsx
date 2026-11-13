import { useState } from 'react';
import { receiptsAndPayments, type GroupBlock } from '../../engine/balances';
import { formatPaise } from '../../lib/money';
import { Card } from '../../ui/primitives';
import { EmptyReport, ReportShell, useCompanyId, useQuery } from './shared';

function Column({ heading, openingLabel, opening, blocks, closingLabel, closing }: {
  heading: string; openingLabel?: string; opening?: number; blocks: GroupBlock[];
  closingLabel?: string; closing?: number;
}) {
  const blocksTotal = blocks.reduce((s, b) => s + b.total, 0);
  const grandTotal = blocksTotal + (opening ?? 0) + (closing ?? 0);
  return (
    <Card className="overflow-hidden">
      <div className="px-3 py-2 bg-surface-2 text-sm font-semibold">{heading}</div>
      <table className="w-full text-sm">
        <tbody>
          {openingLabel !== undefined && (
            <tr className="border-t border-border italic">
              <td className="px-3 py-1.5">{openingLabel}</td>
              <td className="tabular text-right px-3 py-1.5">{formatPaise(opening ?? 0)}</td>
            </tr>
          )}
          {blocks.map((b) => (
            <tr key={b.groupId} className="border-t border-border">
              <td className="px-3 py-1.5">{b.groupName}</td>
              <td className="tabular text-right px-3 py-1.5">{formatPaise(b.total)}</td>
            </tr>
          ))}
          {closingLabel !== undefined && (
            <tr className="border-t border-border italic">
              <td className="px-3 py-1.5">{closingLabel}</td>
              <td className="tabular text-right px-3 py-1.5">{formatPaise(closing ?? 0)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-semibold bg-surface-2">
            <td className="px-3 py-2">Total</td>
            <td className="tabular text-right px-3 py-2">{formatPaise(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

/** Reports → A. Recpts & Paymts — classic cash-basis Receipts & Payments Account. */
export function ReceiptsPaymentsScreen() {
  const companyId = useCompanyId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const data = useQuery(
    () => (companyId ? receiptsAndPayments(companyId, from || undefined, to || undefined) : Promise.resolve(undefined)),
    [companyId, from, to],
  );

  const empty = data && data.receipts.length === 0 && data.payments.length === 0 && data.opening === 0 && data.closing === 0;

  return (
    <ReportShell
      title="Receipts & Payments Account"
      subtitle="Cash-basis statement of all Cash & Bank receipts and payments for the period."
      scope="receipts-payments"
      backTo="/reports"
      range={{ from, to, onFrom: setFrom, onTo: setTo }}
    >
      {!data ? null : empty ? (
        <EmptyReport />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Column
            heading="Receipts"
            openingLabel="To Opening Balance (Cash & Bank)"
            opening={data.opening}
            blocks={data.receipts}
          />
          <Column
            heading="Payments"
            blocks={data.payments}
            closingLabel="By Closing Balance (Cash & Bank)"
            closing={data.closing}
          />
        </div>
      )}
    </ReportShell>
  );
}
