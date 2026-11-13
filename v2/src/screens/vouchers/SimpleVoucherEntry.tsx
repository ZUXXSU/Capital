// Fast entry screen for the five "two-leg" voucher types: Petty Cash, Bank
// Receipt, Bank Payment, Cash Receipt, Cash Payment. Field order mirrors the
// legacy flow (SUMMARY.md §3.8): Date -> main ledger (Bank/Cash) -> Amount ->
// other ledger (F1/F2/F4 pick) -> cheque/bank fields (bank types only) ->
// narration -> Save. Enter advances fields, Esc cancels, Ctrl+S saves.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Ledger, Paise } from '../../types/model';
import { Button, Card, EmptyState, Field, Input } from '../../ui/primitives';
import { formatPaise, parsePaise } from '../../lib/money';
import { useHotkey, useScope } from '../../keyboard/HotkeyProvider';
import { LedgerPicker } from './LedgerPicker';
import {
  buildBankPaymentLines,
  buildBankReceiptLines,
  buildCashPaymentLines,
  buildCashReceiptLines,
  buildPettyCashLines,
  saveVoucher,
  PostingError,
} from '../../engine/posting';

type SimpleType = 'petty_cash' | 'bank_receipt' | 'bank_payment' | 'cash_receipt' | 'cash_payment';

const CONFIG: Record<SimpleType, {
  title: string;
  mainLabel: string;
  mainFilter: (l: Ledger) => boolean;
  otherLabel: string;
  showBankFields: boolean;
  build: (mainLedgerId: string, otherLedgerId: string, amount: Paise, narration?: string) => ReturnType<typeof buildBankPaymentLines>;
}> = {
  petty_cash: {
    title: 'Petty Cash Voucher',
    mainLabel: 'Petty Cash Ledger',
    mainFilter: (l) => !l.isBank,
    otherLabel: 'Paid Towards (Account)',
    showBankFields: false,
    build: buildPettyCashLines,
  },
  bank_receipt: {
    title: 'Bank Receipt',
    mainLabel: 'Bank',
    mainFilter: (l) => l.isBank,
    otherLabel: 'Received From',
    showBankFields: true,
    build: buildBankReceiptLines,
  },
  bank_payment: {
    title: 'Bank Payment',
    mainLabel: 'Bank',
    mainFilter: (l) => l.isBank,
    otherLabel: 'Paid To',
    showBankFields: true,
    build: buildBankPaymentLines,
  },
  cash_receipt: {
    title: 'Cash Receipt',
    mainLabel: 'Cash Ledger',
    mainFilter: (l) => !l.isBank,
    otherLabel: 'Received From',
    showBankFields: false,
    build: buildCashReceiptLines,
  },
  cash_payment: {
    title: 'Cash Payment',
    mainLabel: 'Cash Ledger',
    mainFilter: (l) => !l.isBank,
    otherLabel: 'Paid To',
    showBankFields: false,
    build: buildCashPaymentLines,
  },
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function focusField(id: string) {
  document.getElementById(id)?.focus();
}

export function SimpleVoucherEntry({
  type,
  companyId,
  ledgers,
  onSaved,
}: {
  type: SimpleType;
  companyId: string;
  ledgers: Ledger[];
  onSaved: (voucherNumber: number) => void;
}) {
  useScope('voucher-entry');
  const navigate = useNavigate();
  const cfg = CONFIG[type];

  // Field ids are namespaced per voucher type so Enter-to-advance works even
  // if several SimpleVoucherEntry instances are ever mounted at once.
  const amountId = `amount-${type}`;
  const otherLedgerId_ = `other-ledger-${type}`;
  const chequeNoId = `cheque-no-${type}`;
  const chequeDateId = `cheque-date-${type}`;
  const bankNameId = `bank-name-${type}`;
  const narrationId = `narration-${type}`;

  const [date, setDate] = useState(today());
  const [mainLedgerId, setMainLedgerId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [otherLedgerId, setOtherLedgerId] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [bankName, setBankName] = useState('');
  const [narration, setNarration] = useState('');
  const [status, setStatus] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const amount = parsePaise(amountStr || '0');
  const ready = !!mainLedgerId && !!otherLedgerId && amount > 0 && !!date;

  function reset() {
    setDate(today());
    setMainLedgerId('');
    setAmountStr('');
    setOtherLedgerId('');
    setChequeNo('');
    setChequeDate('');
    setBankName('');
    setNarration('');
  }

  async function handleSave() {
    if (saving) return;
    if (!ready) {
      setStatus({ tone: 'negative', text: 'Fill the ledger, amount and date before saving.' });
      return;
    }
    setSaving(true);
    try {
      const lines = cfg.build(mainLedgerId, otherLedgerId, amount, narration || undefined);
      const voucher = await saveVoucher({
        companyId,
        type,
        date,
        narration: narration || undefined,
        chequeNo: cfg.showBankFields ? chequeNo || undefined : undefined,
        chequeDate: cfg.showBankFields ? chequeDate || undefined : undefined,
        bankName: cfg.showBankFields ? bankName || undefined : undefined,
        lines,
      });
      setStatus({ tone: 'positive', text: `Saved — ${cfg.title} #${voucher.number}.` });
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

  const otherLedgers = useMemo(() => ledgers, [ledgers]);
  const mainLedgers = useMemo(() => ledgers.filter(cfg.mainFilter), [ledgers, cfg]);

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
    <Card className="p-5 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">{cfg.title}</h2>
        <span className={`text-xs font-medium ${ready ? 'text-positive' : 'text-muted'}`}>
          {ready ? '● Dr / Cr balanced' : '○ incomplete'}
        </span>
      </div>

      {status && (
        <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${status.tone === 'positive' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}>
          {status.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Date">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && focusField(amountId)}
          />
        </Field>

        <div />

        <LedgerPicker
          label={cfg.mainLabel}
          ledgers={mainLedgers}
          value={mainLedgerId}
          onChange={setMainLedgerId}
          onEnterNext={() => focusField(amountId)}
        />

        <Field label="Amount">
          <Input
            id={amountId}
            inputMode="decimal"
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                focusField(otherLedgerId_);
              }
            }}
          />
          {amount > 0 && <span className="block text-xs text-muted mt-1 tabular">= {formatPaise(amount, { symbol: true })}</span>}
        </Field>

        <div className="col-span-2">
          <LedgerPicker
            label={cfg.otherLabel}
            ledgers={otherLedgers}
            value={otherLedgerId}
            onChange={setOtherLedgerId}
            inputRef={(el) => { if (el) el.id = otherLedgerId_; }}
            onEnterNext={() => focusField(cfg.showBankFields ? chequeNoId : narrationId)}
          />
        </div>

        {cfg.showBankFields && (
          <>
            <Field label="Cheque No.">
              <Input
                id={chequeNoId}
                value={chequeNo}
                onChange={(e) => setChequeNo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && focusField(chequeDateId)}
              />
            </Field>
            <Field label="Cheque Date">
              <Input
                id={chequeDateId}
                type="date"
                value={chequeDate}
                onChange={(e) => setChequeDate(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && focusField(bankNameId)}
              />
            </Field>
            <div className="col-span-2">
              <Field label="Bank Name">
                <Input
                  id={bankNameId}
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && focusField(narrationId)}
                />
              </Field>
            </div>
          </>
        )}

        <div className="col-span-2">
          <Field label="Narration">
            <Input
              id={narrationId}
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={reset} hotkey="Esc">Clear</Button>
        <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !ready} hotkey="⌃S">Save</Button>
      </div>
    </Card>
  );
}
