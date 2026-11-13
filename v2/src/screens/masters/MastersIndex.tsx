// Masters home — legacy "Master Maint." submenu: Create Account / Edit
// Account / Member Details / Group Entry, each with its original number
// hotkey plus a clickable card. Also owns company create/switch (the DB
// starts empty) and the "Load demo data" escape hatch.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Field, Input, PageHeader } from '../../ui/primitives';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { db, uid } from '../../db/db';
import { useSession } from '../../store/session';
import type { Company, EntityType } from '../../types/model';
import { seedDemoCompany } from '../../engine/seed';
import { Select } from './shared';

const SUBMENU = [
  { to: '/masters/ledgers', state: { startNew: true }, hotkey: '1', title: 'Create Account', hint: 'New ledger account — member, bank, income or expense head' },
  { to: '/masters/ledgers', state: undefined, hotkey: '2', title: 'Edit Account', hint: 'Alter or review existing ledger accounts, grouped by Group' },
  { to: '/masters/members', state: undefined, hotkey: '3', title: 'Member Details', hint: 'Wing / Flat / Area / Category and the MM1–MM16 billing rates' },
  { to: '/masters/groups', state: undefined, hotkey: '4', title: 'Group Entry', hint: 'Account groups — nature, schedule flag, B/S column' },
] as const;

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'society', label: 'Co-op Housing Society' },
  { value: 'company', label: 'Company' },
  { value: 'individual', label: 'Individual' },
  { value: 'commission_agent', label: 'Commission Agent' },
  { value: 'clearing_agent', label: 'Clearing Agent' },
  { value: 'communication_centre', label: 'Communication Centre' },
];

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Apr-Mar year
  return { start: `${fyStartYear}-04-01`, end: `${fyStartYear + 1}-03-31` };
}

export function MastersIndex() {
  const navigate = useNavigate();
  const { activeCompany, setActiveCompany } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  const [seeding, setSeeding] = useState(false);
  const period = defaultPeriod();
  const [name, setName] = useState('');
  const [type, setType] = useState<EntityType>('society');
  const [periodStart, setPeriodStart] = useState(period.start);
  const [periodEnd, setPeriodEnd] = useState(period.end);

  useScope('masters-index');
  for (const item of SUBMENU) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkey(item.hotkey, item.title, () => navigate(item.to, { state: item.state }), { scope: 'masters-index' });
  }
  useHotkey('esc', 'Back', () => navigate('/'), { scope: 'masters-index' });

  useEffect(() => {
    db.companies.toArray().then(setCompanies);
  }, [reload]);

  useEffect(() => {
    if (!activeCompany && companies.length === 0) setCreating(true);
  }, [activeCompany, companies.length]);

  async function createCompany() {
    if (!name.trim()) return;
    const company: Company = {
      id: uid(),
      code: String(companies.length + 1).padStart(2, '0'),
      name: name.trim(),
      type,
      periodStart,
      periodEnd,
      settings: {
        interestEnabled: true,
        interestMethod: 'A',
        interestRate: 21,
        rebateEnabled: false,
        costCentreEnabled: false,
        buildingWiseBilling: false,
        currencySymbol: '₹',
      },
      createdAt: Date.now(),
    };
    await db.companies.add(company);
    setActiveCompany(company);
    setReload((n) => n + 1);
    setCreating(false);
    setShowSwitcher(false);
    setName('');
  }

  async function loadDemo() {
    setSeeding(true);
    try {
      const company = await seedDemoCompany();
      setActiveCompany(company);
      setReload((n) => n + 1);
      setCreating(false);
      setShowSwitcher(false);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Masters"
        subtitle="Create/Edit Ledgers, Groups, Member Details — Master Maint."
        actions={
          <>
            {!activeCompany && companies.length === 0 && (
              <Button variant="default" onClick={loadDemo} disabled={seeding}>
                {seeding ? 'Loading…' : 'Load demo data'}
              </Button>
            )}
            {companies.length > 0 && (
              <Button variant="default" onClick={() => setShowSwitcher((s) => !s)}>
                {activeCompany ? 'Switch Company' : 'Select Company'}
              </Button>
            )}
          </>
        }
      />

      {(!activeCompany || showSwitcher || creating) && (
        <Card className="p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3">
            {activeCompany ? 'Switch Company' : 'No company yet — create one to get started'}
          </h2>

          {companies.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveCompany(c);
                    setShowSwitcher(false);
                    setCreating(false);
                  }}
                  className="flex items-center justify-between gap-2 px-3 h-11 rounded-lg border border-border hover:bg-surface-2 text-left transition-colors"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-[11px] text-muted">{c.periodStart} → {c.periodEnd}</span>
                  </span>
                  {activeCompany?.id === c.id && <Badge tone="positive">Active</Badge>}
                </button>
              ))}
            </div>
          )}

          {!creating ? (
            <Button variant="primary" onClick={() => setCreating(true)}>+ New Company</Button>
          ) : (
            <div className="grid grid-cols-2 gap-4 max-w-xl">
              <Field label="Society / Company Name">
                <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createCompany()} />
              </Field>
              <Field label="Entity Type">
                <Select value={type} onChange={(e) => setType(e.target.value as EntityType)}>
                  {ENTITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Accounting Period — Start">
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </Field>
              <Field label="Accounting Period — End">
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </Field>
              <div className="col-span-2 flex items-center gap-2">
                <Button variant="primary" hotkey="⏎" onClick={createCompany}>Create Company</Button>
                {companies.length > 0 && <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>}
                <Button variant="ghost" onClick={loadDemo} disabled={seeding}>
                  {seeding ? 'Loading…' : 'or load demo data instead'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {activeCompany && (
        <>
          <h2 className="text-sm font-semibold text-fg-soft mb-3">Master Maint. submenu</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SUBMENU.map((item) => (
              <button
                key={item.hotkey}
                onClick={() => navigate(item.to, { state: item.state })}
                className="text-left p-4 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-brand/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.title}</span>
                  <span className="keycap">{item.hotkey}</span>
                </div>
                <div className="text-xs text-muted mt-1">{item.hint}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
