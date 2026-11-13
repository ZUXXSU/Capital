// ─────────────────────────────────────────────────────────────────────────────
// Accessories module — legacy menu 7: BRS, backup/restore, reminders, labels.
//
// Bank Reconciliation Statement, data backup/restore, reminder letters, and
// mailing labels. The BRS screen is fully functional against live voucher data;
// backup/restore exports and imports the IndexedDB data as JSON.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { db } from '../../db/db';
import { useSession } from '../../store/session';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { Button, Card, EmptyState, Field, PageHeader } from '../../ui/primitives';
import { formatPaise, signed } from '../../lib/money';
import type { Ledger, Voucher, Paise } from '../../types/model';

// ── Bank Reconciliation Statement ────────────────────────────────────────────

interface BRSEntry {
  voucher: Voucher;
  amount: Paise; // signed movement on the bank ledger
  cleared: boolean;
}

function BankReconciliation() {
  const navigate = useNavigate();
  const activeCompany = useSession((s) => s.activeCompany);
  const [bankLedgers, setBankLedgers] = useState<Ledger[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [entries, setEntries] = useState<BRSEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!activeCompany) return;
    db.ledgers.where({ companyId: activeCompany.id }).toArray().then((ls) => {
      const banks = ls.filter((l) => l.isBank).sort((a, b) => a.name.localeCompare(b.name));
      setBankLedgers(banks);
      if (banks.length > 0 && !selectedBankId) setSelectedBankId(banks[0].id);
    });
  }, [activeCompany, selectedBankId]);

  const loadEntries = useCallback(async () => {
    if (!activeCompany || !selectedBankId) return;
    const vouchers = await db.vouchers.where({ companyId: activeCompany.id }).toArray();
    const brsEntries: BRSEntry[] = [];
    for (const v of vouchers) {
      if (v.isMemo) continue;
      const bankLines = v.lines.filter((l) => l.ledgerId === selectedBankId);
      if (bankLines.length === 0) continue;
      const amount = bankLines.reduce((s, l) => s + signed(l.amount, l.drCr), 0);
      brsEntries.push({ voucher: v, amount, cleared: false });
    }
    brsEntries.sort((a, b) => a.voucher.date.localeCompare(b.voucher.date));
    setEntries(brsEntries);
    setLoaded(true);
  }, [activeCompany, selectedBankId]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const toggleCleared = (idx: number) => {
    setEntries((prev) => prev.map((e, i) => i === idx ? { ...e, cleared: !e.cleared } : e));
  };

  if (!activeCompany) return <EmptyState title="No company selected" />;

  const clearedTotal = entries.filter((e) => e.cleared).reduce((s, e) => s + e.amount, 0);
  const unclearedTotal = entries.filter((e) => !e.cleared).reduce((s, e) => s + e.amount, 0);
  const bankLedger = bankLedgers.find((l) => l.id === selectedBankId);
  const bookBalance = bankLedger?.currentBalance ?? 0;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Bank Reconciliation"
        subtitle="Tick entries cleared by the bank. Space bar toggles the selected entry."
        actions={<Button variant="ghost" onClick={() => navigate('/tools')}>Back</Button>}
      />

      <Card className="p-4 mb-6">
        <div className="flex items-end gap-4">
          <Field label="Bank Account">
            <select
              className="w-full h-9 px-3 rounded-lg bg-surface border border-border text-sm"
              value={selectedBankId}
              onChange={(e) => { setSelectedBankId(e.target.value); setLoaded(false); }}
            >
              {bankLedgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <div className="text-sm">
            <div>Book Balance: <span className="tabular font-semibold">{formatPaise(bookBalance, { symbol: true })}</span></div>
            <div>Cleared: <span className="tabular font-semibold text-positive">{formatPaise(clearedTotal, { symbol: true, sign: true })}</span></div>
            <div>Uncleared: <span className="tabular font-semibold text-warning">{formatPaise(unclearedTotal, { symbol: true, sign: true })}</span></div>
          </div>
        </div>
      </Card>

      {loaded && entries.length === 0 ? (
        <EmptyState title="No bank transactions" hint="Post vouchers involving this bank account first." />
      ) : (
        <Card className="p-4">
          <div className="divide-y divide-border">
            {entries.map((e, i) => (
              <div
                key={e.voucher.id}
                className={`py-2 flex items-center justify-between text-sm cursor-pointer hover:bg-surface-2 px-2 rounded ${e.cleared ? 'opacity-60' : ''}`}
                onClick={() => toggleCleared(i)}
              >
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={e.cleared} onChange={() => toggleCleared(i)} className="accent-brand" />
                  <div>
                    <span className="font-medium">{e.voucher.date}</span>
                    <span className="text-muted ml-2">#{e.voucher.number}</span>
                    {e.voucher.chequeNo && <span className="text-muted ml-2">Chq: {e.voucher.chequeNo}</span>}
                    {e.voucher.narration && <span className="text-muted ml-2">{e.voucher.narration}</span>}
                  </div>
                </div>
                <span className={`tabular font-medium ${e.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {formatPaise(Math.abs(e.amount), { symbol: true })}
                  {e.amount >= 0 ? ' Dr' : ' Cr'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Data Backup ──────────────────────────────────────────────────────────────

function DataBackup() {
  const navigate = useNavigate();
  const activeCompany = useSession((s) => s.activeCompany);
  const [message, setMessage] = useState('');

  const doBackup = async () => {
    if (!activeCompany) return;
    const data = {
      companies: await db.companies.toArray(),
      groups: await db.groups.toArray(),
      ledgers: await db.ledgers.toArray(),
      vouchers: await db.vouchers.toArray(),
      members: await db.members.toArray(),
      billHeads: await db.billHeads.toArray(),
      bills: await db.bills.toArray(),
      costCentres: await db.costCentres.toArray(),
      exportedAt: new Date().toISOString(),
      version: '2.0.0',
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `capital-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Backup downloaded successfully.');
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Backup Data"
        subtitle="Export all data as a JSON file. Keep backups regularly."
        actions={<Button variant="ghost" onClick={() => navigate('/tools')}>Back</Button>}
      />
      <Card className="p-6 text-center">
        <p className="text-sm text-muted mb-4">
          This exports your entire database — all companies, ledgers, vouchers, members, bills — into a single JSON file.
        </p>
        <Button variant="primary" onClick={doBackup}>Download Backup</Button>
        {message && <p className="text-sm text-positive mt-3">{message}</p>}
      </Card>
    </div>
  );
}

// ── Data Restore ─────────────────────────────────────────────────────────────

function DataRestore() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const doRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setMessage('');

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.companies) {
        setError('Invalid backup file — missing version or companies data.');
        return;
      }

      // Clear existing and restore
      await db.transaction('rw',
        [db.companies, db.groups, db.ledgers, db.vouchers,
          db.members, db.billHeads, db.bills, db.costCentres],
        async () => {
          await db.companies.clear();
          await db.groups.clear();
          await db.ledgers.clear();
          await db.vouchers.clear();
          await db.members.clear();
          await db.billHeads.clear();
          await db.bills.clear();

          if (data.companies?.length) await db.companies.bulkAdd(data.companies);
          if (data.groups?.length) await db.groups.bulkAdd(data.groups);
          if (data.ledgers?.length) await db.ledgers.bulkAdd(data.ledgers);
          if (data.vouchers?.length) await db.vouchers.bulkAdd(data.vouchers);
          if (data.members?.length) await db.members.bulkAdd(data.members);
          if (data.billHeads?.length) await db.billHeads.bulkAdd(data.billHeads);
          if (data.bills?.length) await db.bills.bulkAdd(data.bills);
        },
      );
      // Cost centres handled separately (Dexie transaction arg limit)
      await db.costCentres.clear();
      if (data.costCentres?.length) await db.costCentres.bulkAdd(data.costCentres);

      setMessage(`Restored from backup (${data.exportedAt ?? 'unknown date'}). Reload the page to see updated data.`);
    } catch (err) {
      setError(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Restore Data"
        subtitle="Import a previously exported JSON backup. This replaces ALL current data."
        actions={<Button variant="ghost" onClick={() => navigate('/tools')}>Back</Button>}
      />
      <Card className="p-6 text-center">
        <p className="text-sm text-negative mb-4 font-medium">
          ⚠ This will DELETE all current data and replace it with the backup. Make a backup first.
        </p>
        <input
          type="file"
          accept=".json,application/json"
          onChange={doRestore}
          className="text-sm"
        />
        {message && <p className="text-sm text-positive mt-3">{message}</p>}
        {error && <p className="text-sm text-negative mt-3">{error}</p>}
      </Card>
    </div>
  );
}

// ── Reminder Letters ─────────────────────────────────────────────────────────

function ReminderLetters() {
  const navigate = useNavigate();
  const activeCompany = useSession((s) => s.activeCompany);
  const [members, setMembers] = useState<{ name: string; wing: string; flatNo: string; balance: Paise }[]>([]);

  useEffect(() => {
    if (!activeCompany) return;
    Promise.all([
      db.members.where({ companyId: activeCompany.id }).toArray(),
      db.ledgers.where({ companyId: activeCompany.id }).toArray(),
    ]).then(([ms, ls]) => {
      const ledgerById = new Map(ls.map((l) => [l.id, l]));
      const outstanding = ms
        .map((m) => {
          const ledger = ledgerById.get(m.ledgerId);
          return {
            name: ledger?.name ?? '—',
            wing: m.wing,
            flatNo: m.flatNo,
            balance: ledger?.currentBalance ?? 0,
          };
        })
        .filter((o) => o.balance > 0)
        .sort((a, b) => b.balance - a.balance);
      setMembers(outstanding);
    });
  }, [activeCompany]);

  if (!activeCompany) return <EmptyState title="No company selected" />;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Reminder Letters"
        subtitle="Generate reminder letters for members with outstanding dues."
        actions={<Button variant="ghost" onClick={() => navigate('/tools')}>Back</Button>}
      />

      {members.length === 0 ? (
        <EmptyState title="No outstanding dues" hint="All members are up to date — no reminders needed." />
      ) : (
        <div className="space-y-4">
          {members.map((m, i) => (
            <Card key={i} className="p-4">
              <div className="text-sm space-y-2">
                <div className="text-xs text-muted uppercase">Reminder</div>
                <p className="font-semibold">{activeCompany.name}</p>
                <p>Dear {m.name} ({m.wing}-{m.flatNo}),</p>
                <p>
                  Our records indicate that your maintenance dues of{' '}
                  <span className="font-semibold text-negative">{formatPaise(m.balance, { symbol: true })}</span>{' '}
                  remain outstanding. Kindly arrange payment at the earliest.
                </p>
                <p className="text-muted">— The Managing Committee</p>
              </div>
            </Card>
          ))}
          <p className="text-xs text-muted text-center">{members.length} reminder(s) generated</p>
        </div>
      )}
    </div>
  );
}

// ── Tools Index ──────────────────────────────────────────────────────────────

function ToolsIndex() {
  const navigate = useNavigate();
  useScope('tools-menu');

  const items = [
    { to: '/tools/brs', label: 'Bank Reconciliation', hint: 'Tick cleared bank entries', hotkey: '1' },
    { to: '/tools/backup', label: 'Backup Data', hint: 'Export all data as JSON', hotkey: '2' },
    { to: '/tools/restore', label: 'Restore Data', hint: 'Import from a backup file', hotkey: '3' },
    { to: '/tools/reminders', label: 'Reminder Letters', hint: 'Generate dues reminders', hotkey: '4' },
  ];

  for (const item of items) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkey(item.hotkey, item.label, () => navigate(item.to), { scope: 'tools-menu' });
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Accessories" subtitle="Bank reconciliation, backup/restore, reminders, and utilities." />
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

export function ToolsModule() {
  return (
    <Routes>
      <Route index element={<ToolsIndex />} />
      <Route path="brs" element={<BankReconciliation />} />
      <Route path="backup" element={<DataBackup />} />
      <Route path="restore" element={<DataRestore />} />
      <Route path="reminders" element={<ReminderLetters />} />
      <Route path="*" element={<Navigate to="/tools" replace />} />
    </Routes>
  );
}
