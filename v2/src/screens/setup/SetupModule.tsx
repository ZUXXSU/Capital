// ─────────────────────────────────────────────────────────────────────────────
// Setup module — legacy menu 8: bill design, passwords, advanced settings.
//
// Company settings, password management, bill design (alias for Bill Heads),
// and advanced configuration. Mirrors the legacy Setup screen.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { db } from '../../db/db';
import { useSession } from '../../store/session';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { Button, Card, EmptyState, Field, Input, PageHeader } from '../../ui/primitives';
import type { Company, CompanySettings } from '../../types/model';

// ── Company Settings ─────────────────────────────────────────────────────────

function CompanySettingsScreen() {
  const navigate = useNavigate();
  const { activeCompany, setActiveCompany } = useSession();
  const [form, setForm] = useState<Partial<Company & CompanySettings>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!activeCompany) return;
    setForm({
      name: activeCompany.name,
      address: activeCompany.address,
      regdNo: activeCompany.regdNo,
      periodStart: activeCompany.periodStart,
      periodEnd: activeCompany.periodEnd,
      ...activeCompany.settings,
    });
  }, [activeCompany]);

  const save = async () => {
    if (!activeCompany) return;
    const updated: Partial<Company> = {
      name: form.name ?? activeCompany.name,
      address: form.address,
      regdNo: form.regdNo,
      periodStart: form.periodStart ?? activeCompany.periodStart,
      periodEnd: form.periodEnd ?? activeCompany.periodEnd,
      settings: {
        interestEnabled: form.interestEnabled ?? activeCompany.settings.interestEnabled,
        interestMethod: form.interestMethod ?? activeCompany.settings.interestMethod,
        interestRate: form.interestRate ?? activeCompany.settings.interestRate,
        rebateEnabled: form.rebateEnabled ?? activeCompany.settings.rebateEnabled,
        costCentreEnabled: form.costCentreEnabled ?? activeCompany.settings.costCentreEnabled,
        buildingWiseBilling: form.buildingWiseBilling ?? activeCompany.settings.buildingWiseBilling,
        currencySymbol: form.currencySymbol ?? activeCompany.settings.currencySymbol,
      },
    };
    await db.companies.update(activeCompany.id, updated);
    const refreshed = await db.companies.get(activeCompany.id);
    if (refreshed) setActiveCompany(refreshed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!activeCompany) return <EmptyState title="No company selected" />;

  const update = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Company Settings"
        subtitle="Edit company profile, accounting period, and module flags."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate('/setup')}>Back</Button>
            <Button variant="primary" onClick={save}>Save {saved && '✓'}</Button>
          </div>
        }
      />

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Company / Society Name">
            <Input value={form.name ?? ''} onChange={(e) => update('name', e.target.value)} />
          </Field>
          <Field label="Regd. No.">
            <Input value={form.regdNo ?? ''} onChange={(e) => update('regdNo', e.target.value)} />
          </Field>
        </div>
        <Field label="Address">
          <Input value={form.address ?? ''} onChange={(e) => update('address', e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Period Start">
            <Input type="date" value={form.periodStart ?? ''} onChange={(e) => update('periodStart', e.target.value)} />
          </Field>
          <Field label="Period End">
            <Input type="date" value={form.periodEnd ?? ''} onChange={(e) => update('periodEnd', e.target.value)} />
          </Field>
        </div>
      </Card>

      <h3 className="text-sm font-semibold mt-6 mb-3">Module Flags</h3>
      <Card className="p-4 space-y-3">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={form.interestEnabled ?? false} onChange={(e) => update('interestEnabled', e.target.checked)} className="accent-brand" />
          Enable Interest on Arrears
        </label>
        {form.interestEnabled && (
          <div className="ml-7 grid grid-cols-2 gap-3">
            <Field label="Interest Method">
              <select
                className="w-full h-9 px-3 rounded-lg bg-surface border border-border text-sm"
                value={form.interestMethod ?? 'A'}
                onChange={(e) => update('interestMethod', e.target.value)}
              >
                <option value="A">Method A (grace/due date)</option>
                <option value="B">Method B (prior-month balance)</option>
                <option value="none">None</option>
              </select>
            </Field>
            <Field label="Interest Rate (% per month)">
              <Input type="number" value={form.interestRate ?? 0} onChange={(e) => update('interestRate', Number(e.target.value))} />
            </Field>
          </div>
        )}
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={form.rebateEnabled ?? false} onChange={(e) => update('rebateEnabled', e.target.checked)} className="accent-brand" />
          Enable Rebates
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={form.costCentreEnabled ?? false} onChange={(e) => update('costCentreEnabled', e.target.checked)} className="accent-brand" />
          Enable Cost Centres
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={form.buildingWiseBilling ?? false} onChange={(e) => update('buildingWiseBilling', e.target.checked)} className="accent-brand" />
          Building-wise Billing
        </label>
        <div className="max-w-xs">
          <Field label="Currency Symbol">
            <Input value={form.currencySymbol ?? '₹'} onChange={(e) => update('currencySymbol', e.target.value)} />
          </Field>
        </div>
      </Card>
    </div>
  );
}

// ── Password Management ──────────────────────────────────────────────────────

function PasswordScreen() {
  const navigate = useNavigate();
  const [userPass, setUserPass] = useState('');
  const [superPass, setSuperPass] = useState('');
  const [message, setMessage] = useState('');

  const save = () => {
    // In a real app, this would hash and persist. For the v2 prototype, we
    // just acknowledge the setting — passwords are stored in session/localStorage.
    if (userPass.length > 5 || superPass.length > 5) {
      setMessage('Password must be max 5 characters (legacy PACE limit).');
      return;
    }
    localStorage.setItem('capital-user-password', userPass);
    localStorage.setItem('capital-super-password', superPass);
    setMessage('Passwords updated. Leave blank to clear.');
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Change Password"
        subtitle="User Password gates entry; Superuser Password allows view-only access."
        actions={<Button variant="ghost" onClick={() => navigate('/setup')}>Back</Button>}
      />
      <Card className="p-4 space-y-4">
        <Field label="User Password (max 5 chars)" hint="Gates entry to a company/society module.">
          <Input type="password" maxLength={5} value={userPass} onChange={(e) => setUserPass(e.target.value)} placeholder="Leave blank to clear" />
        </Field>
        <Field label="Superuser Password (max 5 chars)" hint="View-only access to all books/reports.">
          <Input type="password" maxLength={5} value={superPass} onChange={(e) => setSuperPass(e.target.value)} placeholder="Leave blank to clear" />
        </Field>
        <Button variant="primary" onClick={save}>Save Passwords</Button>
        {message && <p className="text-sm text-brand mt-2">{message}</p>}
      </Card>
    </div>
  );
}

// ── Advanced Settings ────────────────────────────────────────────────────────

function AdvancedSettings() {
  const navigate = useNavigate();
  const activeCompany = useSession((s) => s.activeCompany);
  const [ledgerCount, setLedgerCount] = useState(0);
  const [voucherCount, setVoucherCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [billCount, setBillCount] = useState(0);

  useEffect(() => {
    if (!activeCompany) return;
    db.ledgers.where({ companyId: activeCompany.id }).count().then(setLedgerCount);
    db.vouchers.where({ companyId: activeCompany.id }).count().then(setVoucherCount);
    db.members.where({ companyId: activeCompany.id }).count().then(setMemberCount);
    db.bills.where({ companyId: activeCompany.id }).count().then(setBillCount);
  }, [activeCompany]);

  const clearMemoVouchers = async () => {
    if (!activeCompany) return;
    const vouchers = await db.vouchers.where({ companyId: activeCompany.id }).toArray();
    const memos = vouchers.filter((v) => v.isMemo);
    await db.vouchers.bulkDelete(memos.map((v) => v.id));
    setVoucherCount((c) => c - memos.length);
  };

  const clearDatabase = async () => {
    if (!confirm('This will delete ALL data permanently. Are you sure?')) return;
    await db.companies.clear();
    await db.groups.clear();
    await db.ledgers.clear();
    await db.vouchers.clear();
    await db.members.clear();
    await db.billHeads.clear();
    await db.bills.clear();
    await db.costCentres.clear();
    window.location.reload();
  };

  if (!activeCompany) return <EmptyState title="No company selected" />;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Advanced Settings"
        subtitle="Database diagnostics, memo cleanup, and danger zone."
        actions={<Button variant="ghost" onClick={() => navigate('/setup')}>Back</Button>}
      />

      <Card className="p-4 mb-6">
        <h3 className="text-sm font-semibold mb-3">Database Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-muted">Ledgers:</span> <span className="font-semibold">{ledgerCount}</span></div>
          <div><span className="text-muted">Vouchers:</span> <span className="font-semibold">{voucherCount}</span></div>
          <div><span className="text-muted">Members:</span> <span className="font-semibold">{memberCount}</span></div>
          <div><span className="text-muted">Bills:</span> <span className="font-semibold">{billCount}</span></div>
        </div>
      </Card>

      <Card className="p-4 mb-6">
        <h3 className="text-sm font-semibold mb-2">Maintenance</h3>
        <Button variant="default" onClick={clearMemoVouchers}>Delete All Memo Vouchers</Button>
        <p className="text-xs text-muted mt-1">Removes provisional/temporary vouchers that were never posted.</p>
      </Card>

      <Card className="p-4 border-negative/30">
        <h3 className="text-sm font-semibold text-negative mb-2">Danger Zone</h3>
        <Button variant="danger" onClick={clearDatabase}>Erase All Data</Button>
        <p className="text-xs text-muted mt-1">Permanently deletes all companies, ledgers, vouchers, members, and bills. This cannot be undone.</p>
      </Card>
    </div>
  );
}

// ── Setup Index ──────────────────────────────────────────────────────────────

function SetupIndex() {
  const navigate = useNavigate();
  useScope('setup-menu');

  const items = [
    { to: '/setup/company', label: 'Company Settings', hint: 'Name, period, module flags', hotkey: '1' },
    { to: '/setup/password', label: 'Change Password', hint: 'User and superuser passwords', hotkey: '2' },
    { to: '/bills/heads', label: 'Design Bill', hint: 'Bill head columns setup', hotkey: '3' },
    { to: '/setup/advanced', label: 'Advanced', hint: 'DB stats, cleanup, danger zone', hotkey: '4' },
  ];

  for (const item of items) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkey(item.hotkey, item.label, () => navigate(item.to), { scope: 'setup-menu' });
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Setup" subtitle="Company settings, passwords, bill design, and advanced configuration." />
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

export function SetupModule() {
  return (
    <Routes>
      <Route index element={<SetupIndex />} />
      <Route path="company" element={<CompanySettingsScreen />} />
      <Route path="password" element={<PasswordScreen />} />
      <Route path="advanced" element={<AdvancedSettings />} />
      <Route path="*" element={<Navigate to="/setup" replace />} />
    </Routes>
  );
}
