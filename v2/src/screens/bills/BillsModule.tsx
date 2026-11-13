// ─────────────────────────────────────────────────────────────────────────────
// Bills module — society maintenance billing (legacy menu 3: Bills/Vouchers).
//
// Generate → Print/Preview → Update cycle, plus bill heads setup, outstanding
// list, and receipt matching. All wired to the billing engine in
// src/engine/billing.ts and the shared data model.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { db, uid } from '../../db/db';
import { useSession } from '../../store/session';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader } from '../../ui/primitives';
import { formatPaise } from '../../lib/money';
import type { Bill, BillHead, Member, Ledger } from '../../types/model';
import { previewBills, generateBills, updateBills, type BillPreview } from '../../engine/billing';

// ── Bill Heads Setup ─────────────────────────────────────────────────────────

function BillHeadsSetup() {
  const navigate = useNavigate();
  const activeCompany = useSession((s) => s.activeCompany);
  const [heads, setHeads] = useState<BillHead[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newRegHeading, setNewRegHeading] = useState('');
  const [newLedgerId, setNewLedgerId] = useState('');

  const reload = useCallback(() => {
    if (!activeCompany) return;
    db.billHeads.where({ companyId: activeCompany.id }).toArray().then((h) => {
      setHeads(h.sort((a, b) => a.index - b.index));
    });
    db.ledgers.where({ companyId: activeCompany.id }).toArray().then((l) => {
      setLedgers(l.sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, [activeCompany]);

  useEffect(() => reload(), [reload]);

  const addHead = async () => {
    if (!activeCompany || !newLabel.trim() || !newLedgerId) return;
    const head: BillHead = {
      id: uid('bh_'),
      companyId: activeCompany.id,
      index: heads.length,
      label: newLabel.trim(),
      registerHeading: newRegHeading.trim() || newLabel.trim(),
      postToLedgerId: newLedgerId,
      interestFree: false,
    };
    await db.billHeads.add(head);
    setNewLabel('');
    setNewRegHeading('');
    setNewLedgerId('');
    reload();
  };

  const deleteHead = async (id: string) => {
    await db.billHeads.delete(id);
    reload();
  };

  if (!activeCompany) {
    return <EmptyState title="No company selected" hint="Select or create a company first." />;
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Bill Heads Setup"
        subtitle="Define the charge columns that appear on each maintenance bill (up to 16)."
        actions={<Button variant="ghost" onClick={() => navigate('/bills')}>Back</Button>}
      />

      {heads.length > 0 && (
        <Card className="p-4 mb-6">
          <div className="divide-y divide-border">
            {heads.map((h, i) => (
              <div key={h.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <span className="text-muted mr-2">#{i + 1}</span>
                  <span className="font-medium">{h.label}</span>
                  <span className="text-muted ml-2">→ {ledgers.find((l) => l.id === h.postToLedgerId)?.name ?? '?'}</span>
                </div>
                <Button size="sm" variant="danger" onClick={() => deleteHead(h.id)}>Remove</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {heads.length < 16 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Add Bill Head</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Bill Particulars">
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Maintenance" />
            </Field>
            <Field label="Register Heading">
              <Input value={newRegHeading} onChange={(e) => setNewRegHeading(e.target.value)} placeholder="Short heading" />
            </Field>
            <Field label="Post to Ledger">
              <select
                className="w-full h-9 px-3 rounded-lg bg-surface border border-border text-sm"
                value={newLedgerId}
                onChange={(e) => setNewLedgerId(e.target.value)}
              >
                <option value="">Select…</option>
                {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <Button variant="primary" onClick={addHead} disabled={!newLabel.trim() || !newLedgerId}>Add Head</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Bill Generation ──────────────────────────────────────────────────────────

function BillGenerate() {
  const navigate = useNavigate();
  const activeCompany = useSession((s) => s.activeCompany);
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${months[now.getMonth()]}-${now.getFullYear()}`;
  });
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [previews, setPreviews] = useState<BillPreview[]>([]);
  const [generated, setGenerated] = useState(false);
  const [message, setMessage] = useState('');

  const doPreview = async () => {
    if (!activeCompany) return;
    const p = await previewBills(activeCompany.id, period, billDate);
    setPreviews(p);
    setGenerated(false);
    setMessage(p.length === 0 ? 'No billable members found. Check member details and bill heads.' : '');
  };

  const doGenerate = async () => {
    if (!activeCompany || previews.length === 0) return;
    const bills = await generateBills(activeCompany.id, period, billDate, previews);
    setGenerated(true);
    setMessage(`Generated ${bills.length} bill(s) for ${period}. Now review and Update to post to ledgers.`);
  };

  const doUpdate = async () => {
    if (!activeCompany) return;
    const bills = await db.bills.where({ companyId: activeCompany.id }).toArray();
    const unposted = bills.filter((b) => b.period === period && !b.posted);
    if (unposted.length === 0) {
      setMessage('No unposted bills for this period.');
      return;
    }
    await updateBills(activeCompany.id, unposted.map((b) => b.id));
    setMessage(`Posted ${unposted.length} bill(s) to member ledgers.`);
  };

  if (!activeCompany) {
    return <EmptyState title="No company selected" />;
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Generate Bills"
        subtitle="Generate → Preview → Update. Update posts bills to each member's ledger."
        actions={<Button variant="ghost" onClick={() => navigate('/bills')}>Back</Button>}
      />

      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Field label="Billing Period">
            <Input value={period} onChange={(e) => setPeriod(e.target.value.toUpperCase())} placeholder="e.g. APR-2026" />
          </Field>
          <Field label="Bill Date">
            <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            <Button variant="primary" onClick={doPreview}>Preview</Button>
            <Button variant="default" onClick={doGenerate} disabled={previews.length === 0 || generated}>Generate</Button>
            <Button variant="primary" onClick={doUpdate} disabled={!generated}>Update</Button>
          </div>
        </div>
        {message && <p className="text-sm text-brand font-medium">{message}</p>}
      </Card>

      {previews.length > 0 && (
        <Card className="p-4 overflow-x-auto">
          <h3 className="text-sm font-semibold mb-3">Bill Preview — {period}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3">Wing</th>
                <th className="py-2 pr-3">Flat</th>
                {previews[0]?.headAmounts.filter((h) => h.amount > 0 || true).slice(0, 6).map((h, i) => (
                  <th key={i} className="py-2 pr-3 tabular text-right">{h.label}</th>
                ))}
                <th className="py-2 pr-3 tabular text-right">Arrears</th>
                <th className="py-2 pr-3 tabular text-right">Interest</th>
                <th className="py-2 tabular text-right font-semibold">Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {previews.map((p) => (
                <tr key={p.member.id} className="border-b border-border/50">
                  <td className="py-2 pr-3">{p.member.wing}</td>
                  <td className="py-2 pr-3">{p.member.flatNo}</td>
                  {p.headAmounts.slice(0, 6).map((h, i) => (
                    <td key={i} className="py-2 pr-3 tabular text-right">{formatPaise(h.amount)}</td>
                  ))}
                  <td className="py-2 pr-3 tabular text-right">{formatPaise(p.arrears)}</td>
                  <td className="py-2 pr-3 tabular text-right">{formatPaise(p.interest)}</td>
                  <td className="py-2 tabular text-right font-semibold">{formatPaise(p.grandTotal, { symbol: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ── Outstanding List ─────────────────────────────────────────────────────────

function OutstandingList() {
  const navigate = useNavigate();
  const activeCompany = useSession((s) => s.activeCompany);
  const [members, setMembers] = useState<Member[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);

  useEffect(() => {
    if (!activeCompany) return;
    Promise.all([
      db.members.where({ companyId: activeCompany.id }).toArray(),
      db.ledgers.where({ companyId: activeCompany.id }).toArray(),
    ]).then(([ms, ls]) => {
      setMembers(ms);
      setLedgers(ls);
    });
  }, [activeCompany]);

  if (!activeCompany) return <EmptyState title="No company selected" />;

  const ledgerById = new Map(ledgers.map((l) => [l.id, l]));
  const outstanding = members
    .map((m) => {
      const ledger = ledgerById.get(m.ledgerId);
      return { member: m, balance: ledger?.currentBalance ?? 0, name: ledger?.name ?? '—' };
    })
    .filter((o) => o.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const total = outstanding.reduce((s, o) => s + o.balance, 0);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Outstanding List"
        subtitle={`Members with dues — total outstanding: ${formatPaise(total, { symbol: true })}`}
        actions={<Button variant="ghost" onClick={() => navigate('/bills')}>Back</Button>}
      />

      {outstanding.length === 0 ? (
        <EmptyState title="No outstanding dues" hint="All members are up to date." />
      ) : (
        <Card className="p-4">
          <div className="divide-y divide-border">
            {outstanding.map((o) => (
              <div key={o.member.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{o.name}</span>
                  <span className="text-muted ml-2">{o.member.wing}-{o.member.flatNo}</span>
                </div>
                <span className="tabular font-semibold text-negative">{formatPaise(o.balance, { symbol: true })}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Bill History ─────────────────────────────────────────────────────────────

function BillHistory() {
  const navigate = useNavigate();
  const activeCompany = useSession((s) => s.activeCompany);
  const [bills, setBills] = useState<Bill[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);

  useEffect(() => {
    if (!activeCompany) return;
    Promise.all([
      db.bills.where({ companyId: activeCompany.id }).toArray(),
      db.members.where({ companyId: activeCompany.id }).toArray(),
      db.ledgers.where({ companyId: activeCompany.id }).toArray(),
    ]).then(([bs, ms, ls]) => {
      setBills(bs.sort((a, b) => b.number - a.number));
      setMembers(ms);
      setLedgers(ls);
    });
  }, [activeCompany]);

  if (!activeCompany) return <EmptyState title="No company selected" />;

  const memberById = new Map(members.map((m) => [m.id, m]));
  const ledgerById = new Map(ledgers.map((l) => [l.id, l]));

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Bill History"
        subtitle="All generated bills across periods."
        actions={<Button variant="ghost" onClick={() => navigate('/bills')}>Back</Button>}
      />

      {bills.length === 0 ? (
        <EmptyState title="No bills yet" hint="Generate bills from the Generate screen." />
      ) : (
        <Card className="p-4">
          <div className="divide-y divide-border">
            {bills.map((b) => {
              const member = memberById.get(b.memberId);
              const ledger = member ? ledgerById.get(member.ledgerId) : undefined;
              return (
                <div key={b.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">Bill #{b.number}</span>
                    <span className="text-muted ml-2">{b.period} · {b.date}</span>
                    <span className="text-muted ml-2">
                      {ledger?.name ?? '—'} ({member?.wing}-{member?.flatNo})
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular font-medium">{formatPaise(b.grandTotal, { symbol: true })}</span>
                    <Badge tone={b.posted ? 'positive' : 'warning'}>{b.posted ? 'Posted' : 'Pending'}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Bills Index ──────────────────────────────────────────────────────────────

function BillsIndex() {
  const navigate = useNavigate();
  useScope('bills-menu');

  const items = [
    { to: '/bills/generate', label: 'Generate Bills', hint: 'Generate → Preview → Update cycle', hotkey: '1' },
    { to: '/bills/outstanding', label: 'Outstanding', hint: 'Members with unpaid dues', hotkey: '2' },
    { to: '/bills/history', label: 'Bill History', hint: 'View all generated bills', hotkey: '3' },
    { to: '/bills/heads', label: 'Bill Heads Setup', hint: 'Define charge columns (up to 16)', hotkey: '4' },
  ];

  for (const item of items) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkey(item.hotkey, item.label, () => navigate(item.to), { scope: 'bills-menu' });
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Bills / Vouchers" subtitle="Society maintenance billing — generate, review, and post bills." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

export function BillsModule() {
  return (
    <Routes>
      <Route index element={<BillsIndex />} />
      <Route path="generate" element={<BillGenerate />} />
      <Route path="outstanding" element={<OutstandingList />} />
      <Route path="history" element={<BillHistory />} />
      <Route path="heads" element={<BillHeadsSetup />} />
      <Route path="*" element={<Navigate to="/bills" replace />} />
    </Routes>
  );
}
