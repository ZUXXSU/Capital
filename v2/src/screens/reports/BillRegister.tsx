import { useState } from 'react';
import { db } from '../../db/db';
import { formatPaise } from '../../lib/money';
import { Badge, Card } from '../../ui/primitives';
import { EmptyReport, ReportShell, useCompanyId, useQuery } from './shared';

/** Books → 4. Bill Register — every society maintenance bill raised, with member & amounts. */
export function BillRegisterScreen() {
  const companyId = useCompanyId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const data = useQuery(async () => {
    if (!companyId) return [];
    const [bills, members, ledgers] = await Promise.all([
      db.bills.where('companyId').equals(companyId).toArray(),
      db.members.where('companyId').equals(companyId).toArray(),
      db.ledgers.where('companyId').equals(companyId).toArray(),
    ]);
    const memberLedger = new Map(members.map((m) => [m.id, m.ledgerId]));
    const ledgerName = new Map(ledgers.map((l) => [l.id, l.name]));
    return bills
      .filter((b) => (!from || b.date >= from) && (!to || b.date <= to))
      .sort((a, b) => (a.date === b.date ? a.number - b.number : a.date < b.date ? -1 : 1))
      .map((b) => ({ bill: b, memberName: ledgerName.get(memberLedger.get(b.memberId) ?? '') ?? '—' }));
  }, [companyId, from, to]);

  const total = data?.reduce((s, r) => s + r.bill.grandTotal, 0) ?? 0;

  return (
    <ReportShell
      title="Bill Register"
      subtitle="Every maintenance bill raised, with member, period and amounts."
      scope="bill-register"
      backTo="/books"
      range={{ from, to, onFrom: setFrom, onTo: setTo }}
    >
      {!data ? null : data.length === 0 ? (
        <EmptyReport hint="No bills raised yet. Raise bills under Bills → Generate." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-fg-soft">
              <tr>
                <th className="text-left px-3 py-2">Bill No</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Period</th>
                <th className="text-left px-3 py-2">Member</th>
                <th className="text-right px-3 py-2">Arrears</th>
                <th className="text-right px-3 py-2">Interest</th>
                <th className="text-right px-3 py-2">Rebate</th>
                <th className="text-right px-3 py-2">Grand Total</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map(({ bill, memberName }) => (
                <tr key={bill.id} className="border-t border-border">
                  <td className="px-3 py-1.5">{bill.number}</td>
                  <td className="px-3 py-1.5">{bill.date}</td>
                  <td className="px-3 py-1.5">{bill.period}</td>
                  <td className="px-3 py-1.5">{memberName}</td>
                  <td className="tabular text-right px-3 py-1.5">{formatPaise(bill.arrears)}</td>
                  <td className="tabular text-right px-3 py-1.5">{formatPaise(bill.interest)}</td>
                  <td className="tabular text-right px-3 py-1.5">{formatPaise(bill.rebate)}</td>
                  <td className="tabular text-right px-3 py-1.5 font-medium">{formatPaise(bill.grandTotal)}</td>
                  <td className="px-3 py-1.5"><Badge tone={bill.posted ? 'positive' : 'warning'}>{bill.posted ? 'Posted' : 'Pending'}</Badge></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold bg-surface-2">
                <td className="px-3 py-2" colSpan={7}>Total</td>
                <td className="tabular text-right px-3 py-2">{formatPaise(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </ReportShell>
  );
}
