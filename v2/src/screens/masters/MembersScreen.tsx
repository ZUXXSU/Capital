// Masters → Member Details. Legacy "Members Detail" screen: Wing/Flat/Area/
// Category + flags (N = no-interest, X = omit-from-billing) and the MM1..MM16
// rate columns. Every member links to a member's-dues Ledger — pick an
// existing one or create it inline.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader } from '../../ui/primitives';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { useSession } from '../../store/session';
import { db, uid } from '../../db/db';
import { balanceLabel, formatPaise, parsePaise } from '../../lib/money';
import type { Group, Ledger, Member, MemberCategory } from '../../types/model';
import { CATEGORY_OPTIONS, Select, handleEnterAdvance } from './shared';

interface FormState {
  ledgerId: string;
  newLedgerName: string; // used only when ledgerId === NEW_LEDGER
  wing: string;
  flatNo: string;
  area: string;
  category: MemberCategory;
  noInterest: boolean;
  omitFromBilling: boolean;
  rates: string[]; // 16 rupee strings
}

const NEW_LEDGER = '__new__';
const blankRates = () => new Array(16).fill('0');

export function MembersScreen() {
  const navigate = useNavigate();
  const company = useSession((s) => s.activeCompany);
  const [members, setMembers] = useState<Member[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [memberGroupId, setMemberGroupId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [reload, setReload] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);

  useScope('masters-members');
  useHotkey('esc', 'Back', () => (view === 'form' ? setView('list') : navigate('/masters')), { scope: 'masters-members' });

  useEffect(() => {
    if (!company) return;
    Promise.all([
      db.members.where('companyId').equals(company.id).toArray(),
      db.ledgers.where('companyId').equals(company.id).toArray(),
      db.groups.where('companyId').equals(company.id).toArray(),
    ]).then(([m, l, g]) => {
      setMembers(m.sort((a, b) => (a.wing + a.flatNo).localeCompare(b.wing + b.flatNo)));
      setLedgers(l);
      setGroups(g);
      const duesGroup = g.find((x) => /member/i.test(x.name)) ?? null;
      setMemberGroupId(duesGroup?.id ?? null);
    });
  }, [company, reload]);

  if (!company) {
    return (
      <EmptyState
        title="No company selected"
        hint="Create or switch to a company from the Masters home before entering member details."
        action={<Button variant="primary" onClick={() => navigate('/masters')}>Go to Masters</Button>}
      />
    );
  }

  const ledgerById = (id: string) => ledgers.find((l) => l.id === id);
  const usedLedgerIds = new Set(members.filter((m) => m.id !== editing?.id).map((m) => m.ledgerId));
  const availableLedgers = ledgers.filter((l) => l.isMember && !usedLedgerIds.has(l.id));

  function openNew() {
    setEditing(null);
    setForm({
      ledgerId: availableLedgers[0]?.id ?? NEW_LEDGER,
      newLedgerName: '',
      wing: '',
      flatNo: '',
      area: '',
      category: 'flat',
      noInterest: false,
      omitFromBilling: false,
      rates: blankRates(),
    });
    setView('form');
  }

  function openEdit(m: Member) {
    setEditing(m);
    setForm({
      ledgerId: m.ledgerId,
      newLedgerName: '',
      wing: m.wing,
      flatNo: m.flatNo,
      area: m.area != null ? String(m.area) : '',
      category: m.category,
      noInterest: m.noInterest,
      omitFromBilling: m.omitFromBilling,
      rates: m.rates.map((p) => formatPaise(p)),
    });
    setView('form');
  }

  async function save() {
    if (!form || !company) return;
    if (!form.flatNo.trim()) return;

    let ledgerId = form.ledgerId;
    if (ledgerId === NEW_LEDGER) {
      if (!form.newLedgerName.trim()) return;
      if (!memberGroupId) {
        alert('Create a "Member\'s Dues" group first (Masters → Groups), then try again.');
        return;
      }
      const groupCode = groups.find((g) => g.id === memberGroupId)?.code ?? '26';
      const seq = ledgers.filter((l) => l.groupId === memberGroupId).length + 1;
      const newLedger: Ledger = {
        id: uid(),
        companyId: company.id,
        code: groupCode + String(seq).padStart(4, '0'),
        name: form.newLedgerName.trim(),
        groupId: memberGroupId,
        openingBalance: 0,
        openingDrCr: 'D',
        isBank: false,
        isMember: true,
        currentBalance: 0,
      };
      await db.ledgers.add(newLedger);
      ledgerId = newLedger.id;
      setLedgers((prev) => [...prev, newLedger]);
    }

    const row: Member = {
      id: editing?.id ?? uid(),
      companyId: company.id,
      ledgerId,
      wing: form.wing.trim(),
      flatNo: form.flatNo.trim(),
      building: editing?.building,
      area: form.area.trim() ? Number(form.area) : undefined,
      category: form.category,
      noInterest: form.noInterest,
      omitFromBilling: form.omitFromBilling,
      rates: form.rates.map((r) => parsePaise(r)),
    };
    await db.members.put(row);
    setReload((n) => n + 1);
    setView('list');
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Members"
        subtitle="Member Details — wing/flat/area, category flags and the MM1–MM16 billing rates."
        actions={
          view === 'list' ? (
            <Button variant="primary" onClick={openNew}>+ New Member</Button>
          ) : (
            <Button variant="ghost" onClick={() => setView('list')}>Esc Cancel</Button>
          )
        }
      />

      {view === 'list' ? (
        members.length === 0 ? (
          <EmptyState title="No members yet" hint="Add your first member — wing, flat number, area, and the maintenance rates that feed their bill." action={<Button variant="primary" onClick={openNew}>+ New Member</Button>} />
        ) : (
          <Card className="divide-y divide-border">
            {members.map((m) => {
              const l = ledgerById(m.ledgerId);
              const bal = l ? balanceLabel(l.currentBalance) : null;
              const cat = CATEGORY_OPTIONS.find((c) => c.value === m.category);
              return (
                <button
                  key={m.id}
                  onClick={() => openEdit(m)}
                  className="w-full flex items-center justify-between gap-3 px-4 h-12 text-left hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted w-16">{m.wing}-{m.flatNo}</span>
                    <span className="text-sm font-medium">{l?.name ?? '— no ledger —'}</span>
                    <Badge>{cat?.code ?? m.category}</Badge>
                    {m.noInterest && <Badge tone="warning">N</Badge>}
                    {m.omitFromBilling && <Badge tone="negative">X</Badge>}
                  </div>
                  {bal && <span className="tabular text-sm">{bal.text} {bal.drcr}</span>}
                </button>
              );
            })}
          </Card>
        )
      ) : form && (
        <Card className="p-5">
          <div ref={formRef}>
          <div className="grid grid-cols-4 gap-4">
            <Field label="Member Ledger" hint="The ledger account this member's dues post to">
              <Select
                value={form.ledgerId}
                onChange={(e) => setForm((f) => f && { ...f, ledgerId: e.target.value })}
                onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
              >
                {editing && <option value={editing.ledgerId}>{ledgerById(editing.ledgerId)?.name}</option>}
                {availableLedgers.map((l) => (
                  <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
                ))}
                <option value={NEW_LEDGER}>+ Create new ledger…</option>
              </Select>
            </Field>
            {form.ledgerId === NEW_LEDGER && (
              <Field label="New Member's Name">
                <Input
                  value={form.newLedgerName}
                  onChange={(e) => setForm((f) => f && { ...f, newLedgerName: e.target.value })}
                  onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
                />
              </Field>
            )}
            <Field label="Wing">
              <Input
                value={form.wing}
                autoFocus
                onChange={(e) => setForm((f) => f && { ...f, wing: e.target.value })}
                onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
              />
            </Field>
            <Field label="Flat No.">
              <Input
                value={form.flatNo}
                onChange={(e) => setForm((f) => f && { ...f, flatNo: e.target.value })}
                onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
              />
            </Field>
            <Field label="Area (sq.ft)">
              <Input
                value={form.area}
                onChange={(e) => setForm((f) => f && { ...f, area: e.target.value })}
                onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
              />
            </Field>
            <Field label="Category">
              <Select
                value={form.category}
                onChange={(e) => setForm((f) => f && { ...f, category: e.target.value as MemberCategory })}
                onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.code} — {c.label}</option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-brand"
                checked={form.noInterest}
                onChange={(e) => setForm((f) => f && { ...f, noInterest: e.target.checked })}
              />
              N — No interest on arrears
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-brand"
                checked={form.omitFromBilling}
                onChange={(e) => setForm((f) => f && { ...f, omitFromBilling: e.target.checked })}
              />
              X — Omit from billing
            </label>
          </div>

          <div className="mt-5">
            <h3 className="text-xs font-semibold text-fg-soft mb-2">Billing Rates — MM1…MM16</h3>
            <div className="grid grid-cols-4 gap-3">
              {form.rates.map((r, i) => (
                <Field key={i} label={`MM${i + 1}`}>
                  <Input
                    value={r}
                    onChange={(e) =>
                      setForm((f) => {
                        if (!f) return f;
                        const rates = [...f.rates];
                        rates[i] = e.target.value;
                        return { ...f, rates };
                      })
                    }
                    onKeyDown={(e) => handleEnterAdvance(e, formRef.current, save)}
                  />
                </Field>
              ))}
            </div>
          </div>
          </div>

          <div className="flex items-center gap-2 mt-5">
            <Button variant="primary" hotkey="⏎" onClick={save}>Save</Button>
            <Button variant="ghost" hotkey="Esc" onClick={() => setView('list')}>Cancel</Button>
            {editing && <span className="text-xs text-muted ml-auto">Editing {editing.wing}-{editing.flatNo}</span>}
          </div>
        </Card>
      )}
    </div>
  );
}
