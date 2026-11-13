import { useState } from 'react';
import { cashAndBankLedgerIds, dayBook, type DayBookEntry } from '../../engine/balances';
import { formatPaise } from '../../lib/money';
import { Card } from '../../ui/primitives';
import { useHotkey } from '../../keyboard/HotkeyProvider';
import {
  EmptyReport, LedgerPicker, ReportShell, VOUCHER_LABEL, useCompanyId, useQuery,
} from './shared';
import type { Ledger, VoucherType } from '../../types/model';

/** Generic voucher-register table shared by Petty Cash / Cash / Bank / Journal books. */
function RegisterTable({ entries }: { entries: DayBookEntry[] }) {
  if (entries.length === 0) return <EmptyReport hint="No vouchers posted in this range." />;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs text-fg-soft">
          <tr>
            <th className="text-left px-3 py-2">Date</th>
            <th className="text-left px-3 py-2">Voucher</th>
            <th className="text-left px-3 py-2">Lines</th>
            <th className="text-left px-3 py-2">Narration</th>
            <th className="text-right px-3 py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.voucher.id} className="border-t border-border align-top">
              <td className="px-3 py-1.5">{e.voucher.date}</td>
              <td className="px-3 py-1.5 text-fg-soft">{VOUCHER_LABEL[e.voucher.type]} #{e.voucher.number}</td>
              <td className="px-3 py-1.5">
                {e.voucher.lines.map((l, i) => (
                  <div key={i}>{l.drCr} {formatPaise(l.amount)}{l.narration ? ` — ${l.narration}` : ''}</div>
                ))}
              </td>
              <td className="px-3 py-1.5 text-fg-soft">{e.voucher.narration ?? '—'}</td>
              <td className="tabular text-right px-3 py-1.5">{formatPaise(e.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-semibold bg-surface-2">
            <td className="px-3 py-2" colSpan={4}>Total</td>
            <td className="tabular text-right px-3 py-2">{formatPaise(entries.reduce((s, e) => s + e.totalAmount, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

/** A book filtered to a fixed set of voucher types (Petty Cash Book, Journal Book). */
function TypeFilteredBook({ title, subtitle, scope, types }: { title: string; subtitle: string; scope: string; types: VoucherType[] }) {
  const companyId = useCompanyId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const entries = useQuery(
    () => (companyId ? dayBook(companyId, from || undefined, to || undefined) : Promise.resolve([])),
    [companyId, from, to],
  );
  const filtered = (entries ?? []).filter((e) => types.includes(e.voucher.type));

  return (
    <ReportShell title={title} subtitle={subtitle} scope={scope} backTo="/books" range={{ from, to, onFrom: setFrom, onTo: setTo }}>
      {entries && <RegisterTable entries={filtered} />}
    </ReportShell>
  );
}

/** Books → 1. Petty Cash Book. */
export function PettyCashBookScreen() {
  return (
    <TypeFilteredBook
      title="Petty Cash Book"
      subtitle="All Petty Cash vouchers, datewise."
      scope="petty-cash-book"
      types={['petty_cash']}
    />
  );
}

/** Books → 5. Journal Book. */
export function JournalBookScreen() {
  return (
    <TypeFilteredBook
      title="Journal Book"
      subtitle="All Journal Vouchers, datewise."
      scope="journal-book"
      types={['journal']}
    />
  );
}

/** Books → 2. Cash Book — every voucher touching a Cash ledger. */
export function CashBookScreen() {
  const companyId = useCompanyId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const cashIds = useQuery(
    () => (companyId ? cashAndBankLedgerIds(companyId).then((r) => new Set(r.cash)) : Promise.resolve(new Set<string>())),
    [companyId],
  );
  const entries = useQuery(
    () => (companyId ? dayBook(companyId, from || undefined, to || undefined) : Promise.resolve([])),
    [companyId, from, to],
  );
  const filtered = (entries ?? []).filter((e) => e.voucher.lines.some((l) => cashIds?.has(l.ledgerId)));

  return (
    <ReportShell title="Cash Book" subtitle="Every voucher posting to a Cash ledger." scope="cash-book" backTo="/books" range={{ from, to, onFrom: setFrom, onTo: setTo }}>
      {entries && cashIds && <RegisterTable entries={filtered} />}
    </ReportShell>
  );
}

/** Books → 3. Bank Book — pick a bank, then every voucher touching it. */
export function BankBookScreen() {
  const companyId = useCompanyId();
  const [bank, setBank] = useState<Ledger | null>(null);
  const [showPicker, setShowPicker] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useHotkey('f1', 'Pick bank', () => setShowPicker(true), { scope: 'bank-book', whenTyping: true });

  const entries = useQuery(
    () => (companyId && bank ? dayBook(companyId, from || undefined, to || undefined) : Promise.resolve([])),
    [companyId, bank?.id, from, to],
  );
  const filtered = (entries ?? []).filter((e) => e.voucher.lines.some((l) => l.ledgerId === bank?.id));

  if (companyId && showPicker) {
    return (
      <LedgerPicker
        companyId={companyId}
        title="Search bank account…"
        fixedFilter={(l) => l.isBank}
        onPick={(l) => { setBank(l); setShowPicker(false); }}
        onCancel={() => setShowPicker(false)}
      />
    );
  }

  return (
    <ReportShell
      title={bank ? `Bank Book — ${bank.name}` : 'Bank Book'}
      subtitle={bank ? 'Every voucher posting to this bank account.' : 'Press F1 to select the bank.'}
      scope="bank-book"
      backTo="/books"
      range={bank ? { from, to, onFrom: setFrom, onTo: setTo } : undefined}
      extraActions={
        <button className="h-9 px-3 rounded-lg border border-border text-sm hover:bg-surface-2" onClick={() => setShowPicker(true)}>
          Change bank <span className="keycap ml-1">F1</span>
        </button>
      }
    >
      {!bank ? <EmptyReport hint="No bank selected — press F1 or click &quot;Change bank&quot;." /> : <RegisterTable entries={filtered} />}
    </ReportShell>
  );
}
