import { describe, it, expect, beforeEach } from 'vitest';
import {
  trialBalance, ledgerStatement, balanceSheet, incomeExpenditure, dayBook,
} from '../src/engine/balances';
import { saveVoucher, buildCashReceiptLines, buildBankReceiptLines, buildBankPaymentLines, buildJournalLines } from '../src/engine/posting';
import { makeFixture, resetDb, type Fixture } from './helpers';

let fx: Fixture;

/** Post a small realistic set of transactions (all balances stay on their natural side). */
async function postActivity(fx: Fixture) {
  // Cash receipt ₹100 of maintenance income -> Dr Cash 100, Cr Maintenance Income 100
  await saveVoucher({ companyId: fx.company.id, type: 'cash_receipt', date: '2026-04-05',
    lines: buildCashReceiptLines(fx.ledgers.cash.id, fx.ledgers.maint.id, 10000) });
  // Bank receipt ₹200 of maintenance income -> Dr Bank 200, Cr Maintenance Income 200
  await saveVoucher({ companyId: fx.company.id, type: 'bank_receipt', date: '2026-04-08',
    lines: buildBankReceiptLines(fx.ledgers.bank.id, fx.ledgers.maint.id, 20000) });
  // Pay repairs ₹60 from bank -> Dr Repairs 60, Cr Bank 60 (bank stays positive at 140)
  await saveVoucher({ companyId: fx.company.id, type: 'bank_payment', date: '2026-04-10',
    lines: buildBankPaymentLines(fx.ledgers.bank.id, fx.ledgers.repairs.id, 6000) });
  // A memo (provisional) voucher that must NOT affect final books
  await saveVoucher({ companyId: fx.company.id, type: 'memo', date: '2026-04-11',
    lines: buildJournalLines([
      { ledgerId: fx.ledgers.repairs.id, drCr: 'D', amount: 99999 },
      { ledgerId: fx.ledgers.cash.id, drCr: 'C', amount: 99999 },
    ]) });
}

beforeEach(async () => {
  await resetDb();
  fx = await makeFixture();
  await postActivity(fx);
});

describe('balances: trial balance', () => {
  it('always balances (total debit === total credit)', async () => {
    const rows = await trialBalance(fx.company.id);
    const dr = rows.reduce((s, r) => s + r.debit, 0);
    const cr = rows.reduce((s, r) => s + r.credit, 0);
    expect(dr).toBe(cr);
  });
  it('excludes memo vouchers (cash not inflated by the 999.99 memo)', async () => {
    const rows = await trialBalance(fx.company.id);
    const cash = rows.find(r => r.ledgerName === 'Cash in Hand');
    // Cash = +100 receipt only (memo ignored)
    expect(cash?.debit).toBe(10000);
  });
});

describe('balances: ledger statement', () => {
  it('produces a running balance on the cash ledger', async () => {
    const rows = await ledgerStatement(fx.company.id, fx.ledgers.cash.id);
    expect(rows.length).toBeGreaterThan(0);
    const last = rows[rows.length - 1];
    expect(last.balance).toBe(10000); // only the 100 receipt affects cash in final books
  });
  it('bank ledger ends at +140 (200 received - 60 paid)', async () => {
    const rows = await ledgerStatement(fx.company.id, fx.ledgers.bank.id);
    const last = rows[rows.length - 1];
    expect(last.balance).toBe(14000);
  });
});

describe('balances: financial statements', () => {
  it('income & expenditure shows income 300 and expense 60 with surplus 240', async () => {
    const ie = await incomeExpenditure(fx.company.id);
    expect(ie.totalIncome).toBe(30000);       // ₹100 + ₹200
    expect(ie.totalExpenditure).toBe(6000);   // ₹60
    expect(ie.surplus).toBe(24000);           // ₹240
  });
  it('balance sheet balances', async () => {
    const bs = await balanceSheet(fx.company.id);
    expect(bs.balanced).toBe(true);
  });
});

describe('balances: day book', () => {
  it('lists only final (non-memo) vouchers', async () => {
    const entries = await dayBook(fx.company.id);
    expect(entries.length).toBe(3); // 2 receipts + 1 payment, memo excluded
  });
});
