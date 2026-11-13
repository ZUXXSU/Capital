// Journal / Memo entry screen — arbitrary multi-line balanced postings
// (SUMMARY.md §3.8: "Date -> Account to Debit -> Amount -> Account to Credit
// -> Narration -> Save"). Memo vouchers use the identical screen but are
// flagged isMemo=true and are bulk-deletable (legacy Setup -> Delete Memo Vou).
import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DrCr, Ledger } from '../../types/model';
import { Button, Card, EmptyState, Field, Input } from '../../ui/primitives';
import { formatPaise, parsePaise } from '../../lib/money';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { LedgerPicker } from './LedgerPicker';
import { buildJournalLines, saveVoucher, PostingError } from '../../engine/posting';

interface DraftLine {
  key: string;
  ledgerId: string;
  drCr: DrCr;
  amountStr: string;
  narration: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankLine(key: string, drCr: DrCr): DraftLine {
  return { key, ledgerId: '', drCr, amountStr: '', narration: '' };
}

export function JournalVoucherEntry({
  isMemo,
  companyId,
  ledgers,
  onSaved,
}: {
  isMemo: boolean;
  companyId: string;
  ledgers: Ledger[];
  onSaved: (voucherNumber: number) => void;
}) {
  useScope('voucher-entry');
  const navigate = useNavigate();
  const instanceId = useId();
  const title = isMemo ? 'Memo Voucher' : 'Journal Voucher';

  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    blankLine(`${instanceId}-0`, 'D'),
    blankLine(`${instanceId}-1`, 'C'),
  ]);
  const [status, setStatus] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      const amt = parsePaise(l.amountStr || '0');
      if (l.drCr === 'D') debit += amt;
      else credit += amt;
    }
    return { debit, credit, diff: debit - credit };
  }, [lines]);

  const linesReady = lines.every((l) => l.ledgerId && parsePaise(l.amountStr || '0') > 0) && lines.length >= 2;
  const balanced = totals.diff === 0 && totals.debit > 0;
  const ready = linesReady && balanced && !!date;

  function reset() {
    setDate(today());
    setReference('');
    setNarration('');
    setLines([blankLine(`${instanceId}-${Date.now()}-0`, 'D'), blankLine(`${instanceId}-${Date.now()}-1`, 'C')]);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, blankLine(`${instanceId}-${Date.now()}`, 'D')]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 2 ? prev.filter((l) => l.key !== key) : prev));
  }

  async function handleSave() {
    if (saving) return;
    if (!ready) {
      setStatus({ tone: 'negative', text: 'Lines must all have a ledger + amount, and debits must equal credits.' });
      return;
    }
    setSaving(true);
    try {
      const builtLines = buildJournalLines(
        lines.map((l) => ({ ledgerId: l.ledgerId, drCr: l.drCr, amount: parsePaise(l.amountStr || '0'), narration: l.narration || undefined })),
      );
      const voucher = await saveVoucher({
        companyId,
        type: isMemo ? 'memo' : 'journal',
        date,
        narration: narration || undefined,
        reference: reference || undefined,
        isMemo,
        lines: builtLines,
      });
      setStatus({ tone: 'positive', text: `Saved — ${title} #${voucher.number}.` });
      onSaved(voucher.number);
      reset();
    } catch (err) {
      const msg = err instanceof PostingError ? err.message : 'Could not save this voucher.';
      setStatus({ tone: 'negative', text: msg });
    } finally {
      setSaving(false);
    }
  }

  useHotkey('ctrl+s', 'Save voucher', () => void handleSave(), { scope: 'voucher-entry', whenTyping: true });
  useHotkey('esc', 'Clear form', () => reset(), { scope: 'voucher-entry', whenTyping: true });

  if (ledgers.length === 0) {
    return (
      <EmptyState
        title="No ledgers yet"
        hint="Create ledger accounts in Masters before entering vouchers."
        action={<Button variant="primary" onClick={() => navigate('/masters')}>Go to Masters</Button>}
      />
    );
  }

  return (
    <Card className="p-5 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">{title}</h2>
        <span className={`text-xs font-medium ${balanced && totals.debit > 0 ? 'text-positive' : 'text-muted'}`}>
          {balanced && totals.debit > 0 ? '● Dr / Cr balanced' : `○ difference ${formatPaise(Math.abs(totals.diff), { symbol: true })}`}
        </span>
      </div>

      {status && (
        <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${status.tone === 'positive' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}>
          {status.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Reference No. (optional)">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>

      <div className="space-y-3">
        {lines.map((line) => (
          <div key={line.key} className="grid grid-cols-[1fr_84px_160px_auto] gap-2 items-end rounded-lg border border-border p-2">
            <LedgerPicker label="Ledger" ledgers={ledgers} value={line.ledgerId} onChange={(id) => updateLine(line.key, { ledgerId: id })} />
            <Field label="Dr/Cr">
              <select
                value={line.drCr}
                onChange={(e) => updateLine(line.key, { drCr: e.target.value as DrCr })}
                className="w-full h-9 px-2 rounded-lg bg-surface border border-border text-sm text-fg focus:border-brand focus:outline-none"
              >
                <option value="D">Dr</option>
                <option value="C">Cr</option>
              </select>
            </Field>
            <Field label="Amount">
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={line.amountStr}
                onChange={(e) => updateLine(line.key, { amountStr: e.target.value })}
              />
            </Field>
            <Button variant="ghost" size="sm" onClick={() => removeLine(line.key)} disabled={lines.length <= 2}>
              Remove
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3">
        <Button variant="default" size="sm" onClick={addLine}>+ Add Line</Button>
        <div className="text-xs text-muted tabular">
          Dr {formatPaise(totals.debit, { symbol: true })} &nbsp;·&nbsp; Cr {formatPaise(totals.credit, { symbol: true })}
        </div>
      </div>

      <div className="mt-4">
        <Field label="Narration">
          <Input value={narration} onChange={(e) => setNarration(e.target.value)} />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={reset} hotkey="Esc">Clear</Button>
        <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !ready} hotkey="⌃S">Save</Button>
      </div>
    </Card>
  );
}
