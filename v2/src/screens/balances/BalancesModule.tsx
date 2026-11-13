// ─────────────────────────────────────────────────────────────────────────────
// Balances module — legacy menu 6: Open/Close Balances.
//
// View opening balances, compute closing balances as on any date, and refresh
// opening balances for a new year. Mirrors the legacy "Open/Clos Bal." screen.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { db } from '../../db/db';
import { useSession } from '../../store/session';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader } from '../../ui/primitives';
import { formatPaise, balanceLabel } from '../../lib/money';
import type { Group, Ledger, Paise, ID } from '../../types/model';
import { ledgerBalancesAsOn } from '../../engine/balances';

// ── Opening Balances ─────────────────────────────────────────────────────────

function OpeningBalances() {
  const navigate = useNavigate();
  const activeCompany = useSession((s) => s.activeCompany);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    if (!activeCompany) return;
    Promise.all([
      db.ledgers.where({ companyId: activeCompany.id }).toArray(),
      db.groups.where({ companyId: activeCompany.id }).toArray(),
    ]).then(([ls, gs]) => {
      setLedgers(ls.sort((a, b) => a.name.localeCompare(b.name)));
      setGroups(gs);
    });
  }, [activeCompany]);

  if (!activeCompany) return <EmptyState title="No company selected" />;

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const totalDr = ledgers.filter((l) => l.openingDrCr === 'D').reduce((s, l) => s + l.openingBalance, 0);
  const totalCr = ledgers.filter((l) => l.openingDrCr === 'C').reduce((s, l) => s + l.openingBalance, 0);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Opening Balances"
        subtitle={`Total Dr: ${formatPaise(totalDr, { symbol: true })} · Total Cr: ${formatPaise(totalCr, { symbol: true })} · ${totalDr === totalCr ? '✓ Balanced' : '✗ Unbalanced'}`}
        actions={<Button variant="ghost" onClick={() => navigate('/balances')}>Back</Button>}
      />

      {ledgers.length === 0 ? (
        <EmptyState title="No ledgers" hint="Create ledger accounts in Masters first." />
      ) : (
        <Card className="p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Group</th>
                <th className="py-2 pr-3 text-right tabular">Debit</th>
                <th className="py-2 text-right tabular">Credit</th>
              </tr>
            </thead>
            <tbody>
              {ledgers.map((l) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-medium">{l.name}</td>
                  <td className="py-2 pr-3 text-muted">{groupById.get(l.groupId)?.name ?? '—'}</td>
                  <td className="py-2 pr-3 text-right tabular">
                    {l.openingDrCr === 'D' && l.openingBalance > 0 ? formatPaise(l.openingBalance) : ''}
                  </td>
                  <td className="py-2 text-right tabular">
                    {l.openingDrCr === 'C' && l.openingBalance > 0 ? formatPaise(l.openingBalance) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-2 pr-3" colSpan={2}>Total</td>
                <td className="py-2 pr-3 text-right tabular">{formatPaise(totalDr, { symbol: true })}</td>
                <td className="py-2 text-right tabular">{formatPaise(totalCr, { symbol: true })}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}

// ── Closing Balances As On ───────────────────────────────────────────────────

function ClosingBalances() {
  const navigate = useNavigate();
  const activeCompany = useSession((s) => s.activeCompany);
  const [asOn, setAsOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [balances, setBalances] = useState<Map<ID, Paise>>(new Map());
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [computed, setComputed] = useState(false);

  useEffect(() => {
    if (!activeCompany) return;
    Promise.all([
      db.ledgers.where({ companyId: activeCompany.id }).toArray(),
      db.groups.where({ companyId: activeCompany.id }).toArray(),
    ]).then(([ls, gs]) => {
      setLedgers(ls.sort((a, b) => a.name.localeCompare(b.name)));
      setGroups(gs);
    });
  }, [activeCompany]);

  const compute = async () => {
    if (!activeCompany) return;
    const bals = await ledgerBalancesAsOn(activeCompany.id, asOn);
    setBalances(bals);
    setComputed(true);
  };

  if (!activeCompany) return <EmptyState title="No company selected" />;

  const groupById = new Map(groups.map((g) => [g.id, g]));

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Closing Balances"
        subtitle="Compute closing balance of every ledger as on a given date."
        actions={<Button variant="ghost" onClick={() => navigate('/balances')}>Back</Button>}
      />

      <Card className="p-4 mb-6">
        <div className="flex items-end gap-3">
          <Field label="As On Date">
            <Input type="date" value={asOn} onChange={(e) => { setAsOn(e.target.value); setComputed(false); }} />
          </Field>
          <Button variant="primary" onClick={compute}>Compute</Button>
        </div>
      </Card>

      {computed && (
        <Card className="p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">Group</th>
                <th className="py-2 pr-3 text-right tabular">Debit</th>
                <th className="py-2 text-right tabular">Credit</th>
              </tr>
            </thead>
            <tbody>
              {ledgers.map((l) => {
                const bal = balances.get(l.id) ?? 0;
                if (bal === 0) return null;
                const { text, drcr } = balanceLabel(bal);
                return (
                  <tr key={l.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 font-medium">{l.name}</td>
                    <td className="py-2 pr-3 text-muted">{groupById.get(l.groupId)?.name ?? '—'}</td>
                    <td className="py-2 pr-3 text-right tabular">{drcr === 'D' ? text : ''}</td>
                    <td className="py-2 text-right tabular">{drcr === 'C' ? text : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ── Refresh Opening Balances (year-end rollover) ─────────────────────────────

function RefreshOpeningBalances() {
  const navigate = useNavigate();
  const activeCompany = useSession((s) => s.activeCompany);
  const [asOn, setAsOn] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (activeCompany) setAsOn(activeCompany.periodEnd);
  }, [activeCompany]);

  const doRefresh = async () => {
    if (!activeCompany) return;
    const balances = await ledgerBalancesAsOn(activeCompany.id, asOn);
    const ledgers = await db.ledgers.where({ companyId: activeCompany.id }).toArray();

    await db.transaction('rw', db.ledgers, async () => {
      for (const l of ledgers) {
        const closingBal = balances.get(l.id) ?? 0;
        const openingDrCr = closingBal >= 0 ? 'D' as const : 'C' as const;
        const openingBalance = Math.abs(closingBal);
        await db.ledgers.update(l.id, { openingBalance, openingDrCr, currentBalance: closingBal });
      }
    });

    setMessage(`Refreshed opening balances for ${ledgers.length} ledger(s) from closing as on ${asOn}.`);
    setDone(true);
  };

  if (!activeCompany) return <EmptyState title="No company selected" />;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Refresh Opening Balances"
        subtitle="Pull closing balances as opening for a new year. Use after year-end rollover."
        actions={<Button variant="ghost" onClick={() => navigate('/balances')}>Back</Button>}
      />

      <Card className="p-4">
        <Field label="Compute closing as on" hint="Typically the accounting period end date.">
          <Input type="date" value={asOn} onChange={(e) => { setAsOn(e.target.value); setDone(false); }} />
        </Field>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="danger" onClick={doRefresh} disabled={!asOn || done}>Refresh Opening Balances</Button>
          {done && <Badge tone="positive">Done</Badge>}
        </div>
        {message && <p className="text-sm text-brand mt-3">{message}</p>}
      </Card>
    </div>
  );
}

// ── Balances Index ───────────────────────────────────────────────────────────

function BalancesIndex() {
  const navigate = useNavigate();
  useScope('balances-menu');

  const items = [
    { to: '/balances/opening', label: 'Opening Balances', hint: 'View all opening balances', hotkey: '1' },
    { to: '/balances/closing', label: 'Closing Balances', hint: 'Compute closing as on a date', hotkey: '2' },
    { to: '/balances/refresh', label: 'Refresh Opening', hint: 'Year-end rollover', hotkey: '3' },
  ];

  for (const item of items) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkey(item.hotkey, item.label, () => navigate(item.to), { scope: 'balances-menu' });
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Open / Close Balances" subtitle="View opening balances, compute closing, and handle year-end rollover." />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((item) => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className="text-left p-4 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-brand/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{item.label}</span>
              <span className="keycap">{item.hotkey}</span>
            </div>
            <div className="text-xs text-muted mt-1">{item.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Module root ──────────────────────────────────────────────────────────────

export function BalancesModule() {
  return (
    <Routes>
      <Route index element={<BalancesIndex />} />
      <Route path="opening" element={<OpeningBalances />} />
      <Route path="closing" element={<ClosingBalances />} />
      <Route path="refresh" element={<RefreshOpeningBalances />} />
      <Route path="*" element={<Navigate to="/balances" replace />} />
    </Routes>
  );
}
