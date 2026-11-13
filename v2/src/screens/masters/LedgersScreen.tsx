// Masters → Create Account / Edit Account. Legacy "Ledger Account Creator" +
// "Alter/Delete Ledger Accounts" screens, merged into one list+form view:
// list grouped by Group with running balance, create/edit with opening
// balance + D/C, isBank, isMember.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader } from '../../ui/primitives';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { useSession } from '../../store/session';
import { db, uid } from '../../db/db';
import { balanceLabel, formatPaise, parsePaise, signed } from '../../lib/money';
import type { DrCr, Group, Ledger } from '../../types/model';
import { Select, handleEnterAdvance, suggestLedgerCode } from './shared';

interface FormState {
  code: string;
  name: string;
  groupId: string;
  openingBalance: string; // rupees text while editing
  openingDrCr: DrCr;
  isBank: boolean;
  isMember: boolean;
}

export function LedgersScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const company = useSession((s) => s.activeCompany);
  const [groups, setGroups] = useState<Group[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<Ledger | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [reload, setReload] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);

  useScope('masters-ledgers');
  useHotkey('esc', 'Back', () => (view === 'form' ? setView('list') : navigate('/masters')), { scope: 'masters-ledgers' });

  useEffect(() => {
    if (!company) return;
    Promise.all([
      db.groups.where('companyId').equals(company.id).toArray(),
      db.ledgers.where('companyId').equals(company.id).toArray(),
    ]).then(([g, l]) => {
      setGroups(g.sort((a, b) => a.code.localeCompare(b.code)));
      setLedgers(l.sort((a, b) => a.code.localeCompare(b.code)));
    });
  }, [company, reload]);

  // Hotkey "1" (Create Account) deep-links here with state.startNew.
  useEffect(() => {
    if ((location.state as { startNew?: boolean } | null)?.startNew && groups.length > 0) {
      openNew();
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, groups.length]);

  if (!company) {
    return (
      <EmptyState
        title="No company selected"
        hint="Create or switch to a company from the Masters home before creating ledger accounts."
        action={<Button variant="primary" onClick={() => navigate('/masters')}>Go to Masters</Button>}
      />
    );
  }

  function openNew() {
    if (groups.length === 0) return;
    const firstGroup = groups[0];
    setEditing(null);
    setForm({
      code: suggestLedgerCode(firstGroup.code, ledgers.filter((l) => l.groupId === firstGroup.id)),
      name: '',
      groupId: firstGroup.id,
      openingBalance: '0',
      openingDrCr: 'D',
      isBank: false,
      isMember: false,
    });
    setView('form');
  }

  function openEdit(l: Ledger) {
    setEditing(l);
    setForm({
      code: l.code,
      name: l.name,
      groupId: l.groupId,
      openingBalance: formatPaise(l.openingBalance),
      openingDrCr: l.openingDrCr,
      isBank: l.isBank,
      isMember: l.isMember,
    });
    setView('form');
  }

  function onGroupChange(groupId: string) {
    setForm((f) => {
      if (!f) return f;
      if (editing) return { ...f, groupId };
      const group = groups.find((g) => g.id === groupId)!;
      return { ...f, groupId, code: suggestLedgerCode(group.code, ledgers.filter((l) => l.groupId === groupId)) };
    });
  }

  async function save() {
    if (!form || !company) return;
    if (!form.name.trim() || !form.code.trim()) return;
    const openingBalance = parsePaise(form.openingBalance);
    const oldSignedOpening = editing ? signed(editing.openingBalance, editing.openingDrCr) : 0;
    const newSignedOpening = signed(openingBalance, form.openingDrCr);
    const currentBalance = (editing?.currentBalance ?? 0) - oldSignedOpening + newSignedOpening;
    const row: Ledger = {
      id: editing?.id ?? uid(),
      companyId: company.id,
      code: form.code.trim(),
      name: form.name.trim(),
      groupId: form.groupId,
      openingBalance,
      openingDrCr: form.openingDrCr,
      isBank: form.isBank,
      isMember: form.isMember,
      currentBalance,
      dueDays: editing?.dueDays,
      interestAccountId: editing?.interestAccountId,
      openingInterest: editing?.openingInterest,
    };
    await db.ledgers.put(row);
    setReload((n) => n + 1);
    setView('list');
  }

  const ledgersByGroup = groups.map((g) => ({ group: g, rows: ledgers.filter((l) => l.groupId === g.id) }));

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Ledgers"
        subtitle="Chart of accounts — grouped by Group, with running balance."
        actions={
          view === 'list' ? (
            <Button variant="primary" onClick={openNew} disabled={groups.length === 0}>+ Create Account</Button>
          ) : (
            <Button variant="ghost" onClick={() => setView('list')}>Esc Cancel</Button>
          )
        }
      />

      {groups.length === 0 && view === 'list' && (
        <EmptyState title="Create a Group first" hint="Ledgers belong to a Group — set up your chart-of-account groups before creating accounts." action={<Button variant="primary" onClick={() => navigate('/masters/groups')}>Go to Groups</Button>} />
      )}

      {view === 'list' && groups.length > 0 && (
        ledgers.length === 0 ? (
          <EmptyState title="No ledger accounts yet" hint="Create your first account — cash, bank, an expense head, or a member's dues account." action={<Button variant="primary" onClick={openNew}>+ Create Account</Button>} />
        ) : (
          <div className="space-y-5">
            {ledgersByGroup.filter((gr) => gr.rows.length > 0).map(({ group, rows }) => (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="font-mono text-xs text-muted">{group.code}</span>
                  <h3 className="text-sm font-semibold text-fg-soft">{group.name}</h3>
                </div>
                <Card className="divide-y divide-border">
                  {rows.map((l) => {
                    const bal = balanceLabel(l.currentBalance);
                    return (
                      <button
                        key={l.id}
                        onClick={() => openEdit(l)}
                        className="w-full flex items-center justify-between gap-3 px-4 h-12 text-left hover:bg-surface-2 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-muted w-16">{l.code}</span>
                          <span className="text-sm font-medium">{l.name}</span>
                          {l.isBank && <Badge tone="positive">Bank</Badge>}
                          {l.isMember && <Badge tone="warning">Member</Badge>}
                        </div>
                        <span className="tabular text-sm">
                          {bal.text} {bal.drcr}
                        </span>
                      </button>
                    );
                  })}
                </Card>
              </div>
            ))}
          </div>
        )
      )}

      {view === 'form' && form && (
        <Card className="p-5 max-w-lg">
          <div ref={formRef} className="grid grid-cols-2 gap-4">
            <Field label="Group">
              <Select
                value={form.groupId}
                onChange={(e) => onGroupChange(e.target.value)}
                onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.code} — {g.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Ledger Code">
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => f && { ...f, code: e.target.value })}
                onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
              />
            </Field>
            <Field label="Ledger Account (name)">
              <Input
                value={form.name}
                autoFocus
                onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })}
                onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Opening Bal.">
                <Input
                  value={form.openingBalance}
                  onChange={(e) => setForm((f) => f && { ...f, openingBalance: e.target.value })}
                  onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
                />
              </Field>
              <Field label="Dr./Cr.">
                <Select
                  value={form.openingDrCr}
                  onChange={(e) => setForm((f) => f && { ...f, openingDrCr: e.target.value as DrCr })}
                  onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
                >
                  <option value="D">Debit</option>
                  <option value="C">Credit</option>
                </Select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-brand"
                checked={form.isBank}
                onChange={(e) => setForm((f) => f && { ...f, isBank: e.target.checked })}
              />
              Bank account (feeds Bank Book / BRS)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-brand"
                checked={form.isMember}
                onChange={(e) => setForm((f) => f && { ...f, isMember: e.target.checked })}
              />
              Member's dues account
            </label>
          </div>
          <div className="flex items-center gap-2 mt-5">
            <Button variant="primary" hotkey="⏎" onClick={save}>Save</Button>
            <Button variant="ghost" hotkey="Esc" onClick={() => setView('list')}>Cancel</Button>
            {editing && <span className="text-xs text-muted ml-auto">Editing {editing.code} — {editing.name}</span>}
          </div>
        </Card>
      )}
    </div>
  );
}
